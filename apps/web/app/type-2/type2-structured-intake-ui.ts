import type { MedicationClinicalDomain, Type2DecisionFactor } from "@glymize/contracts";
import type { Type2StructuredClinicalContextV2 } from "@glymize/clinical-engine/type2-intake-v2";

export type TriState = "unknown" | "yes" | "no";

export interface Type2StructuredIntakeDraft {
  fastingGlucose: string;
  twoHourPostprandialGlucose: string;
  randomGlucose: string;
  retinopathyPresent: TriState;
  retinopathySeverity: "" | "none" | "mild_npdr" | "moderate_npdr" | "severe_npdr" | "pdr" | "unknown";
  diabeticMacularEdema: TriState;
  centerInvolvingDme: TriState;
  dmeVisualAcuityImpairment: TriState;
  ophthalmologyCareEstablished: boolean;
  dpnConfirmed: TriState;
  dpnPainfulSymptoms: TriState;
  dpnAtypicalFeatures: TriState;
  footUlcerPresent: TriState;
  footClinicalInfection: TriState;
  footInfectionSeverity: "" | "mild" | "moderate" | "severe" | "unknown";
  footPad: TriState;
  extensiveGangrene: boolean;
  necrotisingInfection: boolean;
  deepAbscessSuspected: boolean;
  compartmentSyndrome: boolean;
  severeLowerLimbIschaemia: boolean;
  osteomyelitisSuspected: boolean;
  exposedBone: boolean;
  nutritionIntent: "" | "glycemic_benefit" | "documented_deficiency" | "malnutrition_support" | "special_population" | "unspecified";
  documentedMicronutrientDeficiency: TriState;
  deficiencyName: string;
  deficiencyLabValueKnown: TriState;
  malnutritionRiskOrDiagnosis: TriState;
  intentionalWeightLoss: boolean;
  nutritionSpecialPopulation: "" | "pregnant" | "lactating" | "older_adult" | "vegetarian_or_vegan" | "very_low_calorie_or_low_carbohydrate_pattern";
  metforminUse: boolean;
  anemiaOrPeripheralNeuropathy: boolean;
  betaCaroteneSupplementUseOrPlan: boolean;
  pregnancyDiabetesType: "" | "type1" | "type2" | "gdm" | "unknown";
  gestationalAgeWeeks: string;
  significantHypoglycemiaPreventingTightTarget: boolean;
  metforminForPcosOvulation: boolean;
  pregnancySpecialistTeamEstablished: boolean;
}

export const emptyType2StructuredIntakeDraft: Type2StructuredIntakeDraft = {
  fastingGlucose: "",
  twoHourPostprandialGlucose: "",
  randomGlucose: "",
  retinopathyPresent: "unknown",
  retinopathySeverity: "",
  diabeticMacularEdema: "unknown",
  centerInvolvingDme: "unknown",
  dmeVisualAcuityImpairment: "unknown",
  ophthalmologyCareEstablished: false,
  dpnConfirmed: "unknown",
  dpnPainfulSymptoms: "unknown",
  dpnAtypicalFeatures: "unknown",
  footUlcerPresent: "unknown",
  footClinicalInfection: "unknown",
  footInfectionSeverity: "",
  footPad: "unknown",
  extensiveGangrene: false,
  necrotisingInfection: false,
  deepAbscessSuspected: false,
  compartmentSyndrome: false,
  severeLowerLimbIschaemia: false,
  osteomyelitisSuspected: false,
  exposedBone: false,
  nutritionIntent: "",
  documentedMicronutrientDeficiency: "unknown",
  deficiencyName: "",
  deficiencyLabValueKnown: "unknown",
  malnutritionRiskOrDiagnosis: "unknown",
  intentionalWeightLoss: false,
  nutritionSpecialPopulation: "",
  metforminUse: false,
  anemiaOrPeripheralNeuropathy: false,
  betaCaroteneSupplementUseOrPlan: false,
  pregnancyDiabetesType: "",
  gestationalAgeWeeks: "",
  significantHypoglycemiaPreventingTightTarget: false,
  metforminForPcosOvulation: false,
  pregnancySpecialistTeamEstablished: false,
};

function booleanOrUndefined(value: TriState) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return undefined;
}

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface StructuredIntakeActivation {
  factors: readonly Type2DecisionFactor[];
  worldDrugDomains: readonly MedicationClinicalDomain[];
}

/**
 * Builds only explicitly represented specialist contexts. Domain visibility is
 * an activation/display concern and never itself becomes a diagnosis.
 */
export function structuredClinicalContextFromDraft(
  draft: Type2StructuredIntakeDraft,
  activation: StructuredIntakeActivation,
): Pick<
  Type2StructuredClinicalContextV2,
  "glycemia" | "neuropathy" | "retinopathy" | "diabeticFoot" | "nutritionSupport" | "pregnancyCare"
> {
  const neuropathyActive = activation.worldDrugDomains.includes("neuropathy");
  const retinopathyActive = activation.worldDrugDomains.includes("retinopathy");
  const nutritionActive = activation.worldDrugDomains.includes("nutrition_support");
  const footActive = activation.factors.includes("diabetic_foot");
  const pregnancyActive = activation.factors.includes("pregnancy");
  const fasting = numberOrUndefined(draft.fastingGlucose);
  const twoHour = numberOrUndefined(draft.twoHourPostprandialGlucose);
  const random = numberOrUndefined(draft.randomGlucose);

  return {
    glycemia: fasting !== undefined || twoHour !== undefined || random !== undefined
      ? {
          fastingPlasmaGlucoseMgDl: fasting,
          twoHourPostprandialGlucoseMgDl: twoHour,
          randomGlucoseMgDl: random,
        }
      : undefined,
    neuropathy: neuropathyActive && (
      draft.dpnConfirmed !== "unknown" ||
      draft.dpnPainfulSymptoms !== "unknown" ||
      draft.dpnAtypicalFeatures !== "unknown"
    )
      ? {
          diabeticPeripheralNeuropathyConfirmed: booleanOrUndefined(draft.dpnConfirmed),
          painfulSymptoms: booleanOrUndefined(draft.dpnPainfulSymptoms),
          atypicalFeaturesPresent: booleanOrUndefined(draft.dpnAtypicalFeatures),
        }
      : undefined,
    retinopathy: retinopathyActive && (
      draft.retinopathyPresent !== "unknown" ||
      draft.retinopathySeverity !== "" ||
      draft.diabeticMacularEdema !== "unknown"
    )
      ? {
          diabeticRetinopathyPresent: booleanOrUndefined(draft.retinopathyPresent),
          severity: draft.retinopathySeverity || undefined,
          diabeticMacularEdema: booleanOrUndefined(draft.diabeticMacularEdema),
          centerInvolvingDme: booleanOrUndefined(draft.centerInvolvingDme),
          visualAcuityImpairmentAttributedToDme: booleanOrUndefined(draft.dmeVisualAcuityImpairment),
          ophthalmologyCareEstablished: draft.ophthalmologyCareEstablished || undefined,
        }
      : undefined,
    diabeticFoot: footActive && (
      draft.footUlcerPresent !== "unknown" ||
      draft.footClinicalInfection !== "unknown" ||
      draft.footInfectionSeverity !== ""
    )
      ? {
          footUlcerPresent: booleanOrUndefined(draft.footUlcerPresent),
          clinicalInfectionPresent: booleanOrUndefined(draft.footClinicalInfection),
          infectionSeverity: draft.footInfectionSeverity || undefined,
          peripheralArteryDisease: booleanOrUndefined(draft.footPad),
          extensiveGangrene: draft.extensiveGangrene || undefined,
          necrotisingInfection: draft.necrotisingInfection || undefined,
          deepAbscessSuspected: draft.deepAbscessSuspected || undefined,
          compartmentSyndrome: draft.compartmentSyndrome || undefined,
          severeLowerLimbIschaemia: draft.severeLowerLimbIschaemia || undefined,
          osteomyelitisSuspected: draft.osteomyelitisSuspected || undefined,
          exposedBone: draft.exposedBone || undefined,
        }
      : undefined,
    nutritionSupport: nutritionActive && draft.nutritionIntent
      ? {
          intent: draft.nutritionIntent,
          documentedMicronutrientDeficiency: booleanOrUndefined(draft.documentedMicronutrientDeficiency),
          deficiencyName: draft.deficiencyName.trim() || undefined,
          deficiencyLabValueKnown: booleanOrUndefined(draft.deficiencyLabValueKnown),
          malnutritionRiskOrDiagnosis: booleanOrUndefined(draft.malnutritionRiskOrDiagnosis),
          intentionalWeightLoss: draft.intentionalWeightLoss || undefined,
          specialPopulation: draft.nutritionSpecialPopulation || undefined,
          metforminUse: draft.metforminUse || undefined,
          anemiaOrPeripheralNeuropathy: draft.anemiaOrPeripheralNeuropathy || undefined,
          betaCaroteneSupplementUseOrPlan: draft.betaCaroteneSupplementUseOrPlan || undefined,
        }
      : undefined,
    pregnancyCare: pregnancyActive && draft.pregnancyDiabetesType
      ? {
          diabetesType: draft.pregnancyDiabetesType,
          gestationalAgeWeeks: numberOrUndefined(draft.gestationalAgeWeeks),
          significantHypoglycemiaPreventingTightTarget:
            draft.significantHypoglycemiaPreventingTightTarget || undefined,
          metforminForPcosOvulation: draft.metforminForPcosOvulation || undefined,
          pregnancySpecialistTeamEstablished: draft.pregnancySpecialistTeamEstablished || undefined,
        }
      : undefined,
  };
}
