import type { MedicationClinicalDomain, Type2DecisionFactor } from "@glymize/contracts";
import type { Type2StructuredConsiderationRequestV2 } from "@glymize/clinical-engine/type2-intake-v2";
import {
  structuredClinicalContextFromDraft,
  type Type2StructuredIntakeDraft,
} from "./type2-structured-intake-ui";

export interface Type2CoreContextDraft {
  eGfr: string;
  creatinineClearanceMlMin: string;
  uacr: string;
  potassiumMmolL: string;
  dialysis: boolean;
  recentAki: boolean;
  lvef: string;
  weight: string;
  height: string;
  fibrosisStage: "" | "F0" | "F1" | "F2" | "F3" | "F4" | "unknown";
  cirrhosis: boolean;
  decompensatedCirrhosis: boolean;
}

export const emptyType2CoreContextDraft: Type2CoreContextDraft = {
  eGfr: "",
  creatinineClearanceMlMin: "",
  uacr: "",
  potassiumMmolL: "",
  dialysis: false,
  recentAki: false,
  lvef: "",
  weight: "",
  height: "",
  fibrosisStage: "",
  cirrhosis: false,
  decompensatedCirrhosis: false,
};

export function type2NumberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function type2BmiFromCoreDraft(draft: Type2CoreContextDraft): number | undefined {
  const weight = type2NumberOrUndefined(draft.weight);
  const height = type2NumberOrUndefined(draft.height);
  if (!weight || !height) return undefined;
  return Math.round((weight / ((height / 100) ** 2)) * 10) / 10;
}

export interface Type2ClinicalContextProjectionInput {
  context: Type2CoreContextDraft;
  structuredContext: Type2StructuredIntakeDraft;
  factors: readonly Type2DecisionFactor[];
  worldDrugDomains: readonly MedicationClinicalDomain[];
}

/**
 * Projects the active `/type-2` clinician intake into the structured request.
 * This is a mechanical projection only: absent clinical facts remain absent and
 * CrCl is never derived from eGFR.
 */
export function type2ClinicalContextFromActiveIntake(
  input: Type2ClinicalContextProjectionInput,
): NonNullable<Type2StructuredConsiderationRequestV2["clinicalContext"]> {
  const { context, structuredContext, factors, worldDrugDomains } = input;
  const specialist = structuredClinicalContextFromDraft(structuredContext, { factors, worldDrugDomains });
  const bmi = type2BmiFromCoreDraft(context);

  return {
    pregnancy: factors.includes("pregnancy"),
    cardiovascular: {
      ascvd: factors.includes("ascvd"),
      heartFailure: factors.includes("heart_failure"),
      lvefPercent: type2NumberOrUndefined(context.lvef),
    },
    kidney: {
      ckd: factors.includes("ckd"),
      eGfr: type2NumberOrUndefined(context.eGfr),
      creatinineClearanceMlMin: type2NumberOrUndefined(context.creatinineClearanceMlMin),
      uacrMgG: type2NumberOrUndefined(context.uacr),
      potassiumMmolL: type2NumberOrUndefined(context.potassiumMmolL),
      dialysis: context.dialysis,
      recentAki: context.recentAki,
    },
    liver: {
      masldMash: factors.includes("masld_mash"),
      fibrosisStage: context.fibrosisStage || undefined,
      cirrhosis: context.cirrhosis,
      decompensatedCirrhosis: context.decompensatedCirrhosis,
    },
    anthropometrics: {
      weightKg: type2NumberOrUndefined(context.weight),
      heightCm: type2NumberOrUndefined(context.height),
      bmi,
    },
    ...specialist,
  };
}
