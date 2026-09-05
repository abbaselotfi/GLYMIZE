import { multidomainGuidelineSources } from "./guideline-sources-multidomain.js";

export type ClinicalEvidenceSourceKind = "guideline" | "consensus" | "regulatory";

export interface ClinicalEvidenceSource {
  id: string;
  shortCode: string;
  publisher: string;
  title: string;
  sourceKind: ClinicalEvidenceSourceKind;
  sourceUrl: string;
  activeVersion: string;
  publishedAt: string;
  monitored: boolean;
  engineInfluence: boolean;
  engineDomains: string[];
  engineRoleFa: string;
  engineRoleEn: string;
  lastCheckedAt?: string;
}

/**
 * Single source of truth for evidence that is allowed to affect the GLYMIZE
 * clinical engine. A source is shown on the clinician dashboard only when
 * `engineInfluence` is true. Update checks never change rules automatically;
 * a reviewed code change / approved rule version is still required.
 */
export const activeGuidelineSources: ClinicalEvidenceSource[] = [
  {
    id: "ada-2026",
    shortCode: "ADA 2026",
    publisher: "ADA",
    title: "Standards of Care in Diabetes — Pharmacologic Approaches to Glycemic Treatment",
    sourceKind: "guideline",
    sourceUrl: "https://diabetesjournals.org/docm-care/article/doi/10.2337/doc26-a009/164622/Section-9-Pharmacologic-Approaches-to-Glycemic",
    activeVersion: "Standards of Care in Diabetes—2026 / Section 9",
    publishedAt: "2025-12-08",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["glycemic_control", "ascvd", "heart_failure", "ckd", "weight", "hypoglycemia", "insulin"],
    engineRoleFa: "هسته مسیر درمان دیابت نوع ۲، تشدید درمان، اولویت GLP-1/SGLT2 و مسیر انسولین",
    engineRoleEn: "Core type 2 pathway, intensification, GLP-1/SGLT2 priorities, and insulin pathway",
  },
  {
    id: "easd-2022",
    shortCode: "EASD",
    publisher: "EASD",
    title: "Management of Hyperglycemia in Type 2 Diabetes — ADA/EASD Consensus Report",
    sourceKind: "consensus",
    sourceUrl: "https://diabetesjournals.org/care/article/45/11/2753/147671/Management-of-Hyperglycemia-in-Type-2-Diabetes",
    activeVersion: "ADA/EASD consensus report 2022",
    publishedAt: "2022-09-28",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["glycemic_control", "cardiorenal", "weight", "hypoglycemia", "person_centered_care"],
    engineRoleFa: "فردمحوری، وزن، ریسک هیپوگلیسمی و انتخاب درمان با توجه به بیماری‌های قلبی‌ـ‌کلیوی",
    engineRoleEn: "Person-centred care, weight, hypoglycemia risk, and cardiorenal treatment selection",
  },
  {
    id: "kdigo-ckd-2024",
    shortCode: "KDIGO-CKD 2024",
    publisher: "KDIGO",
    title: "Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
    sourceKind: "guideline",
    sourceUrl: "https://kdigo.org/guidelines/ckd-evaluation-and-management/kdigo-2024-ckd-guideline/",
    activeVersion: "KDIGO 2024 CKD Guideline",
    publishedAt: "2024-03-13",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["ckd", "egfr", "uacr", "medication_stewardship", "cardiorenal"],
    engineRoleFa: "زمینه CKD، عملکرد کلیه، آلبومینوری و ایمنی/انتخاب دارو در بیماری کلیوی",
    engineRoleEn: "CKD context, kidney function, albuminuria, and medication stewardship",
  },
  {
    id: "kdigo-dmckd-2022",
    shortCode: "KDIGO-DMCKD 2022",
    publisher: "KDIGO",
    title: "Clinical Practice Guideline for Diabetes Management in Chronic Kidney Disease",
    sourceKind: "guideline",
    sourceUrl: "https://kdigo.org/guidelines/diabetes-ckd/kdigo-2022-clinical-practice-guideline-for-diabetes-management-in-ckd/",
    activeVersion: "KDIGO Diabetes in CKD 2022",
    publishedAt: "2022-10-18",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["diabetes", "ckd", "sglt2", "glp1", "metformin", "cardiorenal"],
    engineRoleFa: "اولویت‌های درمان دیابت همراه CKD و قواعد ایمنی مرتبط با عملکرد کلیه",
    engineRoleEn: "Diabetes-with-CKD treatment priorities and kidney-function safety rules",
  },
  {
    id: "easl-masld-2024",
    shortCode: "EASL-MASLD 2024",
    publisher: "EASL/EASD/EASO",
    title: "Clinical Practice Guidelines on the Management of MASLD",
    sourceKind: "guideline",
    sourceUrl: "https://easl.eu/publication/easl-easd-easo-clinical-practice-guidelines-managment-of-metabolic-dysfunction-associated-steatotic-liver-disease/",
    activeVersion: "EASL–EASD–EASO MASLD 2024",
    publishedAt: "2024-07-15",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["masld_mash", "fibrosis", "cirrhosis", "weight", "metabolic_risk"],
    engineRoleFa: "فعال‌سازی مسیر MASLD/MASH، مرحله فیبروز و احتیاط‌های سیروز در تصمیم‌گیری",
    engineRoleEn: "MASLD/MASH pathway, fibrosis staging, and cirrhosis-aware decision support",
  },
  {
    id: "esc-dm-cvd-2023",
    shortCode: "ESC-DM-CVD 2023",
    publisher: "ESC",
    title: "Guidelines for the Management of Cardiovascular Disease in Patients with Diabetes",
    sourceKind: "guideline",
    sourceUrl: "https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/cvd-and-diabetes/",
    activeVersion: "ESC CVD and Diabetes 2023",
    publishedAt: "2023-08-25",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["ascvd", "heart_failure", "ckd", "cardiorenal"],
    engineRoleFa: "رتبه‌بندی داروها در ASCVD و نارسایی قلبی و هم‌پوشانی قلبی‌ـ‌کلیوی",
    engineRoleEn: "Medication ranking for ASCVD, heart failure, and cardiorenal overlap",
  },
  {
    id: "iwgdf-inf-2023",
    shortCode: "IWGDF-INF 2023",
    publisher: "IWGDF/IDSA",
    title: "Guideline on the Diagnosis and Treatment of Diabetes-related Foot Infections",
    sourceKind: "guideline",
    sourceUrl: "https://iwgdfguidelines.org/infection-guideline-2023/",
    activeVersion: "IWGDF/IDSA Infection Guideline 2023",
    publishedAt: "2023-05-13",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["diabetic_foot", "infection", "escalation"],
    engineRoleFa: "هشدار و ارجاع مسیر پای دیابتی/عفونت؛ این منبع رتبه داروی کاهنده قند را به‌طور مصنوعی تغییر نمی‌دهد",
    engineRoleEn: "Diabetic-foot/infection escalation; it does not artificially re-rank glucose-lowering drugs",
  },
  {
    id: "iwgdf-wound-2023",
    shortCode: "IWGDF-WOUND 2023",
    publisher: "IWGDF",
    title: "Wound Healing Interventions Guideline",
    sourceKind: "guideline",
    sourceUrl: "https://iwgdfguidelines.org/wound-healing-2023/",
    activeVersion: "IWGDF Wound Healing 2023",
    publishedAt: "2023-05-13",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["diabetic_foot", "wound_healing", "escalation"],
    engineRoleFa: "مسیر ارزیابی و مراقبت زخم پای دیابتی در صورت فعال شدن عامل diabetic foot",
    engineRoleEn: "Diabetic-foot wound pathway when the diabetic-foot factor is active",
  },
  {
    id: "ema-resmetirom-2025",
    shortCode: "EMA-RESMETIROM 2025",
    publisher: "EMA",
    title: "Rezdiffra (resmetirom) — European Public Assessment Report",
    sourceKind: "regulatory",
    sourceUrl: "https://www.ema.europa.eu/en/medicines/human/EPAR/rezdiffra",
    activeVersion: "EU conditional marketing authorisation 2025",
    publishedAt: "2025-08-18",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["mash", "fibrosis_f2_f3", "resmetirom", "regulatory_eligibility"],
    engineRoleFa: "قواعد واجدشرایط‌بودن Resmetirom فقط برای MASH غیرسیروتیک با فیبروز F2–F3؛ منبع رگولاتوری است نه guideline",
    engineRoleEn: "Resmetirom eligibility for non-cirrhotic MASH with F2–F3 fibrosis; regulatory source, not a guideline",
  },
  {
    id: "US-LABEL-ENALAPRIL-2026",
    shortCode: "ENALAPRIL PI 2026",
    publisher: "DailyMed / FDA label",
    title: "Enalapril maleate tablets — U.S. prescribing information",
    sourceKind: "regulatory",
    sourceUrl: "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=63187a94-9ac7-4320-ac70-0631e08c2b8d",
    activeVersion: "DailyMed revised 06/2026",
    publishedAt: "2026-06-26",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["hypertension", "heart_failure", "crcl", "renal_dose", "enalapril"],
    engineRoleFa: "دوز شروع و تنظیم کلیوی انالاپریل بر اساس CrCl و مسیر نارسایی قلبی",
    engineRoleEn: "Enalapril initiation and renal dose adjustment by CrCl, plus heart-failure dosing",
    lastCheckedAt: "2026-09-05",
  },
  {
    id: "US-LABEL-LOSARTAN-2026",
    shortCode: "LOSARTAN PI 2026",
    publisher: "DailyMed / FDA label",
    title: "Losartan potassium tablets — U.S. prescribing information",
    sourceKind: "regulatory",
    sourceUrl: "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e5886220-43b7-46e1-9034-5242ba245bd1",
    activeVersion: "DailyMed updated 2026-01-13",
    publishedAt: "2026-01-13",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["hypertension", "ckd", "raas", "losartan"],
    engineRoleFa: "دوز محصولی losartan، پایش کلیه/پتاسیم و محدودیت‌های برچسب",
    engineRoleEn: "Losartan product dosing, renal/potassium monitoring, and label constraints",
    lastCheckedAt: "2026-09-05",
  },
  {
    id: "US-LABEL-VALSARTAN-2026",
    shortCode: "VALSARTAN PI 2026",
    publisher: "DailyMed / FDA label",
    title: "Valsartan tablets — U.S. prescribing information",
    sourceKind: "regulatory",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=04b3c573-4ef7-5cf6-e063-6294a90a2c5f",
    activeVersion: "DailyMed revised 06/2026",
    publishedAt: "2026-06-25",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["hypertension", "heart_failure", "raas", "valsartan"],
    engineRoleFa: "دوز شروع valsartan در فشارخون و نارسایی قلبی و پایش کلیه/پتاسیم",
    engineRoleEn: "Valsartan initiation in hypertension and heart failure with renal/potassium monitoring",
    lastCheckedAt: "2026-09-05",
  },
  {
    id: "US-LABEL-SPIRONOLACTONE-2026",
    shortCode: "SPIRONOLACTONE PI 2026",
    publisher: "DailyMed / FDA label",
    title: "Spironolactone tablets — U.S. prescribing information",
    sourceKind: "regulatory",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b119ed8a-289a-46c5-9778-6b07e4c061c4",
    activeVersion: "DailyMed updated 2026-06-01",
    publishedAt: "2026-06-01",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["heart_failure", "mra", "egfr", "potassium", "spironolactone"],
    engineRoleFa: "دوز MRA در HFrEF با شاخه‌های eGFR و پتاسیم",
    engineRoleEn: "MRA dosing in HFrEF with eGFR and potassium branches",
    lastCheckedAt: "2026-09-05",
  },
  {
    id: "US-LABEL-KERENDIA-2025",
    shortCode: "KERENDIA PI 2025",
    publisher: "DailyMed / FDA label",
    title: "Kerendia (finerenone) — U.S. prescribing information",
    sourceKind: "regulatory",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fc726765-5d5a-4d6e-b037-b847bda9fb7c",
    activeVersion: "DailyMed updated 2025-08-28",
    publishedAt: "2025-08-28",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["ckd", "albuminuria", "finerenone", "egfr", "potassium"],
    engineRoleFa: "دوز شروع finerenone بر اساس eGFR و پتاسیم و پایش چهار هفته‌ای",
    engineRoleEn: "Finerenone initiation by eGFR and potassium with four-week monitoring",
    lastCheckedAt: "2026-09-05",
  },
  {
    id: "US-LABEL-ATORVASTATIN-2026",
    shortCode: "ATORVASTATIN PI 2026",
    publisher: "DailyMed / FDA label",
    title: "Atorvastatin calcium tablets — U.S. prescribing information",
    sourceKind: "regulatory",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=0e24e7cb-1949-6686-e063-6394a90a4760",
    activeVersion: "DailyMed updated 2026-03-06",
    publishedAt: "2026-03-06",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["lipids", "ascvd", "statin", "atorvastatin"],
    engineRoleFa: "دوز شروع و محدوده دوز atorvastatin و پایش پاسخ LDL-C",
    engineRoleEn: "Atorvastatin initiation, dose range, and LDL-C response monitoring",
    lastCheckedAt: "2026-09-05",
  },
  {
    id: "US-LABEL-ROSUVASTATIN-2026",
    shortCode: "ROSUVASTATIN PI 2026",
    publisher: "DailyMed / FDA label",
    title: "Rosuvastatin tablets — U.S. prescribing information",
    sourceKind: "regulatory",
    sourceUrl: "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5c992d3d-d754-48b6-a267-1451208352ed",
    activeVersion: "DailyMed updated 2026-09-01",
    publishedAt: "2026-09-01",
    monitored: true,
    engineInfluence: true,
    engineDomains: ["lipids", "ascvd", "statin", "crcl", "renal_dose", "rosuvastatin"],
    engineRoleFa: "دوز rosuvastatin و محدودیت صریح CrCl کمتر از ۳۰ در نارسایی شدید کلیه",
    engineRoleEn: "Rosuvastatin dosing with explicit severe-renal CrCl <30 limit",
    lastCheckedAt: "2026-09-05",
  },
  ...multidomainGuidelineSources,
];

export const engineEvidenceSources = activeGuidelineSources.filter((source) => source.engineInfluence);

export function evidenceSourcesFor(ids: readonly string[]) {
  const wanted = new Set(ids);
  return activeGuidelineSources.filter((source) => wanted.has(source.id));
}

export function evidenceReference(ids: readonly string[]) {
  return evidenceSourcesFor(ids).map((source) => `${source.shortCode}: ${source.activeVersion}`).join(" | ");
}

export function primaryEvidenceUrl(ids: readonly string[]) {
  return evidenceSourcesFor(ids)[0]?.sourceUrl ?? activeGuidelineSources[0]!.sourceUrl;
}
