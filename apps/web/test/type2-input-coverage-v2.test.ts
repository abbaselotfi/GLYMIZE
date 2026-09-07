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

  it("keeps request-supported but currently uncollected facts explicit", () => {
    expect(type2UiInputCoverageV2["core.age_years"].state).toBe("not_collected");
    expect(type2UiInputCoverageV2["kidney.creatinine_clearance"].state).toBe("not_collected");
    expect(type2UiInputCoverageV2["kidney.creatinine_clearance"].note?.toLocaleLowerCase()).toContain("never be inferred");
    for (const id of [
      "medication_safety.maoi_exposure",
      "medication_safety.substantial_alcohol_use",
      "medication_safety.pregabalin_hypersensitivity",
    ] as const) {
      expect(type2UiInputCoverageV2[id].state).toBe("not_collected");
    }
  });

  it("keeps semantically unrepresented safety/treatment/timing contexts fail-closed", () => {
    expect(type2UiInputCoverageV2["safety.product_specific_screen"].state).toBe("not_represented");
    expect(type2UiInputCoverageV2["hypertension.established_treatment_context"].state).toBe("not_represented");
    expect(type2UiInputCoverageV2["current_medication.interval_stage_reconciliation"].state).toBe("not_represented");
    expect(type2UiInputCoverageV2["current_medication.interval_stage_reconciliation"].note?.toLocaleLowerCase()).toContain("therapy phase");
  });

  it("distinguishes explicit fields from safe deterministic derivations", () => {
    expect(type2UiInputCoverageV2["core.current_hba1c"].state).toBe("collected");
    expect(type2UiInputCoverageV2["kidney.egfr"].state).toBe("collected");
    expect(type2UiInputCoverageV2["neuropathy.dpn_confirmed"].state).toBe("collected");
    expect(type2UiInputCoverageV2["anthropometrics.bmi"].state).toBe("derived");
    expect(type2UiInputCoverageV2["core.pregnancy"].state).toBe("derived");
  });

  it("publishes the unresolved UI gaps without mixing in collected inputs", () => {
    expect(type2UiInputGapsV2).toEqual(expect.arrayContaining([
      "core.age_years",
      "kidney.creatinine_clearance",
      "medication_safety.maoi_exposure",
      "medication_safety.substantial_alcohol_use",
      "medication_safety.pregabalin_hypersensitivity",
      "current_medication.interval_stage_reconciliation",
      "safety.product_specific_screen",
      "hypertension.established_treatment_context",
    ]));
    expect(type2UiInputGapsV2).not.toContain("kidney.egfr");
    expect(type2UiInputGapsV2).not.toContain("retinopathy.severity");
  });
});
