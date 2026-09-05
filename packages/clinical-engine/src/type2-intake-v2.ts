import type {
  CurrentMedicationInput,
  PatientClinicalContext,
  Type2ConsiderationRequest,
  Type2CostPreference,
  Type2RoutePreference,
} from "@glymize/contracts";
import type { DiabeticFootContextV2 } from "./decision-graph-v2/diabetic-foot-escalation.js";
import type { DecisionGraphRequestWithSpecialistContextsV2 } from "./decision-graph-v2/engine-with-specialist-escalations.js";
import type { NutritionSupportContextV2 } from "./decision-graph-v2/nutrition-support-boundary.js";
import type { PregnancyDiabetesContextV2 } from "./decision-graph-v2/pregnancy-diabetes-pathway.js";
import type { RetinopathyContextV2 } from "./decision-graph-v2/retinopathy-escalation.js";
import type {
  DecisionGraphInventoryV2,
  MedicationSafetyContextV2,
  NeuropathyContextV2,
} from "./decision-graph-v2/types.js";

export interface Type2GlycemiaDetailIntakeV2 {
  fastingPlasmaGlucoseMgDl?: number;
  twoHourPostprandialGlucoseMgDl?: number;
  randomGlucoseMgDl?: number;
  ketonesKnownPositive?: boolean;
  acuteHyperglycemicCrisis?: "none" | "dka" | "hhs" | "mixed";
}

/**
 * Additive clinical context for the fields required by the post-Task-10 safety
 * and specialist pathways. Existing Type2ConsiderationRequest callers remain
 * source-compatible; only callers that want these pathways populate the fields.
 */
export type Type2StructuredClinicalContextV2 = PatientClinicalContext & {
  glycemia?: Type2GlycemiaDetailIntakeV2;
  neuropathy?: NeuropathyContextV2;
  medicationSafety?: MedicationSafetyContextV2;
  retinopathy?: RetinopathyContextV2;
  diabeticFoot?: DiabeticFootContextV2;
  nutritionSupport?: NutritionSupportContextV2;
  pregnancyCare?: PregnancyDiabetesContextV2;
};

export type Type2StructuredConsiderationRequestV2 = Omit<Type2ConsiderationRequest, "clinicalContext"> & {
  clinicalContext?: Type2StructuredClinicalContextV2;
};

function routePreference(value: Type2RoutePreference | undefined) {
  if (value === "oral_only") return "oral_only" as const;
  if (value === "oral_and_injectable") return "oral_or_injectable" as const;
  return "oral_or_injectable" as const;
}

function costPreference(value: Type2CostPreference | undefined) {
  if (value === "low_cost_only") return "low_cost" as const;
  if (value === "insured_only") return "insured_only" as const;
  if (value === "moderate") return "moderate" as const;
  return "no_constraint" as const;
}

function currentMedication(item: CurrentMedicationInput) {
  return {
    masterDrugId: item.genericMedicationId,
    genericName: item.genericName,
    route: item.route,
    dosageFormGroup: item.dosageForm,
    status: item.status,
    adherence: item.adherence,
    tolerance: item.tolerance,
  };
}

/**
 * Converts the clinician-facing Type 2 intake into the single Decision Graph v2
 * patient model used by the safety/specialist wrapper.
 *
 * Safety invariant: generic legacy factors are never promoted into specialist
 * phenotypes. In particular `diabetic_foot`, a WorldDrug domain selection, or a
 * pregnancy checkbox cannot invent ulcer infection severity, retinopathy grade,
 * deficiency, or pregnancy diabetes type. Those values must be represented in
 * `clinicalContext` explicitly.
 */
export function type2StructuredIntakeToDecisionGraphV2(
  request: Type2StructuredConsiderationRequestV2,
  inventory: DecisionGraphInventoryV2,
): DecisionGraphRequestWithSpecialistContextsV2 {
  const context = request.clinicalContext;
  const pregnancy = context?.pregnancy ?? request.factors.includes("pregnancy");

  return {
    patient: {
      ageYears: context?.ageYears,
      sexAtBirth: context?.sexAtBirth,
      pregnancy,
      glycemia: {
        currentHba1c: request.currentHba1c,
        targetHba1c: request.targetHba1c,
        fastingPlasmaGlucoseMgDl: context?.glycemia?.fastingPlasmaGlucoseMgDl,
        twoHourPostprandialGlucoseMgDl: context?.glycemia?.twoHourPostprandialGlucoseMgDl,
        randomGlucoseMgDl: context?.glycemia?.randomGlucoseMgDl,
        hyperglycemiaSymptoms: request.hyperglycemiaSymptoms,
        catabolicFeatures: request.catabolicFeatures,
        ketonesKnownPositive: context?.glycemia?.ketonesKnownPositive,
        acuteHyperglycemicCrisis: context?.glycemia?.acuteHyperglycemicCrisis,
      },
      anthropometrics: context?.anthropometrics,
      kidney: context?.kidney,
      cardiovascular: context?.cardiovascular,
      liver: context?.liver
        ? {
            chronicLiverDisease: context.liver.cirrhosis === true || context.liver.decompensatedCirrhosis === true,
            masldMash: context.liver.masldMash,
            fibrosisStage: context.liver.fibrosisStage,
            cirrhosis: context.liver.cirrhosis,
            decompensatedCirrhosis: context.liver.decompensatedCirrhosis,
            astUL: context.liver.astUeL,
            altUL: context.liver.altUeL,
            plateletCount10e9L: context.liver.plateletCount10e9L,
            liverStiffnessKpa: context.liver.liverStiffnessKpa,
          }
        : undefined,
      neuropathy: context?.neuropathy,
      medicationSafety: context?.medicationSafety,
      hypoglycemiaRisk: request.factors.includes("hypoglycemia_risk") ? "high" : "standard",
      currentMedications: request.currentMedications?.map(currentMedication),
      retinopathy: context?.retinopathy,
      diabeticFoot: context?.diabeticFoot,
      nutritionSupport: context?.nutritionSupport,
      pregnancyCare: context?.pregnancyCare,
    },
    preferences: {
      routePreference: routePreference(request.routePreference),
      costPreference: costPreference(request.costPreference),
    },
    inventory,
  };
}
