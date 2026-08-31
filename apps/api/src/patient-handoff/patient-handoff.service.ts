import { Injectable } from "@nestjs/common";
import {
  createDecipheriv,
  createHash,
  createHmac,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  PatientCodeKind,
  PatientHandoffRecord,
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

@Injectable()
export class PatientHandoffService {
  private readonly filePath = process.env.PATIENT_HANDOFF_DATA_PATH
    ? resolve(process.env.PATIENT_HANDOFF_DATA_PATH)
    : resolve(process.cwd(), ".local-data", "patient-handoffs.json");


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
