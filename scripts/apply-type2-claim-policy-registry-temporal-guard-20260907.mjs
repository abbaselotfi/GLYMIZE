import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const selfPath = fileURLToPath(import.meta.url);
const full = (rel) => path.join(root, rel);
const read = (rel) => fs.readFileSync(full(rel), "utf8");
const write = (rel, content) => fs.writeFileSync(full(rel), content, "utf8");

function replaceOnce(rel, oldText, newText) {
  const source = read(rel);
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`Expected source block not found: ${rel}`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Expected source block occurs more than once: ${rel}`);
  }
  write(rel, source.slice(0, first) + newText + source.slice(first + oldText.length));
}

replaceOnce(
  "apps/admin-worker/src/type2-claim-policy-registry.ts",
  "  return input.map((entry, index) => {\n",
  "  const validated = input.map((entry, index) => {\n",
);

replaceOnce(
  "apps/admin-worker/src/type2-claim-policy-registry.ts",
  `  });\n}\n\nexport function reviewedType2ClaimPolicies() {\n  return validateReviewedType2ClaimPolicies(REVIEWED_TYPE2_CLAIM_POLICIES);\n}\n`,
  `  });\n\n  const seenIds = new Set<string>();\n  const seenTargets = new Set<string>();\n  for (const policy of validated) {\n    if (seenIds.has(policy.id)) {\n      throw new Error(\`TYPE2_CLAIM_POLICY_DUPLICATE_ID:\${policy.id}\`);\n    }\n    seenIds.add(policy.id);\n    const target = policy.productId\n      ? \`product:\${policy.productId}\`\n      : \`master:\${policy.masterDrugId}\`;\n    const targetKey = \`\${policy.provider}:\${target}\`;\n    if (seenTargets.has(targetKey)) {\n      throw new Error(\`TYPE2_CLAIM_POLICY_DUPLICATE_TARGET:\${targetKey}\`);\n    }\n    seenTargets.add(targetKey);\n  }\n  return validated;\n}\n\nexport function reviewedType2ClaimPolicies(now = Date.now()) {\n  return validateReviewedType2ClaimPolicies(REVIEWED_TYPE2_CLAIM_POLICIES)\n    .filter((policy) => Date.parse(policy.effectiveAt) <= now);\n}\n`,
);

replaceOnce(
  "apps/admin-worker/test/type2-claim-policy-boundary.test.ts",
  `  it("fails closed on malformed timing configuration", () => {\n`,
  `  it("rejects duplicate provider/target authority", () => {\n    const policy = {\n      id: "one",\n      provider: "social_security",\n      productId: "WEGOVY-025",\n      effectiveAt: "2026-09-01T00:00:00.000Z",\n      sourceReference: "reviewed-policy",\n      claimTiming: {\n        groupKey: "wegovy",\n        windowDays: 30,\n        maxClaimsPerWindow: 2,\n        minimumDaysBetweenClaims: 28,\n        allowDistinctProductsWithinWindow: true,\n      },\n    };\n    expect(() => validateReviewedType2ClaimPolicies([\n      policy,\n      { ...policy, id: "two" },\n    ])).toThrow(/TYPE2_CLAIM_POLICY_DUPLICATE_TARGET/);\n  });\n\n  it("fails closed on malformed timing configuration", () => {\n`,
);

fs.unlinkSync(selfPath);
console.log("TYPE2_CLAIM_POLICY_TEMPORAL_GUARD_APPLIED");
