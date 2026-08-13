import type { CurrentMedicationInput, PatientHandoffRecord, Type2DecisionFactor } from "@glymize/contracts";

export interface Type2HandoffPrefill {
  currentHba1c?: number;
  eGfr?: number;
  uacrMgG?: number;
  dialysis?: boolean;
  weightKg?: number;
  heightCm?: number;
  factors: Type2DecisionFactor[];
  currentMedications: CurrentMedicationInput[];
}

export function extractConfirmedType2Handoff(record: PatientHandoffRecord): Type2HandoffPrefill {
  return { factors: [], currentMedications: [] };
}
