export type LabCategory =
  | "autoimmune"
  | "blood_gas"
  | "cardiac"
  | "coagulation"
  | "electrolytes"
  | "endocrine"
  | "glycemic"
  | "hematology"
  | "inflammation"
  | "iron"
  | "lipid"
  | "liver"
  | "metabolic"
  | "other"
  | "pancreas"
  | "renal"
  | "serology"
  | "thyroid"
  | "urinalysis"
  | "vitamins";

export type LabSpecimen =
  | "blood"
  | "plasma"
  | "serum_plasma"
  | "urine"
  | "whole_blood";

export type LabValueKind = "quantitative" | "qualitative";

export interface LabMasterEntry {
  canonicalKey: string;
  name: string;
  faName: string;
  category: LabCategory;
  specimens: readonly LabSpecimen[];
  valueKind: LabValueKind;
  defaultUnit?: string;
  allowedUnits: readonly string[];
  aliases: readonly string[];
  /**
   * Exact LOINC codes are intentionally not guessed here. A LOINC term is
   * specific to component/property/time/system/scale/method. Add a code only
   * after an exact mapping is verified for the observation context.
   */
  loincCode?: string;
}

export const LAB_MASTER_REGISTRY_VERSION = "2026-08-15";

export const LAB_MASTER_REGISTRY: readonly LabMasterEntry[] = [
  { canonicalKey: "hba1c", name: "HbA1c", faName: "هموگلوبین A1c", category: "glycemic", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["HbA1c", "هموگلوبین A1c", "A1C", "Hb A1c", "Glycated hemoglobin", "هموگلوبین گلیکوزیله"] },
  { canonicalKey: "fbs", name: "Fasting glucose", faName: "قند خون ناشتا", category: "glycemic", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Fasting glucose", "قند خون ناشتا", "FBS", "Fasting blood sugar", "Fasting blood glucose", "قند ناشتا", "گلوکز ناشتا"] },
  { canonicalKey: "glucose_random", name: "Random glucose", faName: "قند خون تصادفی", category: "glycemic", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Random glucose", "قند خون تصادفی", "RBS", "Random blood sugar", "Random blood glucose", "قند تصادفی"] },
  { canonicalKey: "glucose_2hpp", name: "2-hour postprandial glucose", faName: "قند ۲ ساعت پس از غذا", category: "glycemic", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["2-hour postprandial glucose", "قند ۲ ساعت پس از غذا", "2hpp", "2h pp", "2-hour PP", "Postprandial glucose", "قند دو ساعت بعد غذا"] },
  { canonicalKey: "glucose", name: "Glucose", faName: "گلوکز", category: "glycemic", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Glucose", "گلوکز", "Blood glucose", "Blood sugar", "قند خون"] },
  { canonicalKey: "fructosamine", name: "Fructosamine", faName: "فروکتوزامین", category: "glycemic", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "umol/L", allowedUnits: ["umol/L"], aliases: ["Fructosamine", "فروکتوزامین"] },
  { canonicalKey: "insulin", name: "Insulin", faName: "انسولین", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "uIU/mL", allowedUnits: ["uIU/mL", "mIU/L", "pmol/L"], aliases: ["Insulin", "انسولین", "Fasting insulin", "Insulin fasting"] },
  { canonicalKey: "c_peptide", name: "C-peptide", faName: "سی پپتید", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL", "nmol/L"], aliases: ["C-peptide", "سی پپتید", "C peptide", "C-Peptide"] },
  { canonicalKey: "creatinine", name: "Creatinine", faName: "کراتینین", category: "renal", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "umol/L"], aliases: ["Creatinine", "کراتینین", "Cr", "Serum creatinine"] },
  { canonicalKey: "egfr", name: "eGFR", faName: "eGFR", category: "renal", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mL/min/1.73m2", allowedUnits: ["mL/min/1.73m2"], aliases: ["eGFR", "Estimated GFR", "GFR estimated", "نرخ فیلتراسیون", "نرخ فیلتراسیون گلومرولی"] },
  { canonicalKey: "bun", name: "BUN", faName: "نیتروژن اوره خون", category: "renal", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["BUN", "نیتروژن اوره خون", "Blood urea nitrogen", "اوره نیتروژن خون"] },
  { canonicalKey: "urea", name: "Urea", faName: "اوره", category: "renal", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Urea", "اوره", "Serum urea"] },
  { canonicalKey: "cystatin_c", name: "Cystatin C", faName: "سیستاتین C", category: "renal", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/L", allowedUnits: ["mg/L"], aliases: ["Cystatin C", "سیستاتین C", "Cystatin-C", "سیستاتین"] },
  { canonicalKey: "uacr", name: "UACR", faName: "نسبت آلبومین به کراتینین ادرار", category: "renal", specimens: ["urine"], valueKind: "quantitative", defaultUnit: "mg/g", allowedUnits: ["mg/g", "mg/mmol"], aliases: ["UACR", "نسبت آلبومین به کراتینین ادرار", "ACR", "Urine albumin creatinine ratio", "Albumin/creatinine ratio", "نسبت آلبومین کراتینین"] },
  { canonicalKey: "urine_albumin", name: "Urine albumin", faName: "آلبومین ادرار", category: "renal", specimens: ["urine"], valueKind: "quantitative", defaultUnit: "mg/L", allowedUnits: ["mg/L", "mg/dL", "mg/24h"], aliases: ["Urine albumin", "آلبومین ادرار", "Microalbumin", "Urine microalbumin", "میکروآلبومین"] },
  { canonicalKey: "urine_creatinine", name: "Urine creatinine", faName: "کراتینین ادرار", category: "renal", specimens: ["urine"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mg/24h", "mmol/L"], aliases: ["Urine creatinine", "کراتینین ادرار", "Creatinine urine"] },
  { canonicalKey: "urine_protein", name: "Urine protein", faName: "پروتئین ادرار", category: "renal", specimens: ["urine"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mg/24h", "g/24h"], aliases: ["Urine protein", "پروتئین ادرار", "Protein urine", "Urinary protein"] },
  { canonicalKey: "protein_creatinine_ratio", name: "Urine protein/creatinine ratio", faName: "نسبت پروتئین به کراتینین ادرار", category: "renal", specimens: ["urine"], valueKind: "quantitative", defaultUnit: "mg/g", allowedUnits: ["mg/g", "mg/mmol"], aliases: ["Urine protein/creatinine ratio", "نسبت پروتئین به کراتینین ادرار", "UPCR", "PCR urine", "Protein/creatinine ratio"] },
  { canonicalKey: "sodium", name: "Sodium", faName: "سدیم", category: "electrolytes", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mmol/L", allowedUnits: ["mmol/L", "mEq/L"], aliases: ["Sodium", "سدیم", "Na", "Na+", "Sodium serum"] },
  { canonicalKey: "potassium", name: "Potassium", faName: "پتاسیم", category: "electrolytes", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mmol/L", allowedUnits: ["mmol/L", "mEq/L"], aliases: ["Potassium", "پتاسیم", "K+", "Potassium serum"] },
  { canonicalKey: "chloride", name: "Chloride", faName: "کلر", category: "electrolytes", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mmol/L", allowedUnits: ["mmol/L", "mEq/L"], aliases: ["Chloride", "کلر", "Cl", "Cl-", "Chloride serum"] },
  { canonicalKey: "bicarbonate", name: "Bicarbonate", faName: "بیکربنات", category: "electrolytes", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mmol/L", allowedUnits: ["mmol/L", "mEq/L"], aliases: ["Bicarbonate", "بیکربنات", "HCO3", "HCO3-", "Total CO2", "CO2 total"] },
  { canonicalKey: "calcium_total", name: "Calcium", faName: "کلسیم", category: "electrolytes", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Calcium", "کلسیم", "Total calcium", "Ca total"] },
  { canonicalKey: "calcium_ionized", name: "Ionized calcium", faName: "کلسیم یونیزه", category: "electrolytes", specimens: ["blood"], valueKind: "quantitative", defaultUnit: "mmol/L", allowedUnits: ["mmol/L", "mg/dL"], aliases: ["Ionized calcium", "کلسیم یونیزه", "Ionized Ca", "iCa"] },
  { canonicalKey: "magnesium", name: "Magnesium", faName: "منیزیم", category: "electrolytes", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Magnesium", "منیزیم", "Mg", "Magnesium serum"] },
  { canonicalKey: "phosphate", name: "Phosphate", faName: "فسفر", category: "electrolytes", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Phosphate", "فسفر", "Phosphorus", "P", "فوسفات"] },
  { canonicalKey: "uric_acid", name: "Uric acid", faName: "اسید اوریک", category: "metabolic", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "umol/L"], aliases: ["Uric acid", "اسید اوریک", "Urate", "Serum uric acid"] },
  { canonicalKey: "osmolality", name: "Serum osmolality", faName: "اسمولالیته سرم", category: "electrolytes", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mOsm/kg", allowedUnits: ["mOsm/kg"], aliases: ["Serum osmolality", "اسمولالیته سرم", "Osmolality", "Serum osm"] },
  { canonicalKey: "alt", name: "ALT", faName: "ALT", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/L", allowedUnits: ["U/L"], aliases: ["ALT", "SGPT", "Alanine aminotransferase"] },
  { canonicalKey: "ast", name: "AST", faName: "AST", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/L", allowedUnits: ["U/L"], aliases: ["AST", "SGOT", "Aspartate aminotransferase"] },
  { canonicalKey: "alp", name: "ALP", faName: "آلکالن فسفاتاز", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/L", allowedUnits: ["U/L"], aliases: ["ALP", "آلکالن فسفاتاز", "Alkaline phosphatase", "Alk phos"] },
  { canonicalKey: "ggt", name: "GGT", faName: "گاما گلوتامیل ترانسفراز", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/L", allowedUnits: ["U/L"], aliases: ["GGT", "گاما گلوتامیل ترانسفراز", "Gamma GT", "Gamma-glutamyl transferase", "گاما جی تی"] },
  { canonicalKey: "bilirubin_total", name: "Total bilirubin", faName: "بیلی‌روبین تام", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "umol/L"], aliases: ["Total bilirubin", "بیلی‌روبین تام", "T bilirubin", "TBIL", "Bilirubin total", "بیلی روبین تام"] },
  { canonicalKey: "bilirubin_direct", name: "Direct bilirubin", faName: "بیلی‌روبین مستقیم", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "umol/L"], aliases: ["Direct bilirubin", "بیلی‌روبین مستقیم", "DBIL", "Conjugated bilirubin", "بیلی روبین مستقیم"] },
  { canonicalKey: "bilirubin_indirect", name: "Indirect bilirubin", faName: "بیلی‌روبین غیرمستقیم", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "umol/L"], aliases: ["Indirect bilirubin", "بیلی‌روبین غیرمستقیم", "Unconjugated bilirubin", "بیلی روبین غیر مستقیم"] },
  { canonicalKey: "albumin", name: "Albumin", faName: "آلبومین", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "g/dL", allowedUnits: ["g/dL", "g/L"], aliases: ["Albumin", "آلبومین", "Serum albumin"] },
  { canonicalKey: "total_protein", name: "Total protein", faName: "پروتئین تام", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "g/dL", allowedUnits: ["g/dL", "g/L"], aliases: ["Total protein", "پروتئین تام", "Protein total", "Total serum protein"] },
  { canonicalKey: "ldh", name: "LDH", faName: "لاکتات دهیدروژناز", category: "liver", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/L", allowedUnits: ["U/L"], aliases: ["LDH", "لاکتات دهیدروژناز", "Lactate dehydrogenase"] },
  { canonicalKey: "total_cholesterol", name: "Total cholesterol", faName: "کلسترول تام", category: "lipid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Total cholesterol", "کلسترول تام", "Cholesterol", "TC", "Total chol", "کلسترول"] },
  { canonicalKey: "ldl", name: "LDL-C", faName: "LDL", category: "lipid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["LDL-C", "LDL", "LDL cholesterol", "Low density lipoprotein", "ال دی ال"] },
  { canonicalKey: "hdl", name: "HDL-C", faName: "HDL", category: "lipid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["HDL-C", "HDL", "HDL cholesterol", "High density lipoprotein", "اچ دی ال"] },
  { canonicalKey: "tg", name: "Triglyceride", faName: "تری‌گلیسرید", category: "lipid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Triglyceride", "تری‌گلیسرید", "TG", "Triglycerides", "تری گلیسرید"] },
  { canonicalKey: "non_hdl_c", name: "Non-HDL cholesterol", faName: "کلسترول Non-HDL", category: "lipid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Non-HDL cholesterol", "کلسترول Non-HDL", "Non HDL", "Non-HDL-C"] },
  { canonicalKey: "apob", name: "Apolipoprotein B", faName: "آپوپروتئین B", category: "lipid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "g/L"], aliases: ["Apolipoprotein B", "آپوپروتئین B", "ApoB", "Apo B"] },
  { canonicalKey: "apoa1", name: "Apolipoprotein A-I", faName: "آپوپروتئین A1", category: "lipid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "g/L"], aliases: ["Apolipoprotein A-I", "آپوپروتئین A1", "ApoA1", "Apo A1", "Apolipoprotein A1"] },
  { canonicalKey: "lpa", name: "Lipoprotein(a)", faName: "لیپوپروتئین a", category: "lipid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "nmol/L"], aliases: ["Lipoprotein(a)", "لیپوپروتئین a", "Lp(a)", "Lipoprotein a"] },
  { canonicalKey: "wbc", name: "WBC", faName: "گلبول سفید", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "10*3/uL", allowedUnits: ["10*3/uL", "/uL"], aliases: ["WBC", "گلبول سفید", "White blood cell", "White blood cells", "Leukocyte count"] },
  { canonicalKey: "rbc", name: "RBC", faName: "گلبول قرمز", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "10*6/uL", allowedUnits: ["10*6/uL", "/uL"], aliases: ["RBC", "گلبول قرمز", "Red blood cell", "Erythrocyte count"] },
  { canonicalKey: "hemoglobin", name: "Hemoglobin", faName: "هموگلوبین", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "g/dL", allowedUnits: ["g/dL", "g/L"], aliases: ["Hemoglobin", "هموگلوبین", "Hb", "Hgb"] },
  { canonicalKey: "hematocrit", name: "Hematocrit", faName: "هماتوکریت", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%", "L/L"], aliases: ["Hematocrit", "هماتوکریت", "Hct", "PCV"] },
  { canonicalKey: "mcv", name: "MCV", faName: "MCV", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "fL", allowedUnits: ["fL"], aliases: ["MCV", "Mean corpuscular volume"] },
  { canonicalKey: "mch", name: "MCH", faName: "MCH", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "pg", allowedUnits: ["pg"], aliases: ["MCH", "Mean corpuscular hemoglobin"] },
  { canonicalKey: "mchc", name: "MCHC", faName: "MCHC", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "g/dL", allowedUnits: ["g/dL", "g/L"], aliases: ["MCHC", "Mean corpuscular hemoglobin concentration"] },
  { canonicalKey: "rdw", name: "RDW", faName: "RDW", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["RDW", "RDW-CV", "Red cell distribution width"] },
  { canonicalKey: "platelet", name: "Platelet count", faName: "پلاکت", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "10*3/uL", allowedUnits: ["10*3/uL", "/uL"], aliases: ["Platelet count", "پلاکت", "PLT", "Platelets", "Platelet"] },
  { canonicalKey: "mpv", name: "MPV", faName: "MPV", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "fL", allowedUnits: ["fL"], aliases: ["MPV", "Mean platelet volume"] },
  { canonicalKey: "neutrophil_pct", name: "Neutrophils %", faName: "نوتروفیل درصد", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["Neutrophils %", "نوتروفیل درصد", "Neutrophil %", "Neut %", "NEUT%", "نوتروفیل"] },
  { canonicalKey: "neutrophil_abs", name: "Absolute neutrophil count", faName: "شمارش مطلق نوتروفیل", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "10*3/uL", allowedUnits: ["10*3/uL", "/uL"], aliases: ["Absolute neutrophil count", "شمارش مطلق نوتروفیل", "ANC", "Neutrophil absolute", "NEUT#"] },
  { canonicalKey: "lymphocyte_pct", name: "Lymphocytes %", faName: "لنفوسیت درصد", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["Lymphocytes %", "لنفوسیت درصد", "Lymphocyte %", "Lymph %", "LYM%", "لنفوسیت"] },
  { canonicalKey: "lymphocyte_abs", name: "Absolute lymphocyte count", faName: "شمارش مطلق لنفوسیت", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "10*3/uL", allowedUnits: ["10*3/uL", "/uL"], aliases: ["Absolute lymphocyte count", "شمارش مطلق لنفوسیت", "ALC", "Lymphocyte absolute", "LYM#"] },
  { canonicalKey: "monocyte_pct", name: "Monocytes %", faName: "مونوسیت درصد", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["Monocytes %", "مونوسیت درصد", "Monocyte %", "Mono %", "MONO%"] },
  { canonicalKey: "monocyte_abs", name: "Absolute monocyte count", faName: "شمارش مطلق مونوسیت", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "10*3/uL", allowedUnits: ["10*3/uL", "/uL"], aliases: ["Absolute monocyte count", "شمارش مطلق مونوسیت", "Monocyte absolute", "MONO#"] },
  { canonicalKey: "eosinophil_pct", name: "Eosinophils %", faName: "ائوزینوفیل درصد", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["Eosinophils %", "ائوزینوفیل درصد", "Eosinophil %", "Eos %", "EOS%", "ائوزینوفیل"] },
  { canonicalKey: "eosinophil_abs", name: "Absolute eosinophil count", faName: "شمارش مطلق ائوزینوفیل", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "10*3/uL", allowedUnits: ["10*3/uL", "/uL"], aliases: ["Absolute eosinophil count", "شمارش مطلق ائوزینوفیل", "Eosinophil absolute", "EOS#"] },
  { canonicalKey: "basophil_pct", name: "Basophils %", faName: "بازوفیل درصد", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["Basophils %", "بازوفیل درصد", "Basophil %", "Baso %", "BASO%"] },
  { canonicalKey: "basophil_abs", name: "Absolute basophil count", faName: "شمارش مطلق بازوفیل", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "10*3/uL", allowedUnits: ["10*3/uL", "/uL"], aliases: ["Absolute basophil count", "شمارش مطلق بازوفیل", "Basophil absolute", "BASO#"] },
  { canonicalKey: "reticulocyte_pct", name: "Reticulocyte %", faName: "رتیکولوسیت درصد", category: "hematology", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["Reticulocyte %", "رتیکولوسیت درصد", "Retic %", "Reticulocyte count %", "رتیکولوسیت"] },
  { canonicalKey: "ferritin", name: "Ferritin", faName: "فریتین", category: "iron", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL", "ug/L"], aliases: ["Ferritin", "فریتین"] },
  { canonicalKey: "iron", name: "Iron", faName: "آهن", category: "iron", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ug/dL", allowedUnits: ["ug/dL", "umol/L"], aliases: ["Iron", "آهن", "Serum iron", "Fe"] },
  { canonicalKey: "tibc", name: "TIBC", faName: "ظرفیت کل اتصال آهن", category: "iron", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ug/dL", allowedUnits: ["ug/dL", "umol/L"], aliases: ["TIBC", "ظرفیت کل اتصال آهن", "Total iron binding capacity"] },
  { canonicalKey: "transferrin", name: "Transferrin", faName: "ترانسفرین", category: "iron", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "g/L"], aliases: ["Transferrin", "ترانسفرین"] },
  { canonicalKey: "transferrin_saturation", name: "Transferrin saturation", faName: "اشباع ترانسفرین", category: "iron", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "%", allowedUnits: ["%"], aliases: ["Transferrin saturation", "اشباع ترانسفرین", "TSAT", "Iron saturation", "Transferrin sat"] },
  { canonicalKey: "vitamin_b12", name: "Vitamin B12", faName: "ویتامین B12", category: "vitamins", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "pg/mL", allowedUnits: ["pg/mL", "pmol/L"], aliases: ["Vitamin B12", "ویتامین B12", "B12", "Cobalamin", "Vitamin B-12"] },
  { canonicalKey: "folate", name: "Folate", faName: "فولات", category: "vitamins", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL", "nmol/L"], aliases: ["Folate", "فولات", "Folic acid", "Vitamin B9", "اسید فولیک"] },
  { canonicalKey: "vitamin_d_25oh", name: "25-OH Vitamin D", faName: "ویتامین D 25-OH", category: "vitamins", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL", "nmol/L"], aliases: ["25-OH Vitamin D", "ویتامین D 25-OH", "25 hydroxy vitamin D", "25(OH)D", "Vitamin D", "ویتامین D"] },
  { canonicalKey: "zinc", name: "Zinc", faName: "روی", category: "vitamins", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ug/dL", allowedUnits: ["ug/dL", "umol/L"], aliases: ["Zinc", "روی", "Zn", "Zinc serum"] },
  { canonicalKey: "tsh", name: "TSH", faName: "TSH", category: "thyroid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mIU/L", allowedUnits: ["mIU/L", "uIU/mL"], aliases: ["TSH", "Thyroid stimulating hormone"] },
  { canonicalKey: "free_t4", name: "Free T4", faName: "T4 آزاد", category: "thyroid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/dL", allowedUnits: ["ng/dL", "pmol/L"], aliases: ["Free T4", "T4 آزاد", "FT4", "Free thyroxine", "T4 free", "تیروکسین آزاد"] },
  { canonicalKey: "total_t4", name: "Total T4", faName: "T4 تام", category: "thyroid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ug/dL", allowedUnits: ["ug/dL", "nmol/L"], aliases: ["Total T4", "T4 تام", "T4", "Total thyroxine", "T4 total"] },
  { canonicalKey: "free_t3", name: "Free T3", faName: "T3 آزاد", category: "thyroid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "pg/mL", allowedUnits: ["pg/mL", "pmol/L"], aliases: ["Free T3", "T3 آزاد", "FT3", "Free triiodothyronine", "T3 free"] },
  { canonicalKey: "total_t3", name: "Total T3", faName: "T3 تام", category: "thyroid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/dL", allowedUnits: ["ng/dL", "nmol/L"], aliases: ["Total T3", "T3 تام", "T3", "Total triiodothyronine", "T3 total"] },
  { canonicalKey: "anti_tpo", name: "Anti-TPO", faName: "آنتی TPO", category: "thyroid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "IU/mL", allowedUnits: ["IU/mL"], aliases: ["Anti-TPO", "آنتی TPO", "TPO Ab", "Thyroid peroxidase antibody", "Anti thyroid peroxidase"] },
  { canonicalKey: "anti_tg", name: "Anti-thyroglobulin antibody", faName: "آنتی تیروگلوبولین", category: "thyroid", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "IU/mL", allowedUnits: ["IU/mL"], aliases: ["Anti-thyroglobulin antibody", "آنتی تیروگلوبولین", "Anti-Tg", "Tg Ab", "Thyroglobulin antibody"] },
  { canonicalKey: "crp", name: "CRP", faName: "CRP", category: "inflammation", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/L", allowedUnits: ["mg/L", "mg/dL"], aliases: ["CRP", "C-reactive protein"] },
  { canonicalKey: "hs_crp", name: "hs-CRP", faName: "hs-CRP", category: "inflammation", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mg/L", allowedUnits: ["mg/L"], aliases: ["hs-CRP", "High sensitivity CRP", "hsCRP", "Cardiac CRP"] },
  { canonicalKey: "esr", name: "ESR", faName: "ESR", category: "inflammation", specimens: ["whole_blood"], valueKind: "quantitative", defaultUnit: "mm/h", allowedUnits: ["mm/h"], aliases: ["ESR", "Erythrocyte sedimentation rate", "Sed rate"] },
  { canonicalKey: "procalcitonin", name: "Procalcitonin", faName: "پروکلسی‌تونین", category: "inflammation", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL"], aliases: ["Procalcitonin", "پروکلسی‌تونین", "PCT"] },
  { canonicalKey: "pt", name: "PT", faName: "PT", category: "coagulation", specimens: ["plasma"], valueKind: "quantitative", defaultUnit: "s", allowedUnits: ["s"], aliases: ["PT", "Prothrombin time"] },
  { canonicalKey: "inr", name: "INR", faName: "INR", category: "coagulation", specimens: ["plasma"], valueKind: "quantitative", allowedUnits: [], aliases: ["INR", "International normalized ratio"] },
  { canonicalKey: "aptt", name: "aPTT", faName: "aPTT", category: "coagulation", specimens: ["plasma"], valueKind: "quantitative", defaultUnit: "s", allowedUnits: ["s"], aliases: ["aPTT", "PTT", "APTT", "Activated partial thromboplastin time"] },
  { canonicalKey: "fibrinogen", name: "Fibrinogen", faName: "فیبرینوژن", category: "coagulation", specimens: ["plasma"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "g/L"], aliases: ["Fibrinogen", "فیبرینوژن"] },
  { canonicalKey: "d_dimer", name: "D-dimer", faName: "دی دایمر", category: "coagulation", specimens: ["plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL", "ug/mL", "mg/L FEU"], aliases: ["D-dimer", "دی دایمر", "D dimer", "D-Dimer"] },
  { canonicalKey: "troponin_i", name: "Troponin I", faName: "تروپونین I", category: "cardiac", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/L", allowedUnits: ["ng/L", "ng/mL", "pg/mL"], aliases: ["Troponin I", "تروپونین I", "TnI", "cTnI"] },
  { canonicalKey: "troponin_t", name: "Troponin T", faName: "تروپونین T", category: "cardiac", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/L", allowedUnits: ["ng/L", "ng/mL", "pg/mL"], aliases: ["Troponin T", "تروپونین T", "TnT", "cTnT"] },
  { canonicalKey: "hs_troponin_i", name: "High-sensitivity Troponin I", faName: "تروپونین I حساس", category: "cardiac", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/L", allowedUnits: ["ng/L"], aliases: ["High-sensitivity Troponin I", "تروپونین I حساس", "hs-cTnI", "hs Troponin I"] },
  { canonicalKey: "hs_troponin_t", name: "High-sensitivity Troponin T", faName: "تروپونین T حساس", category: "cardiac", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/L", allowedUnits: ["ng/L"], aliases: ["High-sensitivity Troponin T", "تروپونین T حساس", "hs-cTnT", "hs Troponin T"] },
  { canonicalKey: "bnp", name: "BNP", faName: "BNP", category: "cardiac", specimens: ["plasma"], valueKind: "quantitative", defaultUnit: "pg/mL", allowedUnits: ["pg/mL"], aliases: ["BNP", "B-type natriuretic peptide"] },
  { canonicalKey: "nt_probnp", name: "NT-proBNP", faName: "NT-proBNP", category: "cardiac", specimens: ["plasma"], valueKind: "quantitative", defaultUnit: "pg/mL", allowedUnits: ["pg/mL"], aliases: ["NT-proBNP", "NT pro BNP", "N-terminal proBNP"] },
  { canonicalKey: "ck", name: "Creatine kinase", faName: "کراتین کیناز", category: "cardiac", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/L", allowedUnits: ["U/L"], aliases: ["Creatine kinase", "کراتین کیناز", "CK", "CPK", "Creatine phosphokinase"] },
  { canonicalKey: "ck_mb", name: "CK-MB", faName: "CK-MB", category: "cardiac", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL", "U/L"], aliases: ["CK-MB", "CKMB", "CK MB"] },
  { canonicalKey: "amylase", name: "Amylase", faName: "آمیلاز", category: "pancreas", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/L", allowedUnits: ["U/L"], aliases: ["Amylase", "آمیلاز"] },
  { canonicalKey: "lipase", name: "Lipase", faName: "لیپاز", category: "pancreas", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/L", allowedUnits: ["U/L"], aliases: ["Lipase", "لیپاز"] },
  { canonicalKey: "cortisol", name: "Cortisol", faName: "کورتیزول", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ug/dL", allowedUnits: ["ug/dL", "nmol/L"], aliases: ["Cortisol", "کورتیزول"] },
  { canonicalKey: "acth", name: "ACTH", faName: "ACTH", category: "endocrine", specimens: ["plasma"], valueKind: "quantitative", defaultUnit: "pg/mL", allowedUnits: ["pg/mL"], aliases: ["ACTH", "Adrenocorticotropic hormone"] },
  { canonicalKey: "prolactin", name: "Prolactin", faName: "پرولاکتین", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL", "mIU/L"], aliases: ["Prolactin", "پرولاکتین", "PRL"] },
  { canonicalKey: "pth", name: "PTH", faName: "PTH", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "pg/mL", allowedUnits: ["pg/mL", "pmol/L"], aliases: ["PTH", "Parathyroid hormone", "Intact PTH", "iPTH"] },
  { canonicalKey: "testosterone_total", name: "Total testosterone", faName: "تستوسترون تام", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/dL", allowedUnits: ["ng/dL", "nmol/L"], aliases: ["Total testosterone", "تستوسترون تام", "Testosterone", "Total T", "تستوسترون"] },
  { canonicalKey: "testosterone_free", name: "Free testosterone", faName: "تستوسترون آزاد", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "pg/mL", allowedUnits: ["pg/mL", "pmol/L"], aliases: ["Free testosterone", "تستوسترون آزاد", "Free T"] },
  { canonicalKey: "estradiol", name: "Estradiol", faName: "استرادیول", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "pg/mL", allowedUnits: ["pg/mL", "pmol/L"], aliases: ["Estradiol", "استرادیول", "E2"] },
  { canonicalKey: "fsh", name: "FSH", faName: "FSH", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "IU/L", allowedUnits: ["IU/L"], aliases: ["FSH", "Follicle stimulating hormone"] },
  { canonicalKey: "lh", name: "LH", faName: "LH", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "IU/L", allowedUnits: ["IU/L"], aliases: ["LH", "Luteinizing hormone"] },
  { canonicalKey: "shbg", name: "SHBG", faName: "SHBG", category: "endocrine", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "nmol/L", allowedUnits: ["nmol/L"], aliases: ["SHBG", "Sex hormone binding globulin"] },
  { canonicalKey: "ph_blood", name: "Blood pH", faName: "pH خون", category: "blood_gas", specimens: ["blood"], valueKind: "quantitative", allowedUnits: [], aliases: ["Blood pH", "pH خون", "ABG pH"] },
  { canonicalKey: "pco2", name: "pCO2", faName: "pCO2", category: "blood_gas", specimens: ["blood"], valueKind: "quantitative", defaultUnit: "mmHg", allowedUnits: ["mmHg", "kPa"], aliases: ["pCO2", "PaCO2", "PCO2"] },
  { canonicalKey: "po2", name: "pO2", faName: "pO2", category: "blood_gas", specimens: ["blood"], valueKind: "quantitative", defaultUnit: "mmHg", allowedUnits: ["mmHg", "kPa"], aliases: ["pO2", "PaO2", "PO2"] },
  { canonicalKey: "hco3_blood_gas", name: "Bicarbonate (blood gas)", faName: "بیکربنات گاز خون", category: "blood_gas", specimens: ["blood"], valueKind: "quantitative", defaultUnit: "mmol/L", allowedUnits: ["mmol/L", "mEq/L"], aliases: ["Bicarbonate (blood gas)", "بیکربنات گاز خون", "HCO3 ABG", "Bicarbonate ABG"] },
  { canonicalKey: "lactate", name: "Lactate", faName: "لاکتات", category: "blood_gas", specimens: ["blood"], valueKind: "quantitative", defaultUnit: "mmol/L", allowedUnits: ["mmol/L", "mg/dL"], aliases: ["Lactate", "لاکتات", "Lactic acid"] },
  { canonicalKey: "urine_specific_gravity", name: "Urine specific gravity", faName: "وزن مخصوص ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "quantitative", allowedUnits: [], aliases: ["Urine specific gravity", "وزن مخصوص ادرار", "Specific gravity", "SG urine", "Urine SG"] },
  { canonicalKey: "urine_ph", name: "Urine pH", faName: "pH ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "quantitative", allowedUnits: [], aliases: ["Urine pH", "pH ادرار", "pH urine"] },
  { canonicalKey: "urine_glucose", name: "Urine glucose", faName: "گلوکز ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "quantitative", defaultUnit: "mg/dL", allowedUnits: ["mg/dL", "mmol/L"], aliases: ["Urine glucose", "گلوکز ادرار", "Glucose urine", "Urine sugar", "قند ادرار"] },
  { canonicalKey: "urine_ketone", name: "Urine ketones", faName: "کتون ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "qualitative", allowedUnits: [], aliases: ["Urine ketones", "کتون ادرار", "Ketone urine", "Ketones urine", "Urine ketone"] },
  { canonicalKey: "urine_blood", name: "Urine blood", faName: "خون ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "qualitative", allowedUnits: [], aliases: ["Urine blood", "خون ادرار", "Blood urine", "Occult blood urine"] },
  { canonicalKey: "urine_nitrite", name: "Urine nitrite", faName: "نیتریت ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "qualitative", allowedUnits: [], aliases: ["Urine nitrite", "نیتریت ادرار", "Nitrite urine"] },
  { canonicalKey: "urine_leukocyte_esterase", name: "Urine leukocyte esterase", faName: "لکوسیت استراز ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "qualitative", allowedUnits: [], aliases: ["Urine leukocyte esterase", "لکوسیت استراز ادرار", "Leukocyte esterase", "LE urine"] },
  { canonicalKey: "urine_rbc", name: "Urine RBC", faName: "RBC ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "quantitative", defaultUnit: "/HPF", allowedUnits: ["/HPF", "/uL"], aliases: ["Urine RBC", "RBC ادرار", "RBC urine", "Urine red blood cells"] },
  { canonicalKey: "urine_wbc", name: "Urine WBC", faName: "WBC ادرار", category: "urinalysis", specimens: ["urine"], valueKind: "quantitative", defaultUnit: "/HPF", allowedUnits: ["/HPF", "/uL"], aliases: ["Urine WBC", "WBC ادرار", "WBC urine", "Urine white blood cells"] },
  { canonicalKey: "hbsag", name: "HBsAg", faName: "HBsAg", category: "serology", specimens: ["serum_plasma"], valueKind: "qualitative", allowedUnits: [], aliases: ["HBsAg", "Hepatitis B surface antigen", "HBs Ag"] },
  { canonicalKey: "anti_hbs", name: "Anti-HBs", faName: "Anti-HBs", category: "serology", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mIU/mL", allowedUnits: ["mIU/mL"], aliases: ["Anti-HBs", "HBsAb", "Hepatitis B surface antibody"] },
  { canonicalKey: "anti_hcv", name: "Anti-HCV", faName: "Anti-HCV", category: "serology", specimens: ["serum_plasma"], valueKind: "qualitative", allowedUnits: [], aliases: ["Anti-HCV", "HCV Ab", "Hepatitis C antibody"] },
  { canonicalKey: "hiv_ag_ab", name: "HIV Ag/Ab", faName: "HIV Ag/Ab", category: "serology", specimens: ["serum_plasma"], valueKind: "qualitative", allowedUnits: [], aliases: ["HIV Ag/Ab", "HIV combo", "HIV 1/2 Ag Ab", "HIV antibody antigen"] },
  { canonicalKey: "ana", name: "ANA", faName: "ANA", category: "autoimmune", specimens: ["serum_plasma"], valueKind: "qualitative", allowedUnits: [], aliases: ["ANA", "Antinuclear antibody"] },
  { canonicalKey: "rf", name: "Rheumatoid factor", faName: "فاکتور روماتوئید", category: "autoimmune", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "IU/mL", allowedUnits: ["IU/mL"], aliases: ["Rheumatoid factor", "فاکتور روماتوئید", "RF"] },
  { canonicalKey: "anti_ccp", name: "Anti-CCP", faName: "Anti-CCP", category: "autoimmune", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "U/mL", allowedUnits: ["U/mL"], aliases: ["Anti-CCP", "CCP Ab", "Cyclic citrullinated peptide antibody"] },
  { canonicalKey: "psa_total", name: "Total PSA", faName: "PSA تام", category: "other", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "ng/mL", allowedUnits: ["ng/mL"], aliases: ["Total PSA", "PSA تام", "PSA", "Prostate specific antigen"] },
  { canonicalKey: "beta_hcg", name: "Beta-hCG", faName: "بتا HCG", category: "other", specimens: ["serum_plasma"], valueKind: "quantitative", defaultUnit: "mIU/mL", allowedUnits: ["mIU/mL", "IU/L"], aliases: ["Beta-hCG", "بتا HCG", "β-hCG", "BHCG", "Beta HCG"] },
] as const;

const UNIT_ALIASES: Record<string, string> = {
  "mg/dl": "mg/dL",
  "mgdl": "mg/dL",
  "g/dl": "g/dL",
  "gdl": "g/dL",
  "g/l": "g/L",
  "mmol/l": "mmol/L",
  "mmoll": "mmol/L",
  "umol/l": "umol/L",
  "µmol/l": "umol/L",
  "μmol/l": "umol/L",
  "meq/l": "mEq/L",
  "meql": "mEq/L",
  "u/l": "U/L",
  "ul": "U/L",
  "iu/l": "IU/L",
  "[iu]/l": "IU/L",
  "miu/l": "mIU/L",
  "uiu/ml": "uIU/mL",
  "µiu/ml": "uIU/mL",
  "μiu/ml": "uIU/mL",
  "iu/ml": "IU/mL",
  "ng/ml": "ng/mL",
  "pg/ml": "pg/mL",
  "ug/dl": "ug/dL",
  "µg/dl": "ug/dL",
  "μg/dl": "ug/dL",
  "ug/l": "ug/L",
  "µg/l": "ug/L",
  "μg/l": "ug/L",
  "nmol/l": "nmol/L",
  "pmol/l": "pmol/L",
  "mg/l": "mg/L",
  "mg/g": "mg/g",
  "mg/mmol": "mg/mmol",
  "ng/l": "ng/L",
  "fl": "fL",
  "pg": "pg",
  "%": "%",
  "mm/h": "mm/h",
  "mmhg": "mmHg",
  "mosm/kg": "mOsm/kg",
  "10*3/ul": "10*3/uL",
  "10^3/ul": "10*3/uL",
  "10³/ul": "10*3/uL",
  "10*6/ul": "10*6/uL",
  "10^6/ul": "10*6/uL",
  "10⁶/ul": "10*6/uL",
  "/ul": "/uL",
  "/hpf": "/HPF",
  "s": "s",
  "sec": "s",
};

function normalizePersianCharacters(value: string) {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه");
}

export function normalizeLabRegistryToken(value: string) {
  return normalizePersianCharacters(value)
    .trim()
    .toLowerCase()
    .replace(/[ـ]/g, "")
    .replace(/[\s._/\\()+-]+/g, "");
}

const aliasIndex = new Map<string, LabMasterEntry>();

for (const entry of LAB_MASTER_REGISTRY) {
  for (const alias of [entry.name, entry.faName, ...entry.aliases]) {
    const normalized = normalizeLabRegistryToken(alias);
    if (!normalized || aliasIndex.has(normalized)) continue;
    aliasIndex.set(normalized, entry);
  }
}

export function resolveLabMasterEntry(value: string) {
  return aliasIndex.get(normalizeLabRegistryToken(value));
}

export function searchLabMasterRegistry(query: string, limit = 30) {
  const normalized = normalizeLabRegistryToken(query);
  if (!normalized) return LAB_MASTER_REGISTRY.slice(0, limit);

  return LAB_MASTER_REGISTRY.filter((entry) =>
    [entry.name, entry.faName, ...entry.aliases].some((alias) =>
      normalizeLabRegistryToken(alias).includes(normalized),
    ),
  ).slice(0, limit);
}

export function normalizeLabUnit(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return undefined;
  const key = raw
    .replace(/\s+/g, "")
    .replace(/μ/g, "µ")
    .toLowerCase();
  return UNIT_ALIASES[key] ?? raw;
}

export function ocrAliasesForLab(entry: LabMasterEntry) {
  const values = [entry.name, ...entry.aliases];
  return [...new Set(values)].filter((alias) => {
    const compact = alias.replace(/\s+/g, "");
    if (/[\u0600-\u06ff]/.test(alias)) return compact.length >= 3;
    if (/[+#%]/.test(alias)) return compact.length >= 2;
    return compact.replace(/[^A-Za-z0-9]/g, "").length >= 3;
  });
}
