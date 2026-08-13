import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  PatientCodeKind,
  PatientHandoffRecord,
  PatientHandoffUpsertInput,
} from "@glymize/contracts";

interface StoredPatientHandoffRecord {
  patientCodeHash: string;
  patientCodeKind: PatientCodeKind;
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface PatientHandoffStore {
  schemaVersion: 2;
  records: StoredPatientHandoffRecord[];
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toAsciiDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const p = PERSIAN_DIGITS.indexOf(digit);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(digit);
    return a >= 0 ? String(a) : digit;
  });
}

function normalizeCode(value: string) {
  return toAsciiDigits(value).trim().toUpperCase().replace(/[\s\-_/\\.]+/g, "");
}

function isValidIranianNationalId(value: string) {
  const code = normalizeCode(value);
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const check = Number(code[9]);
  const sum = code.slice(0, 9).split("").reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return check === (remainder < 2 ? remainder : 11 - remainder);
}

function requireSecret(name: "hash" | "encryption") {
  const value = name === "hash"
    ? (process.env.PATIENT_HANDOFF_HASH_KEY ?? process.env.PATIENT_HANDOFF_TOKEN)
    : (process.env.PATIENT_HANDOFF_ENCRYPTION_KEY ?? process.env.PATIENT_HANDOFF_HASH_KEY ?? process.env.PATIENT_HANDOFF_TOKEN);
  if (!value) throw new Error(name === "hash" ? "PATIENT_HANDOFF_HASH_KEY_NOT_CONFIGURED" : "PATIENT_HANDOFF_ENCRYPTION_KEY_NOT_CONFIGURED");
  return value;
}

function hashCode(kind: PatientCodeKind, normalized: string) {
  return createHmac("sha256", requireSecret("hash")).update(`${kind}:${normalized}`, "utf8").digest("hex");
}

function encryptionKey() {
  return createHash("sha256").update(requireSecret("encryption"), "utf8").digest();
}

function encryptRecord(record: PatientHandoffRecord, patientCodeHash: string): StoredPatientHandoffRecord {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(patientCodeHash, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record), "utf8"), cipher.final()]);
  return {
    patientCodeHash,
    patientCodeKind: record.patientCodeKind,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptRecord(record: StoredPatientHandoffRecord): PatientHandoffRecord {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "base64"));
  decipher.setAAD(Buffer.from(record.patientCodeHash, "utf8"));
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as PatientHandoffRecord;
}

function maskCode(normalized: string) {
  const visible = normalized.slice(-4);
  return `${"•".repeat(Math.max(4, Math.min(8, normalized.length - visible.length)))}${visible}`;
}

@Injectable()
export class PatientHandoffService {
  private readonly filePath = process.env.PATIENT_HANDOFF_DATA_PATH
    ? resolve(process.env.PATIENT_HANDOFF_DATA_PATH)
    : resolve(process.cwd(), ".local-data", "patient-handoffs.json");

  private writeChain: Promise<void> = Promise.resolve();

  private async readStore(): Promise<PatientHandoffStore> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PatientHandoffStore>;
      if (parsed.schemaVersion !== 2) throw new Error("PATIENT_HANDOFF_STORE_VERSION_UNSUPPORTED");
      return { schemaVersion: 2, records: Array.isArray(parsed.records) ? parsed.records : [] };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") return { schemaVersion: 2, records: [] };
      throw error;
    }
  }

  private async writeStore(store: PatientHandoffStore) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await rename(temp, this.filePath);
  }

  async upsert(input: PatientHandoffUpsertInput): Promise<PatientHandoffRecord> {
    const normalized = normalizeCode(input.patientCode);
    if (normalized.length < 3 || normalized.length > 64) throw new Error("INVALID_PATIENT_CODE");
    if (input.patientCodeKind === "national_id" && !isValidIranianNationalId(normalized)) throw new Error("INVALID_NATIONAL_ID");
    const patientCodeHash = hashCode(input.patientCodeKind, normalized);
    let saved!: PatientHandoffRecord;

    // A failed disk write must not poison every later handoff save. Recover the queue, then serialize the next write.
    this.writeChain = this.writeChain.catch(() => undefined).then(async () => {
      const store = await this.readStore();
      const existingIndex = store.records.findIndex((item) => item.patientCodeHash === patientCodeHash);
      const existing = existingIndex >= 0 ? decryptRecord(store.records[existingIndex]!) : undefined;
      const now = new Date().toISOString();
      saved = {
        id: existing?.id ?? randomUUID(),
        patientCodeKind: input.patientCodeKind,
        patientCodeDisplay: maskCode(normalized),
        firstName: input.firstName?.trim() || undefined,
        lastName: input.lastName?.trim() || undefined,
        status: input.status ?? "ready_for_physician",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        revision: (existing?.revision ?? 0) + 1,
        vitals: input.vitals ?? {},
        clinicalFlags: input.clinicalFlags ?? {},
        labs: input.labs ?? [],
        medications: input.medications ?? [],
        nurseNotes: input.nurseNotes?.trim() || undefined,
        ocrText: input.ocrText,
      };
      const encrypted = encryptRecord(saved, patientCodeHash);
      if (existingIndex >= 0) store.records[existingIndex] = encrypted;
      else store.records.push(encrypted);
      await this.writeStore(store);
    });
    await this.writeChain;
    return saved;
  }

  async lookup(patientCode: string): Promise<PatientHandoffRecord | undefined> {
    const normalized = normalizeCode(patientCode);
    if (!normalized) return undefined;
    const possible = new Set(((["file_number", "national_id", "other"] as PatientCodeKind[]).map((kind) => hashCode(kind, normalized))));
    const store = await this.readStore();
    const matches = store.records.filter((record) => record.patientCodeHash && possible.has(record.patientCodeHash));
    if (matches.length > 1) throw new Error("AMBIGUOUS_PATIENT_CODE");
    return matches[0] ? decryptRecord(matches[0]) : undefined;
  }
}
