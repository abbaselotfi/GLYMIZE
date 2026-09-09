import type {
  PatientCoreCollectionCompleteness,
  PatientCoreCollectionDiagnostics,
} from "@glymize/contracts/patient-core";

function isNonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

export function validatePatientCoreCollectionDiagnostics(
  diagnostics: PatientCoreCollectionDiagnostics,
) {
  const counts = [
    diagnostics.sourceRowCount,
    diagnostics.eligibleCount,
    diagnostics.includedCount,
    diagnostics.intentionallyExcludedCount,
    diagnostics.invalidSkippedCount,
    diagnostics.truncatedCount,
  ];
  if (!diagnostics.sourceScope.trim() || counts.some((value) => !isNonNegativeInteger(value))) {
    throw new Error("PATIENT_CORE_COVERAGE_ACCOUNTING_INVALID");
  }
  if (
    diagnostics.sourceRowCount !==
      diagnostics.eligibleCount + diagnostics.intentionallyExcludedCount ||
    diagnostics.eligibleCount !==
      diagnostics.includedCount + diagnostics.invalidSkippedCount + diagnostics.truncatedCount
  ) {
    throw new Error("PATIENT_CORE_COVERAGE_ACCOUNTING_INVALID");
  }
  if (
    diagnostics.exclusions &&
    diagnostics.exclusions.reduce((total, item) => total + item.count, 0) !==
      diagnostics.intentionallyExcludedCount
  ) {
    throw new Error("PATIENT_CORE_COVERAGE_ACCOUNTING_INVALID");
  }
}

export function completenessFromPatientCoreDiagnostics(
  diagnostics: PatientCoreCollectionDiagnostics,
): PatientCoreCollectionCompleteness {
  validatePatientCoreCollectionDiagnostics(diagnostics);
  return diagnostics.invalidSkippedCount > 0 || diagnostics.truncatedCount > 0
    ? "partial"
    : "complete";
}
