import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createClinicalPayloadDecryptor,
  decryptClinicalPayload,
  encryptClinicalPayload,
} from "../src/runtime-security";
import { measureRuntimeReadDecryption, RuntimeReadMetricsCollector } from "../src/runtime-read-metrics";

const secret = "synthetic-clinical-key";
const aad = "patient-observation:practice-1:observation-1";
afterEach(() => vi.restoreAllMocks());

describe("R29-04-A request-owned clinical keys", () => {
  it("derives lazily and shares exactly one non-extractable decrypt-only key, even concurrently", async () => {
    const payload = await encryptClinicalPayload({ value: 7.2 }, secret, aad);
    const imports = vi.spyOn(crypto.subtle, "importKey");
    const digest = vi.spyOn(crypto.subtle, "digest");
    const decrypt = createClinicalPayloadDecryptor(secret);
    expect(imports).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
    const values = await Promise.all(Array.from({ length: 80 }, () => decrypt(payload, aad)));
    expect(values.every(value => JSON.stringify(value) === '{"value":7.2}')).toBe(true);
    expect(imports).toHaveBeenCalledTimes(1);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(imports.mock.calls[0]?.slice(2)).toEqual([{ name: "AES-GCM" }, false, ["decrypt"]]);
    const key = await imports.mock.results[0]?.value;
    expect(key.extractable).toBe(false);
    expect(key.usages).toEqual(["decrypt"]);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("retains independent requests and changed-secret behavior without a global key cache", async () => {
    const oldPayload = await encryptClinicalPayload({ value: 1 }, secret, aad);
    const rotatedPayload = await encryptClinicalPayload({ value: 2 }, "rotated-secret", aad);
    const imports = vi.spyOn(crypto.subtle, "importKey");
    const first = createClinicalPayloadDecryptor(secret);
    const second = createClinicalPayloadDecryptor(secret);
    const rotated = createClinicalPayloadDecryptor("rotated-secret");
    expect(await first(oldPayload, aad)).toEqual({ value: 1 });
    expect(await second(oldPayload, aad)).toEqual({ value: 1 });
    expect(await rotated(rotatedPayload, aad)).toEqual({ value: 2 });
    expect(await rotated(oldPayload, aad)).toBeNull();
    expect(await first(rotatedPayload, aad)).toBeNull();
    expect(imports).toHaveBeenCalledTimes(3);
    const keys = await Promise.all(imports.mock.results.map(result => result.value));
    expect(new Set(keys).size).toBe(3);
  });

  it.each(["practice", "record", "ciphertext", "tag", "iv"])("preserves fail-closed %s mismatch and can read the next valid row", async mismatch => {
    const payload = await encryptClinicalPayload({ value: "فارسی" }, secret, aad);
    const candidate = { ...payload };
    let candidateAad = aad;
    if (mismatch === "practice") candidateAad = aad.replace("practice-1", "practice-2");
    if (mismatch === "record") candidateAad = aad.replace("observation-1", "observation-2");
    if (mismatch === "ciphertext") candidate.ciphertext = "!invalid";
    if (mismatch === "iv") candidate.iv = "!invalid";
    if (mismatch === "tag") candidate.authTag = (candidate.authTag.startsWith("A") ? "B" : "A") + candidate.authTag.slice(1);
    const decrypt = createClinicalPayloadDecryptor(secret);
    expect(await decryptClinicalPayload(candidate, secret, candidateAad)).toBeNull();
    expect(await decrypt(candidate, candidateAad)).toBeNull();
    expect(await decrypt(payload, aad)).toEqual({ value: "فارسی" });
  });

  it("does not retry a failed key derivation in the same request or poison the next request", async () => {
    const payload = await encryptClinicalPayload({ value: 1 }, secret, aad);
    const digest = vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(new Error("synthetic key failure"));
    const decrypt = createClinicalPayloadDecryptor(secret);
    expect(await Promise.all([decrypt(payload, aad), decrypt(payload, aad)])).toEqual([null, null]);
    expect(await decrypt(payload, aad)).toBeNull();
    expect(digest).toHaveBeenCalledTimes(1);
    expect(await createClinicalPayloadDecryptor(secret)(payload, aad)).toEqual({ value: 1 });
    expect(digest).toHaveBeenCalledTimes(2);
  });

  it("reduces 80 legacy imports to one without caching plaintext or changing decryption accounting", async () => {
    const payload = await encryptClinicalPayload({ value: 1 }, secret, aad);
    const imports = vi.spyOn(crypto.subtle, "importKey");
    for (let i = 0; i < 80; i++) await decryptClinicalPayload(payload, secret, aad);
    expect(imports).toHaveBeenCalledTimes(80);
    imports.mockClear();
    const metrics = new RuntimeReadMetricsCollector();
    const decrypt = createClinicalPayloadDecryptor(secret);
    const first = await measureRuntimeReadDecryption(metrics, () => decrypt<{ value: number }>(payload, aad));
    first!.value = 99;
    for (let i = 1; i < 80; i++) {
      expect(await measureRuntimeReadDecryption(metrics, () => decrypt(payload, aad))).toEqual({ value: 1 });
    }
    expect(imports).toHaveBeenCalledTimes(1);
    expect(metrics.finish({})).toMatchObject({ decryptionCount: 80, decryptionFailureCount: 0, queryCount: 0 });
  });

  it("records a bounded paired local benchmark without claiming Worker CPU or replica latency", async () => {
    const fixtures = await Promise.all(Array.from({ length: 80 }, async (_, index) => ({
      aad: `${aad}-${index}`,
      encrypted: await encryptClinicalPayload({ value: index, unit: "synthetic" }, secret, `${aad}-${index}`),
    })));
    const samples: Record<"legacy" | "request", Array<{ wallMs: number; nodeCpuMs: number }>> = { legacy: [], request: [] };
    for (let round = 0; round < 7; round++) {
      for (const mode of (round % 2 ? ["request", "legacy"] : ["legacy", "request"]) as Array<"legacy" | "request">) {
        const decrypt = mode === "request" ? createClinicalPayloadDecryptor(secret)
          : (payload: typeof fixtures[number]["encrypted"], rowAad: string) => decryptClinicalPayload(payload, secret, rowAad);
        const cpu = process.cpuUsage();
        const started = performance.now();
        const results = [];
        for (const fixture of fixtures) results.push(await decrypt(fixture.encrypted, fixture.aad));
        const wallMs = performance.now() - started;
        const elapsedCpu = process.cpuUsage(cpu);
        samples[mode].push({ wallMs, nodeCpuMs: (elapsedCpu.user + elapsedCpu.system) / 1000 });
        expect(results).toEqual(fixtures.map((_, value) => ({ value, unit: "synthetic" })));
      }
    }
    const fingerprint = createHash("sha256").update(readFileSync(new URL("../src/runtime-security.ts", import.meta.url))).digest("hex");
    process.stdout.write("R29_04_KEY_REUSE_BENCH " + JSON.stringify({
      kind: "local-node-webcrypto-paired", node: process.version, sourceFingerprint: fingerprint,
      rowsPerRequest: 80, rounds: 7, firstRoundIsWarmup: true, samples,
      workerCpuMs: null, d1LatencyMs: null, remoteRequests: 0,
    }) + "\n");
  }, 30_000);
});
