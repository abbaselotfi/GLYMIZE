import { describe, expect, it } from "vitest";
import { bundledClinicalRulePack } from "../src/rule-pack.js";
import { activeGuidelineSources } from "../src/guideline-registry.js";
import {
  constantTimeEqual,
  decryptClinicalPayload,
  encryptClinicalPayload,
  normalizeIranMobile,
  normalizeMedicalCouncilCode,
  normalizePatientCode,
  openPayload,
  randomToken,
  sanitizeAssistantPermissions,
  sealPayload,
  validateIranianNationalId,
} from "../../../apps/admin-worker/src/runtime-security.js";
import {
  RUNTIME_RULE_IDS,
  RUNTIME_RULE_PACK_VERSION,
  RUNTIME_SOURCE_IDS,
  evidenceForQuestion,
} from "../../../apps/admin-worker/src/runtime-evidence.js";

function validNationalId(prefix9: string) {
  const sum = prefix9.split("").reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return `${prefix9}${remainder < 2 ? remainder : 11 - remainder}`;
}

describe("GLYMIZE runtime security primitives", () => {
  it("normalizes Persian/Arabic identity digits without accepting junk", () => {
    expect(normalizeMedicalCouncilCode(" ۱۲۳-٤٥٦ ")).toBe("123456");
    expect(normalizeIranMobile("+98 912 123 4567")).toBe("09121234567");
    expect(normalizePatientCode(" ab-۱۲ / ٣ ")).toBe("AB123");
  });

  it("validates Iranian national-id checksum", () => {
    const code = validNationalId("123456789");
    expect(validateIranianNationalId(code)).toBe(true);
    expect(validateIranianNationalId(`${code.slice(0, 9)}${(Number(code[9]) + 1) % 10}`)).toBe(false);
    expect(validateIranianNationalId("1111111111")).toBe(false);
  });

  it("whitelists assistant permissions and drops unknown/admin capabilities", () => {
    expect(sanitizeAssistantPermissions(["dashboard", "handoff.write", "admin", "dashboard"]))
      .toEqual(["dashboard", "handoff.write"]);
  });

  it("generates high-entropy opaque tokens", () => {
    const first = randomToken(32);
    const second = randomToken(32);
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(/^[A-Za-z0-9_-]+$/.test(first)).toBe(true);
  });

  it("seals access payloads with context separation", async () => {
    const secret = "session-secret-long-enough-for-tests-123456";
    const sealed = await sealPayload({ userId: "u1", expiresAt: 123 }, secret, "ACCESS-A");
    expect(await openPayload(sealed, secret, "ACCESS-A")).toEqual({ userId: "u1", expiresAt: 123 });
    expect(await openPayload(sealed, secret, "ACCESS-B")).toBeNull();
    expect(await openPayload(sealed, `${secret}x`, "ACCESS-A")).toBeNull();
  });

  it("encrypts clinical payloads with AES-GCM and binds ciphertext to practice/patient AAD", async () => {
    const secret = "clinical-master-secret-long-enough-1234567890";
    const aad = "practice-1:patient-hmac";
    const payload = { firstName: "Test", labs: [{ name: "HbA1c", value: 7.2 }] };
    const encrypted = await encryptClinicalPayload(payload, secret, aad);
    expect(encrypted.ciphertext).not.toContain("HbA1c");
    expect(await decryptClinicalPayload(encrypted, secret, aad)).toEqual(payload);
    expect(await decryptClinicalPayload(encrypted, secret, "practice-2:patient-hmac")).toBeNull();
    expect(await decryptClinicalPayload(encrypted, `${secret}!`, aad)).toBeNull();
  });

  it("uses fixed-work comparison for secret-derived strings", async () => {
    await expect(constantTimeEqual("abcdef", "abcdef")).resolves.toBe(true);
    await expect(constantTimeEqual("abcdef", "abcdeg")).resolves.toBe(false);
    await expect(constantTimeEqual("short", "longer-value")).resolves.toBe(false);
  });
});

describe("online Evidence Assistant snapshot safety", () => {
  it("is pinned to the active approved Rule Pack and evidence registry", () => {
    expect(RUNTIME_RULE_PACK_VERSION).toBe(bundledClinicalRulePack.version);
    expect([...RUNTIME_RULE_IDS].sort()).toEqual(bundledClinicalRulePack.rules.map((rule) => rule.id).sort());
    expect([...RUNTIME_SOURCE_IDS].sort()).toEqual(activeGuidelineSources.map((source) => source.id).sort());
  });

  it("cites the current REZDIFFRA label for online resmetirom MASH evidence", () => {
    const evidence = evidenceForQuestion("دوز resmetirom در MASH F2 F3 چیست؟");
    const hit = evidence.find((item) => item.ruleId === "T2-LIVER-002");
    expect(hit).toBeDefined();
    expect(hit?.citations.map((citation) => citation.sourceId)).toContain("US-LABEL-REZDIFFRA-2026-07");
  });
});
