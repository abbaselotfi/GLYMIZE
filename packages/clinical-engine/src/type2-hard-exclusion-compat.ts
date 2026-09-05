import type {
  GenericMedication,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
} from "@glymize/contracts";
import {
  getActiveClinicalRulePack,
  type ClinicalRulePack,
} from "./rule-pack.js";

function effectiveEgfr(request: Type2ConsiderationRequest) {
  return request.clinicalContext?.kidney?.eGfr ?? request.eGfr;
}

function hasDecisionFactor(
  request: Type2ConsiderationRequest,
  factor: Type2ConsiderationRequest["factors"][number],
) {
  if (request.factors.includes(factor)) return true;
  if (factor === "heart_failure") return Boolean(request.clinicalContext?.cardiovascular?.heartFailure);
  if (factor === "masld_mash") return Boolean(request.clinicalContext?.liver?.masldMash);
  return false;
}

/**
 * Structural safety firewall for the retired score-based compatibility builder.
 *
 * Decision Graph v2 already removes hard-gated candidates before primary /
 * alternative selection. The legacy builder predates that invariant and still
 * attaches `blockedBy` after computing a score. Until that builder is removed,
 * the package runtime must not return a clinically hard-excluded medication.
 *
 * Only true structural exclusions are represented here. Soft preferences and
 * risk de-prioritization (for example high hypoglycemia risk) are deliberately
 * not converted into contraindications.
 */
export function legacyType2HardExclusionReasons(
  medication: GenericMedication,
  request: Type2ConsiderationRequest,
  pack: ClinicalRulePack = getActiveClinicalRulePack(),
): string[] {
  const reasons: string[] = [];
  const name = medication.canonicalName.toLocaleLowerCase();
  const className = medication.className?.toLocaleLowerCase() ?? "";
  const eGfr = effectiveEgfr(request);

  if (
    name === "metformin" &&
    eGfr !== undefined &&
    eGfr < pack.type2.metforminContraindicatedBelowEgfr
  ) {
    reasons.push(
      `Metformin hard exclusion: eGFR ${eGfr} is below the approved ${pack.type2.metforminContraindicatedBelowEgfr} threshold.`,
    );
  }

  if (className.includes("thiazolidinedione") && hasDecisionFactor(request, "heart_failure")) {
    reasons.push("Thiazolidinedione hard exclusion: heart failure is present.");
  }

  if (name.includes("resmetirom")) {
    const liver = request.clinicalContext?.liver;
    const eligibleFibrosis = pack.type2.resmetiromEligibleFibrosisStages.includes(
      liver?.fibrosisStage as "F2" | "F3",
    );
    const cirrhosis = Boolean(
      liver?.cirrhosis ||
      liver?.decompensatedCirrhosis ||
      liver?.fibrosisStage === "F4",
    );
    if (!hasDecisionFactor(request, "masld_mash") || !eligibleFibrosis || cirrhosis) {
      reasons.push("Resmetirom hard eligibility exclusion: non-cirrhotic MASH F2-F3 criteria are not satisfied.");
    }
  }

  return reasons;
}

export function filterHardExcludedLegacyType2Assessment(
  assessment: Type2AssessmentResult,
  medications: readonly GenericMedication[],
  request: Type2ConsiderationRequest,
  pack: ClinicalRulePack = getActiveClinicalRulePack(),
): Type2AssessmentResult {
  const hardExcludedMedicationIds = new Set(
    medications
      .filter((medication) => legacyType2HardExclusionReasons(medication, request, pack).length > 0)
      .map((medication) => medication.id),
  );

  if (!hardExcludedMedicationIds.size) return assessment;

  return {
    ...assessment,
    medications: assessment.medications.filter(
      (medication) => !hardExcludedMedicationIds.has(medication.genericMedicationId),
    ),
  };
}
