import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const file = path.join(root, "apps", "web", "public", "data", "glymize-clinician-market-v2.json");
const metaFile = path.join(root, "apps", "web", "public", "data", "glymize-clinician-market-v2.meta.json");

const runtimeBytes = fs.readFileSync(file);
const data = JSON.parse(runtimeBytes.toString("utf8"));
const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(data.schemaVersion === 2, "schemaVersion must be 2");
assert(data.kind === "glymize_clinician_market_index", "runtime kind invalid");
assert(data.scopeMode === "full_clinical_market", "runtime scope must be full_clinical_market");
assert(data.products.length === data.scope.productCount, "scope product count mismatch");
assert(data.runtimeIntegrity.productRetentionPercent === 100, "product retention must be 100%");
assert(data.runtimeIntegrity.missingCanonicalProductIds.length === 0, "missing canonical products");
assert(data.runtimeIntegrity.unexpectedRuntimeProductIds.length === 0, "unexpected runtime products");

for (const key of [
  "crossQueryContaminationCount",
  "genericCodeIdentityCollisionCount",
  "productsWithMergedQueryNamesWithoutComponents",
  "suspiciousSearchScopeCount",
  "combinationProductsWithoutComponentsCount",
  "unsafeComparableCombinationSummaryCount",
]) {
  assert(data.sourceSemanticValidation[key] === 0, `${key} must be 0`);
}

const marketPresentationSummaries = data.presentationSummaries.filter((item) =>
  item.kind === "nfi_presentation" &&
  item.nfiVerificationStatus === "nfi_verified" &&
  typeof item.genericCanonicalName === "string" &&
  item.genericCanonicalName.trim().length > 0 &&
  Array.isArray(item.productIds) &&
  item.productIds.length > 0
);
const searchStatusSummaries = data.presentationSummaries.filter((item) => item.kind === "nfi_search_status");
assert(marketPresentationSummaries.length === 3365, `verified NFI presentation count mismatch: ${marketPresentationSummaries.length}`);
assert(searchStatusSummaries.length === 143, `NFI search-status count mismatch: ${searchStatusSummaries.length}`);

const calc = data.sourceCalculationValidation;
assert(calc.packageDerivationErrorCount === 0, "package derivation errors must be 0");
assert(
  calc.insulinProductsCount === calc.insulinProductsWithResolvedTotalUnitsPerPackageCount,
  "all insulin products must resolve units/package",
);
assert(
  calc.productsWithResolvedCostingProfileCount + calc.costingProfileAmbiguousCount === data.products.length,
  "costing profile accounting mismatch",
);

const frc = data.products.filter((item) =>
  item.generic?.canonicalName === "insulin glargine + lixisenatide"
);
assert(frc.length >= 2, "Suliqua/FRC regression examples missing");
for (const item of frc) {
  assert(item.product?.costingProfile?.basis === "insulin_unit", "FRC costing basis must be insulin_unit");
  assert(item.product?.costingProfile?.packageMeasureQuantity === 900, "FRC package must resolve to 900 insulin units");
  assert(item.product?.insulinPackage?.totalInsulinUnitsPerContainer === 300, "FRC pen must resolve to 300 insulin units");
  assert(item.product?.insulinPackage?.totalInsulinUnitsPerPackage === 900, "FRC package insulin total must be 900");
}

const bases = new Set(
  data.products
    .map((item) => item.product?.costingProfile?.basis)
    .filter(Boolean),
);
for (const required of ["insulin_unit", "tablet", "capsule", "mL", "actuation"]) {
  assert(bases.has(required), `missing costing basis: ${required}`);
}

assert(
  !Object.prototype.hasOwnProperty.call(data.products[0] ?? {}, "fieldProvenance"),
  "deployment runtime should not contain fieldProvenance",
);
assert(
  !Object.prototype.hasOwnProperty.call(data.products[0]?.product ?? {}, "derivationMetadata"),
  "deployment runtime should not contain derivationMetadata",
);

const actualSha = crypto.createHash("sha256").update(runtimeBytes).digest("hex");
assert(meta.deploymentSha256 === actualSha, "deployment metadata SHA mismatch");
assert(meta.canonicalSha256 === data.canonicalSha256, "canonical SHA mismatch");
assert(meta.dashboardMetrics?.productCount === data.products.length, "dashboard Product metric mismatch");
assert(meta.dashboardMetrics?.genericCount === data.scope.genericCount, "dashboard Generic metric mismatch");
assert(meta.dashboardMetrics?.verifiedPresentationCount === marketPresentationSummaries.length, "dashboard verified-presentation metric mismatch");
assert(meta.dashboardMetrics?.insuranceRecordCount === data.scope.insuranceRecordCount, "dashboard Insurance metric mismatch");

const sizeMb = runtimeBytes.byteLength / 1024 / 1024;
assert(sizeMb < 50, `deployment runtime must stay below 50 MiB; got ${sizeMb.toFixed(1)} MiB`);

console.log("GLYMIZE Market v2.3 validation: PASS");
console.log(`Products: ${data.products.length}`);
console.log(`Generics: ${data.scope.genericCount}`);
console.log(`Presentation summaries: ${data.scope.presentationSummaryCount}`);
console.log(`NFI verified presentations: ${marketPresentationSummaries.length}`);
console.log(`NFI search-status rows: ${searchStatusSummaries.length}`);
console.log(`Insurance: ${data.scope.insuranceRecordCount}`);
console.log(`Costing resolved: ${calc.productsWithResolvedCostingProfileCount}`);
console.log(`Costing ambiguous: ${calc.costingProfileAmbiguousCount}`);
console.log(`Insulin resolved: ${calc.insulinProductsWithResolvedTotalUnitsPerPackageCount}/${calc.insulinProductsCount}`);
console.log(`Runtime size: ${sizeMb.toFixed(1)} MiB`);
console.log(`Canonical SHA: ${data.canonicalSha256}`);
console.log(`Deployment SHA: ${actualSha}`);
