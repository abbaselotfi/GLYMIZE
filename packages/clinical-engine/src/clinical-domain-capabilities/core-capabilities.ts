import type { ClinicalDomainCapability } from "./types.js";

export const coreClinicalDomainCapabilities = [
  {
    domain: "diabetes",
    executionState: "executable",
    decisionGraphLanes: ["glycemic"],
    executableObjectives: ["glycemic_control", "high_efficacy_glycemic_control", "insulin_replacement"],
    minimumSafeInputs: ["currentHba1c", "targetHba1c", "current medications", "pathway-specific renal/weight/glucose inputs"],
    inputContract: {
      core: ["core.current_hba1c", "core.target_hba1c", "core.current_medications"],
      conditional: [
        "kidney.egfr",
        "kidney.creatinine_clearance",
        "anthropometrics.weight_kg",
        "anthropometrics.bmi",
        "glycemia.fasting",
        "glycemia.two_hour_postprandial",
        "glycemia.random",
        "core.hyperglycemia_symptoms",
        "core.catabolic_features",
      ],
    },
    evidenceAuthorities: ["ADA 2026 Section 9", "ADA/EASD 2022", "product regulatory labels"],
    boundary: "Authoritative Decision Graph v2 pathway with product-specific dose execution for the reviewed core cohort.",
  },
  {
    domain: "cardiovascular",
    executionState: "partially_executable",
    decisionGraphLanes: ["ascvd", "heart_failure", "hypertension", "lipids"],
    executableObjectives: ["ascvd_protection", "heart_failure_protection", "blood_pressure_control", "lipid_risk_reduction"],
    minimumSafeInputs: ["specific cardiovascular phenotype rather than umbrella cardiovascular=true"],
    inputContract: {
      core: ["cardiovascular.ascvd", "cardiovascular.heart_failure"],
      conditional: [
        "cardiovascular.lvef_percent",
        "cardiovascular.nyha_class",
        "cardiovascular.systolic_bp",
        "cardiovascular.diastolic_bp",
      ],
    },
    evidenceAuthorities: ["ADA 2026 Section 10", "ESC Diabetes-CVD 2023", "AHA/ACC/HFSA 2022", "ACC HFrEF 2024"],
    boundary: "Executable only through a represented sub-phenotype; generic cardiovascular disease does not invent a drug objective.",
    nextGap: "Expand only named cardiovascular phenotypes with their own current guideline and product-label execution.",
  },
  {
    domain: "kidney",
    executionState: "executable",
    decisionGraphLanes: ["kidney"],
    executableObjectives: ["kidney_protection"],
    minimumSafeInputs: ["CKD status", "eGFR", "UACR when relevant", "potassium for MRA", "explicit CrCl when a label requires CrCl", "dialysis status"],
    inputContract: {
      core: ["kidney.ckd"],
      conditional: ["kidney.egfr", "kidney.uacr", "kidney.potassium", "kidney.creatinine_clearance", "kidney.dialysis"],
    },
    evidenceAuthorities: ["ADA 2026 Section 11", "KDIGO CKD 2024", "KDIGO Diabetes-CKD 2022", "product regulatory labels"],
    boundary: "Renal execution is phenotype- and label-gated; CrCl is never inferred from eGFR.",
  },
] as const satisfies readonly ClinicalDomainCapability[];
