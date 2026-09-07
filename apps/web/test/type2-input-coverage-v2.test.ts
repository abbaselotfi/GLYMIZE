import { describe, expect, it } from "vitest";
import { type2ClinicalInputCatalogV2 } from "@glymize/clinical-engine/type2-input-contract-v2";
import {
  type2UiInputCoverageV2,
  type2UiInputGapsV2,
} from "../app/type-2/type2-input-coverage-v2";

describe("Type 2 capability/UI input coverage contract", () => {
  it("covers every machine-readable clinical input identity exactly once", () => {
    expect(Object.keys(type2UiInputCoverageV2).sort()).toEqual(Object.keys(type2ClinicalInputCatalogV2).sort());
  });

  it("describes the active scenario form rather than an inactive legacy client", () => {
    expect(type2UiInputCoverageV2["kidney.creatinine_clearance"].state).toBe("collected");
    expect(type2UiInputCoverageV2["kidney.creatinine_clearance"].surface).toBe("core_form");
    expect(type2UiInputCoverageV2["kidney.creatinine_clearance"].note?.toLocaleLowerCase()).toContain("never inferred");

    expect(type2UiInputCoverageV2["current_medication.interval_stage_reconciliation"].state).toBe("collected");
    expect(type2UiInputCoverageV2["current_medication.interval_stage_reconciliation"].surface).toBe("core_form");
    expect(type2UiInputCoverageV2["current_medication.interval_stage_reconciliation"].note?.toLocaleLowerCase()).toContain("never inferred");
    expect(type2UiInputCoverageV2["current_medication.interval_stage_reconciliation"].note?.toLocaleLowerCase()).toContain("partial");

    expect(type2UiInputCoverageV2["cardiovascular.nyha_class"].state).toBe("not_collected");
    expect(type2UiInputCoverageV2["cardiovascular.nyha_class"].surface).toBe("none");

    for (const id of [
      "cardiovascular.systolic_bp",
      "cardiovascular.diastolic_bp",
    ] as const) {
      expect(type2UiInputCoverageV2[id].state).toBe("collected");
      expect(type2UiInputCoverageV2[id].surface).toBe("structured_form");
      expect(type2UiInputCoverageV2[id].note?.toLocaleLowerCase()).toContain("explicit encounter");
      expect(type2UiInputCoverageV2[id].note?.toLocaleLowerCase()).toContain("never promoted");
    }
  });

  it("marks DOB-derived age and explicit DPN safety facts as represented", () => {
    expect(type2UiInputCoverageV2["core.age_years"].state).toBe("derived");
    expect(type2UiInputCoverageV2["core.age_years"].surface).toBe("core_form");
    expect(type2UiInputCoverageV2["core.age_years"].note?.toLocaleLowerCase()).toContain("date of birth");
    expect(type2UiInputCoverageV2["core.age_years"].note?.toLocaleLowerCase()).toContain("fail-closed");
    for (const id of [
      "medication_safety.maoi_exposure",
      "medication_safety.substantial_alcohol_use",
      "medication_safety.pregabalin_hypersensitivity",
    ] as const) {
      expect(type2UiInputCoverageV2[id].state).toBe("collected");
      expect(type2UiInputCoverageV2[id].surface).toBe("structured_form");
      expect(type2UiInputCoverageV2[id].note?.toLocaleLowerCase()).toContain("tri-state");
      expect(type2UiInputCoverageV2[id].note?.toLocaleLowerCase()).toContain("unknown");
      expect(type2UiInputCoverageV2[id].note?.toLocaleLowerCase()).toContain("never inferred");
    }
  });

  it("keeps semantically unrepresented safety and treatment contexts fail-closed", () => {
    expect(type2UiInputCoverageV2["safety.product_specific_screen"].state).toBe("not_represented");
    expect(type2UiInputCoverageV2["hypertension.established_treatment_context"].state).toBe("not_represented");
  });

  it("distinguishes explicit fields from safe deterministic derivations", () => {
    expect(type2UiInputCoverageV2["core.current_hba1c"].state).toBe("collected");
    expect(type2UiInputCoverageV2["kidney.egfr"].state).toBe("collected");
    expect(type2UiInputCoverageV2["neuropathy.dpn_confirmed"].state).toBe("collected");
    expect(type2UiInputCoverageV2["anthropometrics.bmi"].state).toBe("derived");
    expect(type2UiInputCoverageV2["core.pregnancy"].state).toBe("derived");
    expect(type2UiInputCoverageV2["core.pregnancy"].surface).toBe("core_form");
  });

  it("publishes unresolved active-route gaps without mixing in collected inputs", () => {
    expect(type2UiInputGapsV2).toEqual(expect.arrayContaining([
      "cardiovascular.nyha_class",
      "safety.product_specific_screen",
      "hypertension.established_treatment_context",
    ]));
    expect(type2UiInputGapsV2).not.toContain("core.age_years");
    expect(type2UiInputGapsV2).not.toContain("cardiovascular.systolic_bp");
    expect(type2UiInputGapsV2).not.toContain("cardiovascular.diastolic_bp");
    expect(type2UiInputGapsV2).not.toContain("medication_safety.maoi_exposure");
    expect(type2UiInputGapsV2).not.toContain("medication_safety.substantial_alcohol_use");
    expect(type2UiInputGapsV2).not.toContain("medication_safety.pregabalin_hypersensitivity");
    expect(type2UiInputGapsV2).not.toContain("current_medication.interval_stage_reconciliation");
    expect(type2UiInputGapsV2).not.toContain("kidney.creatinine_clearance");
    expect(type2UiInputGapsV2).not.toContain("kidney.egfr");
    expect(type2UiInputGapsV2).not.toContain("retinopathy.severity");
  });
});
