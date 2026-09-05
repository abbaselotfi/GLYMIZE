import type { MedicationClinicalDomain } from "@glymize/contracts";

/**
 * Explicit runtime-facing capability boundary for Type 2 multidomain support.
 *
 * `review_only` means WorldDrug may surface approved/current-market medicines for
 * clinician review, but Decision Graph must not treat them as executable.
 * `specialist_or_escalation` means the domain is intentionally not an autonomous
 * medication lane in the general diabetes workflow.
 */
export type ClinicalDomainExecutionState =
  | "executable"
  | "partially_executable"
  | "review_only"
  | "specialist_or_escalation"
  | "safety_context";

export interface ClinicalDomainCapability {
  domain: MedicationClinicalDomain;
  executionState: ClinicalDomainExecutionState;
  decisionGraphLanes: string[];
  executableObjectives: string[];
  minimumSafeInputs: string[];
  evidenceAuthorities: string[];
  boundary: string;
  nextGap?: string;
}

export const clinicalDomainCapabilities: readonly ClinicalDomainCapability[] = [
  {
    domain: "diabetes",
    executionState: "executable",
    decisionGraphLanes: ["glycemic"],
    executableObjectives: ["glycemic_control", "high_efficacy_glycemic_control", "insulin_replacement"],
    minimumSafeInputs: ["currentHba1c", "targetHba1c", "current medications", "pathway-specific renal/weight/glucose inputs"],
    evidenceAuthorities: ["ADA 2026 Section 9", "ADA/EASD 2022", "product regulatory labels"],
    boundary: "Authoritative Decision Graph v2 pathway with product-specific dose execution for the reviewed core cohort.",
  },
  {
    domain: "cardiovascular",
    executionState: "partially_executable",
    decisionGraphLanes: ["ascvd", "heart_failure", "hypertension", "lipids"],
    executableObjectives: ["ascvd_protection", "heart_failure_protection", "blood_pressure_control", "lipid_risk_reduction"],
    minimumSafeInputs: ["specific cardiovascular phenotype rather than umbrella cardiovascular=true"],
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
    evidenceAuthorities: ["ADA 2026 Section 11", "KDIGO CKD 2024", "KDIGO Diabetes-CKD 2022", "product regulatory labels"],
    boundary: "Renal execution is phenotype- and label-gated; CrCl is never inferred from eGFR.",
  },
  {
    domain: "liver",
    executionState: "review_only",
    decisionGraphLanes: ["liver"],
    executableObjectives: [],
    minimumSafeInputs: ["MASLD/MASH confirmation", "fibrosis stage", "cirrhosis/decompensation", "weight", "interaction/monitoring context"],
    evidenceAuthorities: ["EASL-EASD-EASO MASLD 2024", "AASLD resmetirom 2024", "AASLD semaglutide MASH 2025"],
    boundary: "A liver-directed preference exists, but no dedicated approved liver product-dose pathway is yet executable.",
    nextGap: "Implement F2-F3 noncirrhotic MASH protocols for resmetirom and semaglutide from current regulatory labels, with interaction and safety gates.",
  },
  {
    domain: "obesity",
    executionState: "partially_executable",
    decisionGraphLanes: ["glycemic"],
    executableObjectives: ["weight_benefit"],
    minimumSafeInputs: ["BMI/weight", "Type 2 treatment context", "product-specific contraindications"],
    evidenceAuthorities: ["ADA 2026 Section 9", "reviewed GLP-1/GIP-GLP-1 product labels"],
    boundary: "Weight is an explicit Type 2 preference axis; a standalone obesity-prescribing engine is not implied.",
    nextGap: "Keep obesity execution inside reviewed Type 2 indications until a separate obesity module is explicitly scoped.",
  },
  {
    domain: "hypertension",
    executionState: "executable",
    decisionGraphLanes: ["hypertension"],
    executableObjectives: ["blood_pressure_control"],
    minimumSafeInputs: ["treatment-range BP", "established hypertension-treatment context", "represented RAAS indication", "renal/potassium facts as product requires"],
    evidenceAuthorities: ["ADA 2026 Section 10", "ACC/AHA Hypertension 2025", "ACEi/ARB product labels"],
    boundary: "A single encounter BP does not create a hypertension diagnosis or autonomous initiation.",
  },
  {
    domain: "lipids",
    executionState: "executable",
    decisionGraphLanes: ["lipids"],
    executableObjectives: ["lipid_risk_reduction"],
    minimumSafeInputs: ["age", "ASCVD status", "CrCl for renal-specific statin branch when required", "pregnancy context"],
    evidenceAuthorities: ["ADA 2026 Section 10", "ACC/AHA Dyslipidemia 2026", "statin product labels"],
    boundary: "Statin indication and product dose are separate; unsupported nonstatin classes remain review-only.",
  },
  {
    domain: "heart_failure",
    executionState: "executable",
    decisionGraphLanes: ["heart_failure"],
    executableObjectives: ["heart_failure_protection"],
    minimumSafeInputs: ["heart-failure phenotype", "LVEF for HFrEF-specific MRA", "eGFR", "potassium"],
    evidenceAuthorities: ["AHA/ACC/HFSA 2022", "ACC HFrEF 2024", "ADA 2026 Section 10", "product regulatory labels"],
    boundary: "Current dedicated MRA execution is HFrEF-specific; heartFailure=true alone is not sufficient for spironolactone.",
  },
  {
    domain: "ascvd",
    executionState: "executable",
    decisionGraphLanes: ["ascvd", "lipids"],
    executableObjectives: ["ascvd_protection", "lipid_risk_reduction"],
    minimumSafeInputs: ["established ASCVD phenotype", "relevant medication safety facts"],
    evidenceAuthorities: ["ADA 2026 Sections 9 and 10", "ESC Diabetes-CVD 2023", "ACC/AHA Dyslipidemia 2026"],
    boundary: "ASCVD creates independent organ-protection and lipid objectives; unsupported adjunct classes remain review-only until protocolized.",
  },
  {
    domain: "masld_mash",
    executionState: "review_only",
    decisionGraphLanes: ["liver"],
    executableObjectives: [],
    minimumSafeInputs: ["adult status", "confirmed MASH", "F2/F3 fibrosis", "noncirrhotic state", "weight", "medication interactions"],
    evidenceAuthorities: ["EASL-EASD-EASO MASLD 2024", "AASLD resmetirom 2024", "AASLD semaglutide MASH 2025", "current regulatory labels"],
    boundary: "WorldDrug review visibility is active, but MASH pharmacotherapy must remain non-executable until exact product protocols are merged.",
    nextGap: "First completeness implementation target: resmetirom and semaglutide MASH execution with label-derived dosing and monitoring.",
  },
  {
    domain: "neuropathy",
    executionState: "review_only",
    decisionGraphLanes: [],
    executableObjectives: [],
    minimumSafeInputs: ["physician-confirmed painful diabetic peripheral neuropathy", "pain severity/impact", "renal function", "concurrent CNS/psychiatric medicines", "age/fall-risk context"],
    evidenceAuthorities: ["ADA 2026 Section 12", "AAN painful diabetic polyneuropathy guideline update"],
    boundary: "ADA recommends medication classes, but diabetic neuropathy is a diagnosis of exclusion; generic domain activation cannot autonomously prescribe analgesic therapy.",
    nextGap: "Add an explicit painful-DPN phenotype/context and reviewed pregabalin/duloxetine-first product protocols; keep opioids excluded from the routine pathway.",
  },
  {
    domain: "retinopathy",
    executionState: "specialist_or_escalation",
    decisionGraphLanes: [],
    executableObjectives: [],
    minimumSafeInputs: ["retinopathy severity", "DME/PDR phenotype", "visual acuity/ophthalmology assessment", "pregnancy context"],
    evidenceAuthorities: ["ADA 2026 Section 12"],
    boundary: "Vision-threatening disease is an ophthalmology treatment/referral pathway; WorldDrug visibility must not become autonomous intravitreal prescribing in the general Type 2 workflow.",
    nextGap: "Implement referral/escalation and specialist-treatment evidence cards before considering any specialist-only product execution.",
  },
  {
    domain: "diabetic_foot",
    executionState: "specialist_or_escalation",
    decisionGraphLanes: ["diabetic_foot"],
    executableObjectives: [],
    minimumSafeInputs: ["ulcer/infection confirmation", "IWGDF/IDSA severity", "ischemia/PAD", "osteomyelitis suspicion", "culture data when indicated", "renal function/allergy context"],
    evidenceAuthorities: ["IWGDF/IDSA Infection 2023", "IWGDF Wound Healing 2023", "ADA 2026 Section 12"],
    boundary: "Clinically uninfected ulcers must not receive antibiotics; antibiotic choice is infection-, pathogen-, severity-, interaction-, and local-protocol dependent.",
    nextGap: "Build severity/referral/source-control workflow first; do not create a generic automatic antibiotic lane from diabetic_foot=true.",
  },
  {
    domain: "nutrition_support",
    executionState: "review_only",
    decisionGraphLanes: [],
    executableObjectives: [],
    minimumSafeInputs: ["specific nutritional diagnosis/indication", "route and intake context", "relevant laboratory deficiencies"],
    evidenceAuthorities: [],
    boundary: "The current WorldDrug domain is informational; no generic vitamin/mineral or enteral/parenteral prescription is inferred from diabetes alone.",
    nextGap: "Scope evidence and explicit deficiency/indication pathways before any executable nutrition-support recommendation.",
  },
  {
    domain: "pregnancy",
    executionState: "safety_context",
    decisionGraphLanes: ["glycemic"],
    executableObjectives: [],
    minimumSafeInputs: ["pregnancy status", "glycemic state", "current medicines", "obstetric/renal/retinal context"],
    evidenceAuthorities: ["ADA 2026 Section 15", "product pregnancy labeling"],
    boundary: "Pregnancy currently acts as a high-priority safety/exclusion context; it is not a free-standing multidomain drug lane.",
    nextGap: "Audit the dedicated diabetes-in-pregnancy insulin pathway separately before claiming complete executable pregnancy treatment.",
  },
] as const;

export function clinicalDomainCapability(domain: MedicationClinicalDomain) {
  return clinicalDomainCapabilities.find((item) => item.domain === domain)!;
}
