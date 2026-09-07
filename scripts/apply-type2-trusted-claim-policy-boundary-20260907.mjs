import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const selfPath = fileURLToPath(import.meta.url);

function full(rel) {
  return path.join(root, rel);
}

function read(rel) {
  return fs.readFileSync(full(rel), "utf8");
}

function write(rel, content) {
  const target = full(rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { encoding: "utf8" });
}

function replaceOnce(rel, oldText, newText) {
  const source = read(rel);
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`Expected source block not found: ${rel}`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Expected source block occurs more than once: ${rel}`);
  }
  write(rel, source.slice(0, first) + newText + source.slice(first + oldText.length));
}

function createOnly(rel, content) {
  if (fs.existsSync(full(rel))) throw new Error(`Refusing to overwrite existing file: ${rel}`);
  write(rel, content);
}

replaceOnce(
  "packages/clinical-engine/src/decision-graph-v2/index.ts",
  'export * from "./insurance.js";\n',
  'export * from "./insurance.js";\nexport * from "./insurance-claims.js";\nexport * from "./reviewed-insurance-policy-merge.js";\n',
);

createOnly(
  "packages/clinical-engine/src/decision-graph-v2/reviewed-insurance-policy-merge.ts",
  `import type { ClaimsAwareInsurancePolicyRuleV2 } from "./insurance-claims.js";\nimport type { DecisionGraphInventoryV2, InsurancePolicyRuleV2 } from "./types.js";\n\nfunction samePolicyTarget(\n  reviewed: ClaimsAwareInsurancePolicyRuleV2,\n  imported: InsurancePolicyRuleV2,\n) {\n  if (reviewed.provider !== imported.provider) return false;\n  if (reviewed.productId) return reviewed.productId === imported.productId;\n  return Boolean(\n    reviewed.masterDrugId &&\n    imported.masterDrugId &&\n    reviewed.masterDrugId === imported.masterDrugId\n  );\n}\n\n/**\n * Adds only reviewed claim-timing metadata to an existing imported financial\n * policy. Timing authority never invents financial coverage, so unmatched\n * reviewed rules are ignored and ordinary coverage remains mandatory.\n */\nexport function mergeReviewedInsurancePoliciesV2(\n  importedPolicies: readonly InsurancePolicyRuleV2[],\n  reviewedPolicies: readonly ClaimsAwareInsurancePolicyRuleV2[],\n): ClaimsAwareInsurancePolicyRuleV2[] {\n  return importedPolicies.map((imported) => {\n    const reviewed = reviewedPolicies.find((candidate) =>\n      samePolicyTarget(candidate, imported)\n    );\n    if (!reviewed?.claimTiming) return { ...imported };\n    return {\n      ...imported,\n      id: reviewed.id,\n      claimTiming: structuredClone(reviewed.claimTiming),\n      ...(reviewed.effectiveAt ? { effectiveAt: reviewed.effectiveAt } : {}),\n      ...(reviewed.sourceUrl ? { sourceUrl: reviewed.sourceUrl } : {}),\n      ...(reviewed.sourceReference\n        ? { sourceReference: reviewed.sourceReference }\n        : {}),\n    };\n  });\n}\n\nexport function withReviewedInsurancePoliciesV2(\n  inventory: DecisionGraphInventoryV2,\n  reviewedPolicies: readonly ClaimsAwareInsurancePolicyRuleV2[],\n): DecisionGraphInventoryV2 {\n  if (!reviewedPolicies.length) return inventory;\n  return {\n    ...inventory,\n    insurancePolicies: mergeReviewedInsurancePoliciesV2(\n      inventory.insurancePolicies,\n      reviewedPolicies,\n    ),\n  };\n}\n`,
);

replaceOnce(
  "packages/clinical-engine/src/type2-decision-graph-compat.ts",
  'import { resolveType2InsuranceProvidersV2 } from "./type2-intake-v2.js";\n',
  'import { resolveType2InsuranceProvidersV2 } from "./type2-intake-v2.js";\nimport type { ClaimsAwareInsurancePolicyRuleV2 } from "./decision-graph-v2/insurance-claims.js";\nimport { withReviewedInsurancePoliciesV2 } from "./decision-graph-v2/reviewed-insurance-policy-merge.js";\n',
);

replaceOnce(
  "packages/clinical-engine/src/type2-decision-graph-compat.ts",
  '  marketProducts: readonly IranMarketDrugProduct[];\n}\n',
  '  marketProducts: readonly IranMarketDrugProduct[];\n  insurancePolicies?: readonly ClaimsAwareInsurancePolicyRuleV2[];\n}\n',
);

replaceOnce(
  "packages/clinical-engine/src/type2-decision-graph-compat.ts",
  `  const { inventory } = buildDecisionGraphInventoryFromContractsV2({\n    masterRegistry: input.masterRegistry,\n    marketProducts: input.marketProducts,\n  });\n  const result = runDecisionGraphV2(graphRequest(input, inventory));\n`,
  `  const { inventory: importedInventory } = buildDecisionGraphInventoryFromContractsV2({\n    masterRegistry: input.masterRegistry,\n    marketProducts: input.marketProducts,\n  });\n  const inventory = withReviewedInsurancePoliciesV2(\n    importedInventory,\n    input.insurancePolicies ?? [],\n  );\n  const result = runDecisionGraphV2(graphRequest(input, inventory));\n`,
);

replaceOnce(
  "packages/clinical-engine/src/type2-decision-graph-runtime.ts",
  'import { buildType2AssessmentWithWorldDrugCoverageV2 } from "./type2-worlddrug-recommendation-compat.js";\n',
  'import { buildType2AssessmentWithWorldDrugCoverageV2 } from "./type2-worlddrug-recommendation-compat.js";\nimport type { ClaimsAwareInsurancePolicyRuleV2 } from "./decision-graph-v2/insurance-claims.js";\n',
);

replaceOnce(
  "packages/clinical-engine/src/type2-decision-graph-runtime.ts",
  'let runtimeCatalog: Type2DecisionGraphRuntimeCatalog | undefined;\n',
  `let runtimeCatalog: Type2DecisionGraphRuntimeCatalog | undefined;\nlet runtimeInsurancePolicies: ClaimsAwareInsurancePolicyRuleV2[] = [];\nlet runtimeInsurancePoliciesExpiresAt = 0;\n\nexport function configureType2DecisionGraphRuntimeInsurancePolicies(\n  policies: readonly ClaimsAwareInsurancePolicyRuleV2[],\n  expiresAt: string | number,\n) {\n  const parsedExpiry = typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);\n  runtimeInsurancePolicies = policies.map((policy) => structuredClone(policy));\n  runtimeInsurancePoliciesExpiresAt = Number.isFinite(parsedExpiry)\n    ? parsedExpiry\n    : 0;\n}\n\nfunction activeRuntimeInsurancePolicies() {\n  if (runtimeInsurancePoliciesExpiresAt <= Date.now()) return [];\n  return runtimeInsurancePolicies;\n}\n`,
);

replaceOnce(
  "packages/clinical-engine/src/type2-decision-graph-runtime.ts",
  `export function clearType2DecisionGraphRuntimeCatalogForTests() {\n  runtimeCatalog = undefined;\n}\n`,
  `export function clearType2DecisionGraphRuntimeCatalogForTests() {\n  runtimeCatalog = undefined;\n  runtimeInsurancePolicies = [];\n  runtimeInsurancePoliciesExpiresAt = 0;\n}\n`,
);

replaceOnce(
  "packages/clinical-engine/src/type2-decision-graph-runtime.ts",
  `      masterRegistry: runtimeCatalog.masterRegistry,\n      marketProducts: runtimeCatalog.marketProducts,\n    }),\n`,
  `      masterRegistry: runtimeCatalog.masterRegistry,\n      marketProducts: runtimeCatalog.marketProducts,\n      insurancePolicies: activeRuntimeInsurancePolicies(),\n    }),\n`,
);

replaceOnce(
  "packages/clinical-engine/src/index-runtime.ts",
  '  configureType2DecisionGraphRuntimeCatalog,\n',
  '  configureType2DecisionGraphRuntimeCatalog,\n  configureType2DecisionGraphRuntimeInsurancePolicies,\n',
);

replaceOnce(
  "apps/admin-worker/src/platform-v3-base.ts",
  'CLINICAL_DATA_MASTER_KEY?:string;',
  'CLINICAL_DATA_MASTER_KEY?:string; TYPE2_INSURANCE_CLAIM_POLICIES_JSON?:string;',
);

createOnly(
  "apps/admin-worker/src/platform-type2-claim-policy.ts",
  `import { isRuntimeOriginAllowed } from "./platform-cors";\nimport { type V3Env } from "./platform-v3-base";\nimport { v3RequireRuntime } from "./platform-v3-session";\n\ntype RuntimeClaimTimingPolicy = {\n  id: string;\n  provider: string;\n  productId?: string;\n  masterDrugId?: string;\n  effectiveAt: string;\n  sourceReference: string;\n  sourceUrl?: string;\n  claimTiming: {\n    groupKey: string;\n    windowDays: number;\n    maxClaimsPerWindow: number;\n    minimumDaysBetweenClaims: number;\n    allowDistinctProductsWithinWindow: boolean;\n  };\n};\n\nconst routePath = "/v1/clinical/type2/insurance-claim-policies";\nconst allowedProviders = new Set([\n  "social_security",\n  "health_insurance",\n  "armed_forces",\n  "other_organizations",\n  "supplementary",\n]);\n\nfunction json(request: Request, env: V3Env, body: unknown, status = 200) {\n  const origin = request.headers.get("origin");\n  return new Response(JSON.stringify(body), {\n    status,\n    headers: {\n      ...(isRuntimeOriginAllowed(origin, env)\n        ? {\n            "access-control-allow-origin": origin,\n            "access-control-allow-headers": "authorization, content-type",\n            "access-control-allow-methods": "GET, OPTIONS",\n            vary: "Origin",\n          }\n        : {}),\n      "cache-control": "no-store",\n      "content-type": "application/json; charset=utf-8",\n    },\n  });\n}\n\nfunction boundedText(value: unknown, max: number) {\n  if (typeof value !== "string") return null;\n  const text = value.trim();\n  return text && text.length <= max ? text : null;\n}\n\nfunction positiveInteger(value: unknown, max: number) {\n  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= max\n    ? Number(value)\n    : null;\n}\n\nfunction nonNegativeInteger(value: unknown, max: number) {\n  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max\n    ? Number(value)\n    : null;\n}\n\nfunction httpUrl(value: unknown) {\n  const text = boundedText(value, 500);\n  if (!text) return null;\n  try {\n    const url = new URL(text);\n    return url.protocol === "https:" || url.protocol === "http:" ? text : null;\n  } catch {\n    return null;\n  }\n}\n\nexport function parseType2ClaimPolicySnapshot(\n  raw: string | undefined,\n): RuntimeClaimTimingPolicy[] {\n  if (!raw?.trim()) return [];\n\n  let parsed: unknown;\n  try {\n    parsed = JSON.parse(raw);\n  } catch {\n    throw new Error("TYPE2_CLAIM_POLICY_JSON_INVALID");\n  }\n  if (!Array.isArray(parsed)) {\n    throw new Error("TYPE2_CLAIM_POLICY_ARRAY_REQUIRED");\n  }\n\n  return parsed.map((entry, index) => {\n    if (!entry || typeof entry !== "object") {\n      throw new Error(\`TYPE2_CLAIM_POLICY_INVALID:\${index}\`);\n    }\n    const source = entry as Record<string, unknown>;\n    const id = boundedText(source.id, 180);\n    const provider = boundedText(source.provider, 80);\n    const productId = boundedText(source.productId, 180);\n    const masterDrugId = boundedText(source.masterDrugId, 180);\n    const effectiveAt = boundedText(source.effectiveAt, 80);\n    const sourceReference = boundedText(source.sourceReference, 240);\n    const sourceUrl = source.sourceUrl === undefined\n      ? undefined\n      : httpUrl(source.sourceUrl);\n    const timing = source.claimTiming;\n\n    if (!id || !provider || !allowedProviders.has(provider)) {\n      throw new Error(\`TYPE2_CLAIM_POLICY_ID_PROVIDER_INVALID:\${index}\`);\n    }\n    if (!productId && !masterDrugId) {\n      throw new Error(\`TYPE2_CLAIM_POLICY_TARGET_REQUIRED:\${index}\`);\n    }\n    if (!effectiveAt || !Number.isFinite(Date.parse(effectiveAt)) || !sourceReference) {\n      throw new Error(\`TYPE2_CLAIM_POLICY_PROVENANCE_REQUIRED:\${index}\`);\n    }\n    if (source.sourceUrl !== undefined && !sourceUrl) {\n      throw new Error(\`TYPE2_CLAIM_POLICY_SOURCE_URL_INVALID:\${index}\`);\n    }\n    if (!timing || typeof timing !== "object") {\n      throw new Error(\`TYPE2_CLAIM_POLICY_TIMING_REQUIRED:\${index}\`);\n    }\n\n    const claimTiming = timing as Record<string, unknown>;\n    const groupKey = boundedText(claimTiming.groupKey, 120);\n    const windowDays = positiveInteger(claimTiming.windowDays, 90);\n    const maxClaimsPerWindow = positiveInteger(claimTiming.maxClaimsPerWindow, 10);\n    const minimumDaysBetweenClaims = nonNegativeInteger(\n      claimTiming.minimumDaysBetweenClaims,\n      90,\n    );\n\n    if (\n      !groupKey ||\n      windowDays === null ||\n      maxClaimsPerWindow === null ||\n      minimumDaysBetweenClaims === null ||\n      typeof claimTiming.allowDistinctProductsWithinWindow !== "boolean"\n    ) {\n      throw new Error(\`TYPE2_CLAIM_POLICY_TIMING_INVALID:\${index}\`);\n    }\n\n    return {\n      id,\n      provider,\n      ...(productId ? { productId } : {}),\n      ...(masterDrugId ? { masterDrugId } : {}),\n      effectiveAt,\n      sourceReference,\n      ...(sourceUrl ? { sourceUrl } : {}),\n      claimTiming: {\n        groupKey,\n        windowDays,\n        maxClaimsPerWindow,\n        minimumDaysBetweenClaims,\n        allowDistinctProductsWithinWindow:\n          claimTiming.allowDistinctProductsWithinWindow,\n      },\n    };\n  });\n}\n\nexport async function type2ClaimPolicyRoute(\n  request: Request,\n  env: V3Env,\n): Promise<Response | null> {\n  const url = new URL(request.url);\n  if (url.pathname !== routePath) return null;\n\n  if (request.method === "OPTIONS") {\n    const origin = request.headers.get("origin");\n    if (!isRuntimeOriginAllowed(origin, env)) {\n      return new Response(null, { status: 403 });\n    }\n    return new Response(null, {\n      status: 204,\n      headers: {\n        "access-control-allow-origin": origin,\n        "access-control-allow-headers": "authorization, content-type",\n        "access-control-allow-methods": "GET, OPTIONS",\n        vary: "Origin",\n      },\n    });\n  }\n\n  if (request.method !== "GET") {\n    return json(request, env, { error: "method_not_allowed" }, 405);\n  }\n\n  const runtime = await v3RequireRuntime(request, env);\n  if (!runtime) return json(request, env, { error: "auth_required" }, 401);\n  if (!runtime.user.permissions.includes("type2")) {\n    return json(request, env, { error: "type2_permission_required" }, 403);\n  }\n\n  try {\n    const now = Date.now();\n    return json(request, env, {\n      schemaVersion: 1,\n      authority: "trusted_runtime",\n      generatedAt: new Date(now).toISOString(),\n      expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),\n      policies: parseType2ClaimPolicySnapshot(\n        env.TYPE2_INSURANCE_CLAIM_POLICIES_JSON,\n      ),\n    });\n  } catch {\n    return json(\n      request,\n      env,\n      { error: "claim_policy_configuration_invalid" },\n      503,\n    );\n  }\n}\n`,
);

replaceOnce(
  "apps/admin-worker/src/platform-v3.ts",
  'import { schedulingAppointmentsRoute } from "./platform-scheduling-appointments";\n',
  'import { schedulingAppointmentsRoute } from "./platform-scheduling-appointments";\nimport { type2ClaimPolicyRoute } from "./platform-type2-claim-policy";\n',
);

replaceOnce(
  "apps/admin-worker/src/platform-v3.ts",
  `    const schedulingAvailability = await schedulingAvailabilityRoute(request, env);\n    if (schedulingAvailability) return schedulingAvailability;\n\n    // WS-2/WS-3: patient portal + clinician portal review namespace.\n`,
  `    const schedulingAvailability = await schedulingAvailabilityRoute(request, env);\n    if (schedulingAvailability) return schedulingAvailability;\n\n    const type2ClaimPolicy = await type2ClaimPolicyRoute(request, env);\n    if (type2ClaimPolicy) return type2ClaimPolicy;\n\n    // WS-2/WS-3: patient portal + clinician portal review namespace.\n`,
);

createOnly(
  "apps/web/lib/type2-claim-policy-runtime.ts",
  `"use client";\n\nimport {\n  configureType2DecisionGraphRuntimeInsurancePolicies,\n  type ClaimsAwareInsurancePolicyRuleV2,\n} from "@glymize/clinical-engine";\nimport { runtimeAuthEventName, runtimeFetch } from "./runtime-client";\n\ntype TrustedClaimPolicyResponse = {\n  schemaVersion: 1;\n  authority: "trusted_runtime";\n  generatedAt: string;\n  expiresAt: string;\n  policies: ClaimsAwareInsurancePolicyRuleV2[];\n};\n\nlet started = false;\nlet refreshTimer: ReturnType<typeof setTimeout> | undefined;\n\nfunction failClosed() {\n  configureType2DecisionGraphRuntimeInsurancePolicies([], 0);\n}\n\nfunction scheduleRefresh() {\n  if (typeof window === "undefined") return;\n  if (refreshTimer) clearTimeout(refreshTimer);\n  refreshTimer = setTimeout(() => {\n    void refreshTrustedType2ClaimPolicies();\n  }, 60_000);\n}\n\nfunction looksLikePolicy(value: unknown): value is ClaimsAwareInsurancePolicyRuleV2 {\n  if (!value || typeof value !== "object") return false;\n  const policy = value as Record<string, unknown>;\n  const timing = policy.claimTiming;\n  return typeof policy.id === "string" &&\n    typeof policy.provider === "string" &&\n    (typeof policy.productId === "string" || typeof policy.masterDrugId === "string") &&\n    typeof policy.effectiveAt === "string" &&\n    typeof policy.sourceReference === "string" &&\n    Boolean(timing) &&\n    typeof timing === "object";\n}\n\nexport async function refreshTrustedType2ClaimPolicies() {\n  try {\n    const response = await runtimeFetch(\n      "/v1/clinical/type2/insurance-claim-policies",\n      { method: "GET" },\n    );\n    if (!response.ok) {\n      failClosed();\n      return;\n    }\n\n    const payload = (await response.json()) as Partial<TrustedClaimPolicyResponse>;\n    if (\n      payload.schemaVersion !== 1 ||\n      payload.authority !== "trusted_runtime" ||\n      typeof payload.expiresAt !== "string" ||\n      !Number.isFinite(Date.parse(payload.expiresAt)) ||\n      !Array.isArray(payload.policies) ||\n      !payload.policies.every(looksLikePolicy)\n    ) {\n      failClosed();\n      return;\n    }\n\n    configureType2DecisionGraphRuntimeInsurancePolicies(\n      payload.policies,\n      payload.expiresAt,\n    );\n  } catch {\n    failClosed();\n  } finally {\n    scheduleRefresh();\n  }\n}\n\nexport async function initializeTrustedType2ClaimPolicyRuntime() {\n  if (typeof window === "undefined") return;\n  if (started) return;\n  started = true;\n  window.addEventListener(runtimeAuthEventName(), () => {\n    void refreshTrustedType2ClaimPolicies();\n  });\n  await refreshTrustedType2ClaimPolicies();\n}\n`,
);

replaceOnce(
  "apps/web/lib/type2-decision-graph-market.ts",
  'import { withBasePath } from "./base-path";\n',
  'import { withBasePath } from "./base-path";\nimport { initializeTrustedType2ClaimPolicyRuntime } from "./type2-claim-policy-runtime";\n',
);

replaceOnce(
  "apps/web/lib/type2-decision-graph-market.ts",
  `export async function loadType2DecisionGraphMarketProducts() {\n  if (cache) return cache;\n`,
  `export async function loadType2DecisionGraphMarketProducts() {\n  await initializeTrustedType2ClaimPolicyRuntime();\n  if (cache) return cache;\n`,
);

createOnly(
  "packages/clinical-engine/test/reviewed-insurance-policy-merge-v2.test.ts",
  `import { describe, expect, it } from "vitest";\nimport { mergeReviewedInsurancePoliciesV2 } from "../src/decision-graph-v2/reviewed-insurance-policy-merge.js";\nimport type { ClaimsAwareInsurancePolicyRuleV2 } from "../src/decision-graph-v2/insurance-claims.js";\nimport type { InsurancePolicyRuleV2 } from "../src/decision-graph-v2/types.js";\n\ndescribe("reviewed insurance claim timing merge v2", () => {\n  it("adds reviewed timing without replacing imported financial coverage", () => {\n    const imported: InsurancePolicyRuleV2[] = [{\n      id: "imported:wegovy:social_security",\n      provider: "social_security",\n      productId: "WEGOVY-025",\n      coveragePercent: 50,\n      referencePriceTomanPerPurchaseUnit: 4_000_000,\n    }];\n    const reviewed: ClaimsAwareInsurancePolicyRuleV2[] = [{\n      id: "reviewed:tamin:wegovy:2026-09",\n      provider: "social_security",\n      productId: "WEGOVY-025",\n      effectiveAt: "2026-09-01T00:00:00.000Z",\n      sourceReference: "reviewed-policy-2026-09",\n      claimTiming: {\n        groupKey: "wegovy-strength-switch",\n        windowDays: 30,\n        maxClaimsPerWindow: 2,\n        minimumDaysBetweenClaims: 28,\n        allowDistinctProductsWithinWindow: true,\n      },\n    }];\n\n    const merged = mergeReviewedInsurancePoliciesV2(imported, reviewed);\n    expect(merged).toHaveLength(1);\n    expect(merged[0]?.id).toBe("reviewed:tamin:wegovy:2026-09");\n    expect(merged[0]?.coveragePercent).toBe(50);\n    expect(merged[0]?.referencePriceTomanPerPurchaseUnit).toBe(4_000_000);\n    expect(merged[0]?.claimTiming?.minimumDaysBetweenClaims).toBe(28);\n  });\n\n  it("ignores unmatched timing metadata because timing does not prove coverage", () => {\n    const reviewed: ClaimsAwareInsurancePolicyRuleV2[] = [{\n      id: "reviewed:unknown-product",\n      provider: "social_security",\n      productId: "OTHER",\n      effectiveAt: "2026-09-01T00:00:00.000Z",\n      sourceReference: "reviewed-policy",\n      claimTiming: {\n        groupKey: "other",\n        windowDays: 30,\n        maxClaimsPerWindow: 2,\n        minimumDaysBetweenClaims: 28,\n        allowDistinctProductsWithinWindow: true,\n      },\n    }];\n    expect(mergeReviewedInsurancePoliciesV2([], reviewed)).toEqual([]);\n  });\n});\n`,
);

createOnly(
  "apps/admin-worker/test/type2-claim-policy-boundary.test.ts",
  `import { describe, expect, it } from "vitest";\nimport {\n  parseType2ClaimPolicySnapshot,\n  type2ClaimPolicyRoute,\n} from "../src/platform-type2-claim-policy";\n\ndescribe("trusted Type-2 claim policy boundary", () => {\n  it("requires reviewed provenance and bounded timing metadata", () => {\n    const policies = parseType2ClaimPolicySnapshot(JSON.stringify([{\n      id: "tamin:wegovy:2026-09",\n      provider: "social_security",\n      productId: "WEGOVY-025",\n      effectiveAt: "2026-09-01T00:00:00.000Z",\n      sourceReference: "reviewed-tamin-policy-2026-09",\n      claimTiming: {\n        groupKey: "wegovy-strength-switch",\n        windowDays: 30,\n        maxClaimsPerWindow: 2,\n        minimumDaysBetweenClaims: 28,\n        allowDistinctProductsWithinWindow: true,\n      },\n    }]));\n    expect(policies[0]?.claimTiming.minimumDaysBetweenClaims).toBe(28);\n    expect(policies[0]?.sourceReference).toBe("reviewed-tamin-policy-2026-09");\n  });\n\n  it("fails closed on malformed timing configuration", () => {\n    expect(() => parseType2ClaimPolicySnapshot(JSON.stringify([{\n      id: "bad",\n      provider: "social_security",\n      productId: "WEGOVY-025",\n      effectiveAt: "2026-09-01T00:00:00.000Z",\n      sourceReference: "reviewed-policy",\n      claimTiming: {\n        groupKey: "wegovy",\n        windowDays: 30,\n        maxClaimsPerWindow: 2,\n        minimumDaysBetweenClaims: -1,\n        allowDistinctProductsWithinWindow: true,\n      },\n    }]))).toThrow(/TYPE2_CLAIM_POLICY_TIMING_INVALID/);\n  });\n\n  it("requires runtime authentication before exposing the snapshot", async () => {\n    const response = await type2ClaimPolicyRoute(\n      new Request("https://worker.example.test/v1/clinical/type2/insurance-claim-policies"),\n      {\n        ADMIN_ORIGIN: "https://rc.example.test",\n        SESSION_SECRET: "test-session-secret",\n      },\n    );\n    expect(response?.status).toBe(401);\n    expect(await response?.json()).toEqual({ error: "auth_required" });\n  });\n});\n`,
);

createOnly(
  "apps/web/test/type2-trusted-claim-policy-wiring.test.ts",
  `import fs from "node:fs";\nimport { describe, expect, it } from "vitest";\n\nconst loader = fs.readFileSync(\n  new URL("../lib/type2-claim-policy-runtime.ts", import.meta.url),\n  "utf8",\n);\nconst market = fs.readFileSync(\n  new URL("../lib/type2-decision-graph-market.ts", import.meta.url),\n  "utf8",\n);\n\ndescribe("Type-2 trusted claim-policy wiring", () => {\n  it("uses the authenticated runtime and fails closed on unavailable policy", () => {\n    expect(loader).toContain('runtimeFetch(');\n    expect(loader).toContain('/v1/clinical/type2/insurance-claim-policies');\n    expect(loader).toContain('configureType2DecisionGraphRuntimeInsurancePolicies([], 0)');\n    expect(loader).toContain('payload.authority !== "trusted_runtime"');\n  });\n\n  it("starts trusted policy refresh before loading the Decision Graph market snapshot", () => {\n    const initialize = market.indexOf("await initializeTrustedType2ClaimPolicyRuntime();");\n    const cache = market.indexOf("if (cache) return cache;");\n    expect(initialize).toBeGreaterThan(-1);\n    expect(cache).toBeGreaterThan(initialize);\n  });\n});\n`,
);

replaceOnce(
  "docs/architecture/RUNTIME_OF_RECORD.md",
  "## Patient and encounter boundary\n",
  `### Trusted Type 2 claim-policy boundary\n\nType 2 medication/ranking evaluation remains browser-executed through\n\`@glymize/clinical-engine\`; this does not promote the Worker or \`apps/api\`\ninto the clinical recommendation runtime.\n\nInsurer claim-timing authority is distinct from ordinary market coverage. The\nbrowser catalogue must not invent or persist it. Reviewed claim-timing rules\nremain server-side in the Cloudflare Worker configuration and are exposed only\nthrough the authenticated, permission-checked\n\`GET /v1/clinical/type2/insurance-claim-policies\` snapshot.\n\nThe browser may pass that short-lived trusted snapshot into Decision Graph v2\nas a read-only policy input. The snapshot expires after five minutes and the\nweb runtime refreshes it periodically and on runtime-auth changes. If the\nruntime endpoint is unavailable, unauthorized, malformed, expired, or returns\nno reviewed rule, the clinical engine receives no claim-timing authority and\nmulti-claim \`insured_only\` evaluation remains fail-closed. Ordinary NFI or\ninsurance coverage rows never imply claim timing.\n\nThe snapshot contains no payer credential, connector DTO, signing key, reusable\ntoken, or submission capability. This boundary does not activate a live payer\nAPI or electronic-prescription integration.\n\n## Patient and encounter boundary\n`,
);

fs.unlinkSync(selfPath);
console.log("TYPE2_TRUSTED_CLAIM_POLICY_PATCH_APPLIED");
