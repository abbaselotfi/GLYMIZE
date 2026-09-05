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
    executionState: "partially_executable",
    decisionGraphLanes: ["liver"],
    executableObjectives: ["liver_directed_therapy"],
    minimumSafeInputs: ["MASLD/MASH confirmation", "fibrosis stage", "cirrhosis/decompensation", "weight for resmetirom", "product-specific interaction/contraindication screening", "current medication reconciliation"],
    evidenceAuthorities: ["EASL-EASD-EASO MASLD 2024", "AASLD resmetirom 2024", "REZDIFFRA current regulatory label", "AASLD semaglutide MASH 2025", "WEGOVY current regulatory label"],
    boundary: "The liver lane executes only explicitly protocolized products and phenotypes: reviewed resmetirom and product-bound WEGOVY initiation for adult noncirrhotic F2-F3 MASH. Other liver medicines remain review-only.",
    nextGap: "Add interval-aware current-medication reconciliation and multi-step titration costing before claiming WEGOVY continuation and initiation-cost execution as complete.",
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
    executionState: "partially_executable",
    decisionGraphLanes: ["liver"],
    executableObjectives: ["liver_directed_therapy"],
    minimumSafeInputs: ["adult status", "confirmed MASH", "F2/F3 fibrosis", "explicit noncirrhotic state", "actual body weight when resmetirom is considered", "WEGOVY MTC/MEN2/hypersensitivity/gastroparesis/pancreatitis screen", "current GLP-1/semaglutide reconciliation"],
    evidenceAuthorities: ["EASL-EASD-EASO MASLD 2024", "AASLD resmetirom 2024", "REZDIFFRA current regulatory label", "AASLD semaglutide MASH 2025", "WEGOVY current regulatory label"],
    boundary: "Resmetirom and product-bound WEGOVY initiation are executable only for the reviewed adult F2-F3 noncirrhotic phenotype after their product-specific safety and Iran-market gates pass; other MASH medicines remain review-only.",
    nextGap: "Represent weekly current-medication intervals and multi-step titration cost phases before enabling WEGOVY continuation/cost execution.",
  },
  {
    domain: "neuropathy",
    executionState: "partially_executable",
    decisionGraphLanes: ["neuropathy"],
    executableObjectives: ["painful_dpn_symptom_control"],
    minimumSafeInputs: ["adult status", "physician-confirmed diabetic peripheral neuropathy", "painful symptoms", "absence of atypical diagnostic features", "CrCl for pregabalin", "eGFR/liver/MAOI/alcohol context for duloxetine", "pregabalin hypersensitivity"],
    evidenceAuthorities: ["ADA 2026 Section 12", "AAN painful diabetic polyneuropathy guideline update", "pregabalin regulatory label", "duloxetine regulatory label"],
    boundary: "Only the reviewed clinician-confirmed painful-DPN phenotype can execute the protocolized pregabalin/duloxetine branches; generic neuropathy activation and routine opioid use remain non-executable.",
    nextGap: "Expand only explicitly reviewed renal/product branches and additional nonopioid classes with exact labels and current-market eligibility.",
  },
  {
    domain: "retinopathy",
    executionState: "specialist_or_escalation",
    decisionGraphLanes: [],
    executableObjectives: [],
    minimumSafeInputs: ["retinopathy severity", "DME status", "center involvement/visual acuity when treatment evidence is interpreted", "pregnancy context"],
    evidenceAuthorities: ["ADA 2026 Section 12"],
    boundary: "The general engine now executes a prompt ophthalmology escalation for any DME, moderate-or-worse NPDR, or PDR while keeping intravitreal/laser treatment specialist-only and outside medication ranking.",
    nextGap: "Any specialist-only ophthalmic product execution must be separately scoped, reviewed, and isolated from the general Type 2 prescribing authority.",
  },
  {
    domain: "diabetic_foot",
    executionState: "specialist_or_escalation",
    decisionGraphLanes: ["diabetic_foot"],
    executableObjectives: [],
    minimumSafeInputs: ["ulcer confirmation", "clinical infection assessment", "IWGDF/IDSA severity", "ischemia/PAD", "danger features/source-control context", "osteomyelitis suspicion"],
    evidenceAuthorities: ["IWGDF/IDSA Infection 2023", "IWGDF Wound Healing 2023", "ADA 2026 Section 12"],
    boundary: "The structured ulcer/infection/severity/source-control pathway is implemented. Clinically uninfected ulcers cannot execute antibiotics; infected cases remain antimicrobial-review only and can trigger hospital/surgical/vascular escalation.",
    nextGap: "Do not add antibiotic product execution until pathogen/susceptibility, allergy, renal/interaction and local-protocol requirements are explicitly represented and reviewed.",
  },
  {
    domain: "nutrition_support",
    executionState: "review_only",
    decisionGraphLanes: [],
    executableObjectives: [],
    minimumSafeInputs: ["explicit nutrition-support intent", "named documented deficiency when applicable", "objective deficiency data", "malnutrition/special-population context"],
    evidenceAuthorities: ["ADA 2026 Section 5"],
    boundary: "The indication/deficiency safety pathway is implemented: diabetes alone cannot create vitamin/mineral/herbal or enteral/parenteral prescription execution; documented deficiency and malnutrition route to targeted review only.",
    nextGap: "Add nutrient-specific or nutrition-route-specific protocols only after their indication, objective data, product/route and dosing authority are separately reviewed.",
  },
  {
    domain: "pregnancy",
    executionState: "safety_context",
    decisionGraphLanes: ["glycemic"],
    executableObjectives: [],
    minimumSafeInputs: ["pregnancy status", "explicit diabetes type (T1D/T2D/GDM)", "pregnancy-specific glucose data", "current glucose-lowering medicines", "hypoglycemia context", "pregnancy specialist-team context"],
    evidenceAuthorities: ["ADA 2026 Section 15", "product pregnancy labeling"],
    boundary: "A dedicated pregnancy diabetes pathway now owns pregnancy targets, T1D insulin requirement, T2D insulin preference, GDM lifestyle/insulin escalation review, and medication reconciliation. Exact insulin dose/titration remains clinician/team controlled and non-autonomous.",
    nextGap: "Only add pregnancy insulin product/dose execution after a separate product-level audit proves gestation-aware initiation, frequent titration, hypoglycemia safeguards, and postpartum dose reduction handling.",
  },
] as const;

export function clinicalDomainCapability(domain: MedicationClinicalDomain) {
  return clinicalDomainCapabilities.find((item) => item.domain === domain)!;
}
