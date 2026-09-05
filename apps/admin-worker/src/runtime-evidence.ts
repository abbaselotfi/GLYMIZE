export type EvidenceLocale = "fa" | "en";

export type RuntimeCitation = {
  sourceId: string;
  shortCode: string;
  title: string;
  activeVersion: string;
  sourceUrl: string;
  sourceKind: "guideline" | "consensus" | "regulatory";
};

export type RuntimeEvidence = {
  ruleId: string;
  domain: string;
  score: number;
  textFa: string;
  textEn: string;
  engineEffect: string;
  citations: RuntimeCitation[];
};

type Source = RuntimeCitation & {
  engineDomains: string[];
  engineRoleFa: string;
  engineRoleEn: string;
};

type Rule = {
  id: string;
  domain: string;
  descriptionFa: string;
  descriptionEn: string;
  sourceIds: string[];
  engineEffect: string;
};

export const RUNTIME_RULE_PACK_VERSION = "2026.08.1";

const SOURCES: Source[] = [
  { sourceId:"ada-2026", shortCode:"ADA 2026", title:"Standards of Care in Diabetes — Pharmacologic Approaches to Glycemic Treatment", sourceKind:"guideline", sourceUrl:"https://diabetesjournals.org/docm-care/article/doi/10.2337/doc26-a009/164622/Section-9-Pharmacologic-Approaches-to-Glycemic", activeVersion:"Standards of Care in Diabetes—2026 / Section 9", engineDomains:["glycemic_control","ascvd","heart_failure","ckd","weight","hypoglycemia","insulin"], engineRoleFa:"هسته مسیر درمان دیابت نوع ۲، تشدید درمان، اولویت GLP-1/SGLT2 و مسیر انسولین", engineRoleEn:"Core type 2 pathway, intensification, GLP-1/SGLT2 priorities, and insulin pathway" },
  { sourceId:"easd-2022", shortCode:"EASD", title:"Management of Hyperglycemia in Type 2 Diabetes — ADA/EASD Consensus Report", sourceKind:"consensus", sourceUrl:"https://diabetesjournals.org/care/article/45/11/2753/147671/Management-of-Hyperglycemia-in-Type-2-Diabetes", activeVersion:"ADA/EASD consensus report 2022", engineDomains:["glycemic_control","cardiorenal","weight","hypoglycemia","person_centered_care"], engineRoleFa:"فردمحوری، وزن، ریسک هیپوگلیسمی و انتخاب درمان با توجه به بیماری‌های قلبی‌ـ‌کلیوی", engineRoleEn:"Person-centred care, weight, hypoglycemia risk, and cardiorenal treatment selection" },
  { sourceId:"kdigo-ckd-2024", shortCode:"KDIGO-CKD 2024", title:"Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease", sourceKind:"guideline", sourceUrl:"https://kdigo.org/guidelines/ckd-evaluation-and-management/kdigo-2024-ckd-guideline/", activeVersion:"KDIGO 2024 CKD Guideline", engineDomains:["ckd","egfr","uacr","medication_stewardship","cardiorenal"], engineRoleFa:"زمینه CKD، عملکرد کلیه، آلبومینوری و ایمنی/انتخاب دارو در بیماری کلیوی", engineRoleEn:"CKD context, kidney function, albuminuria, and medication stewardship" },
  { sourceId:"kdigo-dmckd-2022", shortCode:"KDIGO-DMCKD 2022", title:"Clinical Practice Guideline for Diabetes Management in Chronic Kidney Disease", sourceKind:"guideline", sourceUrl:"https://kdigo.org/guidelines/diabetes-ckd/kdigo-2022-clinical-practice-guideline-for-diabetes-management-in-ckd/", activeVersion:"KDIGO Diabetes in CKD 2022", engineDomains:["diabetes","ckd","sglt2","glp1","metformin","cardiorenal"], engineRoleFa:"اولویت‌های درمان دیابت همراه CKD و قواعد ایمنی مرتبط با عملکرد کلیه", engineRoleEn:"Diabetes-with-CKD treatment priorities and kidney-function safety rules" },
  { sourceId:"easl-masld-2024", shortCode:"EASL-MASLD 2024", title:"Clinical Practice Guidelines on the Management of MASLD", sourceKind:"guideline", sourceUrl:"https://easl.eu/publication/easl-easd-easo-clinical-practice-guidelines-managment-of-metabolic-dysfunction-associated-steatotic-liver-disease/", activeVersion:"EASL–EASD–EASO MASLD 2024", engineDomains:["masld_mash","fibrosis","cirrhosis","weight","metabolic_risk"], engineRoleFa:"فعال‌سازی مسیر MASLD/MASH، مرحله فیبروز و احتیاط‌های سیروز در تصمیم‌گیری", engineRoleEn:"MASLD/MASH pathway, fibrosis staging, and cirrhosis-aware decision support" },
  { sourceId:"esc-dm-cvd-2023", shortCode:"ESC-DM-CVD 2023", title:"Guidelines for the Management of Cardiovascular Disease in Patients with Diabetes", sourceKind:"guideline", sourceUrl:"https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/cvd-and-diabetes/", activeVersion:"ESC CVD and Diabetes 2023", engineDomains:["ascvd","heart_failure","ckd","cardiorenal"], engineRoleFa:"رتبه‌بندی داروها در ASCVD و نارسایی قلبی و هم‌پوشانی قلبی‌ـ‌کلیوی", engineRoleEn:"Medication ranking for ASCVD, heart failure, and cardiorenal overlap" },
  { sourceId:"iwgdf-inf-2023", shortCode:"IWGDF-INF 2023", title:"Guideline on the Diagnosis and Treatment of Diabetes-related Foot Infections", sourceKind:"guideline", sourceUrl:"https://iwgdfguidelines.org/infection-guideline-2023/", activeVersion:"IWGDF/IDSA Infection Guideline 2023", engineDomains:["diabetic_foot","infection","escalation"], engineRoleFa:"هشدار و ارجاع مسیر پای دیابتی/عفونت", engineRoleEn:"Diabetic-foot/infection escalation" },
  { sourceId:"iwgdf-wound-2023", shortCode:"IWGDF-WOUND 2023", title:"Wound Healing Interventions Guideline", sourceKind:"guideline", sourceUrl:"https://iwgdfguidelines.org/wound-healing-2023/", activeVersion:"IWGDF Wound Healing 2023", engineDomains:["diabetic_foot","wound_healing","escalation"], engineRoleFa:"مسیر ارزیابی و مراقبت زخم پای دیابتی", engineRoleEn:"Diabetic-foot wound pathway" },
  { sourceId:"ema-resmetirom-2025", shortCode:"EMA-RESMETIROM 2025", title:"Rezdiffra (resmetirom) — European Public Assessment Report", sourceKind:"regulatory", sourceUrl:"https://www.ema.europa.eu/en/medicines/human/EPAR/rezdiffra", activeVersion:"EU conditional marketing authorisation 2025", engineDomains:["mash","fibrosis_f2_f3","resmetirom","regulatory_eligibility"], engineRoleFa:"واجدشرایط‌بودن Resmetirom برای MASH غیرسیروتیک با فیبروز F2–F3", engineRoleEn:"Resmetirom eligibility for non-cirrhotic MASH with F2–F3 fibrosis" },
  { sourceId:"ada-cvd-2026", shortCode:"ADA10-2026", title:"Standards of Care in Diabetes—2026, Section 10: Cardiovascular Disease and Risk Management", sourceKind:"guideline", sourceUrl:"https://diabetesjournals.org/care/article/49/Supplement_1/S216/163933/10-Cardiovascular-Disease-and-Risk-Management", activeVersion:"Standards of Care in Diabetes—2026 / Section 10", engineDomains:["hypertension","lipids","ascvd","heart_failure","ace_inhibitor","arb","statin","mra","cardiorenal"], engineRoleFa:"اهداف فشارخون و چربی، انتخاب ACEi/ARB در دیابت و کاهش ریسک قلبی‌عروقی؛ دوز دقیق همچنان از label رگولاتوری می‌آید", engineRoleEn:"Blood-pressure/lipid goals, ACEi/ARB selection in diabetes, and cardiovascular risk reduction; exact dose remains label-derived" },
  { sourceId:"ada-ckd-2026", shortCode:"ADA11-2026", title:"Standards of Care in Diabetes—2026, Section 11: Chronic Kidney Disease and Risk Management", sourceKind:"guideline", sourceUrl:"https://diabetesjournals.org/care/article/49/Supplement_1/S246/163914/11-Chronic-Kidney-Disease-and-Risk-Management", activeVersion:"Standards of Care in Diabetes—2026 / Section 11", engineDomains:["ckd","albuminuria","ras_blockade","finerenone","mra","sglt2","glp1","potassium_monitoring"], engineRoleFa:"RAS blockade، finerenone/nsMRA، SGLT2/GLP-1 و پایش پتاسیم در دیابت همراه CKD", engineRoleEn:"RAS blockade, finerenone/nsMRA, SGLT2/GLP-1, and potassium monitoring in diabetes with CKD" },
  { sourceId:"ada-microvascular-2026", shortCode:"ADA12-2026", title:"Standards of Care in Diabetes—2026, Section 12: Retinopathy, Neuropathy, and Foot Care", sourceKind:"guideline", sourceUrl:"https://diabetesjournals.org/care/article/49/Supplement_1/S261/163919/12-Retinopathy-Neuropathy-and-Foot-Care-Standards", activeVersion:"Standards of Care in Diabetes—2026 / Section 12", engineDomains:["retinopathy","macular_edema","neuropathy","neuropathic_pain","diabetic_foot"], engineRoleFa:"مرور درمان‌های رتینوپاتی/ادم ماکولا، نوروپاتی دردناک و مراقبت پای دیابتی", engineRoleEn:"Retinopathy/macular-edema therapy, painful neuropathy treatment, and diabetic-foot care" },
  { sourceId:"ada-pregnancy-2026", shortCode:"ADA15-2026", title:"Standards of Care in Diabetes—2026, Section 15: Management of Diabetes in Pregnancy", sourceKind:"guideline", sourceUrl:"https://diabetesjournals.org/care/article/49/Supplement_1/S321/163918/15-Management-of-Diabetes-in-Pregnancy-Standards", activeVersion:"Standards of Care in Diabetes—2026 / Section 15", engineDomains:["pregnancy","insulin","medication_safety","hypertension","ckd","retinopathy"], engineRoleFa:"ایمنی دارویی و مسیر ترجیحی انسولین در بارداری همراه دیابت و مرور داروهای نامناسب بارداری", engineRoleEn:"Medication safety and insulin-preferred pathways in pregnancy complicated by diabetes" },
  { sourceId:"acc-aha-htn-2025", shortCode:"ACC/AHA-HTN 2025", title:"2025 High Blood Pressure Guideline", sourceKind:"guideline", sourceUrl:"https://professional.heart.org/en/science-news/2025-high-blood-pressure-guideline", activeVersion:"2025 ACC/AHA High Blood Pressure Guideline", engineDomains:["hypertension","blood_pressure_target","ckd","diabetes","resistant_hypertension","combination_therapy"], engineRoleFa:"اهداف فشارخون، زمان شروع درمان و استراتژی تک‌دارویی/ترکیبی در بزرگسالان از جمله دیابت و CKD", engineRoleEn:"Blood-pressure targets, treatment thresholds, and single/combination therapy strategy including diabetes and CKD" },
  { sourceId:"acc-aha-dyslipidemia-2026", shortCode:"ACC/AHA-LIPID 2026", title:"2026 Guideline on the Management of Dyslipidemia", sourceKind:"guideline", sourceUrl:"https://professional.heart.org/en/science-news/2026-guideline-on-the-management-of-dyslipidemia", activeVersion:"2026 ACC/AHA Dyslipidemia Guideline", engineDomains:["lipids","ldl","statin","nonstatin","ascvd","hypertriglyceridemia","lpa","apob"], engineRoleFa:"شدت درمان کاهنده چربی و اهداف LDL/non-HDL بر اساس ریسک؛ جایگزین guideline کلسترول 2018", engineRoleEn:"Risk-based lipid-lowering intensity and LDL/non-HDL goals; replaces the 2018 cholesterol guideline" },
  { sourceId:"aha-acc-hfsa-hf-2022", shortCode:"AHA/ACC/HFSA-HF 2022", title:"2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure", sourceKind:"guideline", sourceUrl:"https://professional.heart.org/en/science-news/2022-guideline-for-the-management-of-heart-failure", activeVersion:"2022 AHA/ACC/HFSA Heart Failure Guideline", engineDomains:["heart_failure","hfref","hfmref","hfpef","mra","spironolactone","sglt2","raas"], engineRoleFa:"GDMT نارسایی قلبی و eligibility/safety کلاس MRA از جمله spironolactone؛ اجرای دوز product-specific جداست", engineRoleEn:"Heart-failure GDMT and MRA eligibility/safety including spironolactone; product-specific dosing remains separate" },
  { sourceId:"acc-hfref-2024", shortCode:"ACC-HFrEF 2024", title:"2024 ACC Expert Consensus Decision Pathway for Treatment of Heart Failure With Reduced Ejection Fraction", sourceKind:"consensus", sourceUrl:"https://www.acc.org/Guidelines/Guidelines/2024/03/08/15/40/Treatment-of-Heart-Failure-With-Reduced-Ejection-Fraction-ECDP", activeVersion:"ACC HFrEF Expert Consensus Decision Pathway 2024", engineDomains:["heart_failure","hfref","gdmt","arni","beta_blocker","sglt2","mra","titration"], engineRoleFa:"ترتیب عملی شروع/افزودن/تیتراسیون اجزای GDMT در HFrEF؛ مکمل guideline اصلی 2022", engineRoleEn:"Practical initiation/addition/titration of HFrEF GDMT, complementing the 2022 guideline" },
  { sourceId:"aasld-resmetirom-2024", shortCode:"AASLD-RESMETIROM 2024", title:"Resmetirom Therapy for Metabolic Dysfunction-Associated Steatotic Liver Disease — Update to AASLD Practice Guidance", sourceKind:"consensus", sourceUrl:"https://www.aasld.org/practice-guidelines/clinical-assessment-and-management-metabolic-dysfunction-associated-steatotic", activeVersion:"AASLD MASLD Practice Guidance — Resmetirom update, October 2024", engineDomains:["masld_mash","fibrosis","resmetirom","patient_selection","monitoring"], engineRoleFa:"معیارهای عملی انتخاب بیمار و پایش resmetirom در MASLD/MASH؛ در کنار EASL و منبع رگولاتوری", engineRoleEn:"Practical patient selection and monitoring for resmetirom in MASLD/MASH alongside EASL and regulatory evidence" },
  { sourceId:"aasld-semaglutide-mash-2025", shortCode:"AASLD-SEMA-MASH 2025", title:"Semaglutide Therapy for Metabolic Dysfunction-Associated Steatohepatitis — Update to AASLD Practice Guidance", sourceKind:"consensus", sourceUrl:"https://www.aasld.org/aasld-announces-update-metabolic-dysfunction-associated-steatotic-liver-disease-masld-practice", activeVersion:"AASLD MASLD Practice Guidance — Semaglutide update, November 2025", engineDomains:["masld_mash","fibrosis_f2_f3","semaglutide","obesity","type2_diabetes","monitoring"], engineRoleFa:"معیارهای انتخاب بیمار، مدیریت همبودها و پایش semaglutide در MASH با فیبروز متوسط تا پیشرفته", engineRoleEn:"Patient selection, comorbidity management, and semaglutide monitoring in MASH with moderate-to-advanced fibrosis" },
];

const RULES: Rule[] = [
  { id:"T2-GLYCEMIC-001", domain:"glycemic_control", descriptionFa:"هایپرگلیسمی شدید/علائم یا کاتابولیسم مسیر بررسی انسولین را فعال می‌کند.", descriptionEn:"Severe hyperglycemia, symptoms, or catabolism activates insulin review.", sourceIds:["ada-2026"], engineEffect:"pathway:consider_insulin" },
  { id:"T2-GLYCEMIC-002", domain:"glycemic_control", descriptionFa:"فاصله زیاد از هدف، درمان ترکیبی و در نبود بحران اولویت GLP-1-based therapy را مطرح می‌کند.", descriptionEn:"A large A1C gap supports combination therapy and GLP-1-based priority absent crisis.", sourceIds:["ada-2026","easd-2022"], engineEffect:"pathway:combination_or_glp1" },
  { id:"T2-CKD-001", domain:"ckd", descriptionFa:"CKD رتبه SGLT2/GLP-1 و محدودیت‌های کلیوی متفورمین را تغییر می‌دهد.", descriptionEn:"CKD changes SGLT2/GLP-1 priority and metformin kidney-safety handling.", sourceIds:["ada-2026","kdigo-ckd-2024","kdigo-dmckd-2022"], engineEffect:"ranking_and_safety:ckd" },
  { id:"T2-CV-001", domain:"ascvd_heart_failure", descriptionFa:"ASCVD/HF روی اولویت درمان‌های دارای شواهد پیامد قلبی و محدودیت TZD اثر می‌گذارد.", descriptionEn:"ASCVD/HF changes outcome-based therapy priority and TZD handling.", sourceIds:["ada-2026","esc-dm-cvd-2023"], engineEffect:"ranking_and_safety:cardiovascular" },
  { id:"T2-LIVER-001", domain:"masld_mash", descriptionFa:"MASLD/MASH مرحله فیبروز و سیروز را وارد تصمیم می‌کند.", descriptionEn:"MASLD/MASH introduces fibrosis stage and cirrhosis into decision support.", sourceIds:["ada-2026","easl-masld-2024"], engineEffect:"ranking_and_safety:liver" },
  { id:"T2-LIVER-002", domain:"resmetirom", descriptionFa:"Resmetirom فقط در محدوده مجوز رگولاتوری MASH غیرسیروتیک F2–F3 قابل بررسی است.", descriptionEn:"Resmetirom is considered only within the non-cirrhotic MASH F2–F3 regulatory indication.", sourceIds:["easl-masld-2024","ema-resmetirom-2025"], engineEffect:"eligibility:resmetirom" },
  { id:"T2-FOOT-001", domain:"diabetic_foot", descriptionFa:"وجود پای دیابتی مسیر موازی ارزیابی عفونت و زخم را فعال می‌کند و نباید با رتبه داروی قند جایگزین شود.", descriptionEn:"Diabetic foot activates a parallel infection/wound pathway rather than altering glucose-drug ranking artificially.", sourceIds:["iwgdf-inf-2023","iwgdf-wound-2023"], engineEffect:"parallel_pathway:diabetic_foot" },
];

export const RUNTIME_RULE_IDS = RULES.map((rule) => rule.id);
export const RUNTIME_SOURCE_IDS = SOURCES.map((source) => source.sourceId);

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","in","for","with","is","are","be","on","by","from",
  "treatment","therapy","patient","clinical","recommendation","program","about","what","which",
  "در","از","به","با","برای","و","یا","که","این","آن","است","هست","را","یک","درمان","بیمار","بالینی","توصیه","برنامه","درباره","چه","کدام",
]);

const ALIASES: Record<string,string[]> = {
  ckd:["kidney","renal","egfr","uacr","کلیه","کلیوی"],
  kidney:["ckd","renal","egfr","uacr","کلیه","کلیوی"],
  renal:["ckd","kidney","egfr","کلیه","کلیوی"],
  قلب:["ascvd","cardiovascular","heart","hf","cvd"],
  قلبی:["ascvd","cardiovascular","heart","hf","cvd"],
  hf:["heart","failure","نارسایی","قلبی"],
  ascvd:["cardiovascular","cvd","mi","stroke","قلبی","عروقی"],
  mash:["masld","liver","fibrosis","کبد","فیبروز"],
  masld:["mash","liver","fibrosis","کبد","فیبروز"],
  کبد:["liver","masld","mash","fibrosis"],
  زخم:["foot","wound","iwgdf","infection","پای","عفونت"],
  foot:["wound","infection","iwgdf","زخم","پای"],
  wound:["foot","infection","iwgdf","زخم","پای"],
  metformin:["متفورمین","egfr","ckd","kidney"],
  متفورمین:["metformin","egfr","ckd","کلیه"],
  sglt2:["ckd","heart","failure","cardiorenal","کلیه","قلب"],
  glp1:["glp","weight","ascvd","وزن","قلبی"],
  insulin:["انسولین","hyperglycemia","catabolism","هایپرگلیسمی"],
  انسولین:["insulin","hyperglycemia","catabolism","هایپرگلیسمی"],
  resmetirom:["mash","fibrosis","f2","f3","rezdiffra"],
};

function normalize(value:string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/ي/g,"ی").replace(/ك/g,"ک").replace(/[^\p{L}\p{N}.+-]+/gu," ").trim();
}

function tokenize(value:string) {
  const base = normalize(value).split(/\s+/).filter((token) => token.length > 1 && !STOPWORDS.has(token));
  const expanded = new Set(base);
  for (const token of base) for (const alias of ALIASES[token] ?? []) expanded.add(alias);
  return [...expanded];
}

export function detectEvidenceLocale(question:string, requested?:EvidenceLocale):EvidenceLocale {
  if (requested) return requested;
  return /[\u0600-\u06ff]/.test(question) ? "fa" : "en";
}

export function evidenceForQuestion(question:string):RuntimeEvidence[] {
  const queryTokens = tokenize(question);
  return RULES.map((rule) => {
    const sources = SOURCES.filter((source) => rule.sourceIds.includes(source.sourceId));
    const text = normalize([rule.domain,rule.descriptionFa,rule.descriptionEn,rule.engineEffect,...sources.flatMap((source)=>[source.shortCode,source.title,source.engineRoleFa,source.engineRoleEn,...source.engineDomains])].join(" "));
    const haystack = new Set(tokenize(text));
    let score=0;
    for (const token of queryTokens) {
      if (haystack.has(token)) score += 3;
      else if (token.length >= 4 && text.includes(token)) score += 1;
    }
    return {
      ruleId:rule.id,
      domain:rule.domain,
      score,
      textFa:rule.descriptionFa,
      textEn:rule.descriptionEn,
      engineEffect:rule.engineEffect,
      citations:sources.map(({engineDomains:_d,engineRoleFa:_f,engineRoleEn:_e,...citation})=>citation),
    };
  }).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score || a.ruleId.localeCompare(b.ruleId)).slice(0,6);
}

export function uniqueEvidenceCitations(evidence:RuntimeEvidence[]) {
  const seen=new Set<string>();
  return evidence.flatMap((item)=>item.citations).filter((citation)=>{
    if (seen.has(citation.sourceId)) return false;
    seen.add(citation.sourceId);
    return true;
  });
}

export function extractiveEvidenceAnswer(locale:EvidenceLocale,evidence:RuntimeEvidence[],sufficient:boolean) {
  if (!sufficient) {
    return locale === "fa"
      ? "در مجموعه شواهد تاییدشده و فعال GLYMIZE اطلاعات کافی برای پاسخ قابل اتکا پیدا نشد. پاسخ حدسی تولید نمی‌شود؛ سؤال را دقیق‌تر کنید یا منبع مربوط را برای بازبینی علمی اضافه کنید."
      : "The approved active GLYMIZE evidence set does not contain enough support for a reliable answer. No speculative answer is generated; refine the question or add the relevant source for clinical review.";
  }
  const lines=evidence.slice(0,3).map((item)=>locale==="fa"?item.textFa:item.textEn);
  return locale==="fa"
    ? `بر اساس Rule Pack تاییدشده فعلی:\n${lines.map((line)=>`• ${line}`).join("\n")}\n\nاین حالت فقط شواهد تاییدشده را بازیابی می‌کند.`
    : `Based on the currently approved Rule Pack:\n${lines.map((line)=>`• ${line}`).join("\n")}\n\nThis mode retrieves only approved evidence.`;
}

export function buildEvidenceMessages(question:string,locale:EvidenceLocale,evidence:RuntimeEvidence[]) {
  const evidenceText=evidence.map((item,index)=>{
    const refs=item.citations.map((citation)=>`${citation.shortCode} — ${citation.activeVersion}`).join("; ");
    return `[E${index+1}] ${item.textEn}\nPersian: ${item.textFa}\nSources: ${refs}`;
  }).join("\n\n");
  const system=[
    "You are GLYMIZE Evidence Assistant, a read-only evidence-grounded clinical reference assistant for clinicians.",
    "Use ONLY the evidence passages supplied in this request.",
    "Never invent a dose, threshold, contraindication, recommendation, citation, guideline section, or patient-specific treatment order.",
    "If the evidence is insufficient, explicitly say that the approved GLYMIZE corpus does not contain enough information.",
    "Do not change or recommend changing GLYMIZE clinical-engine scores or rules.",
    "Attach evidence markers such as [E1] to every clinical claim.",
    "Preserve uncertainty and distinguish guideline, consensus, and regulatory evidence when relevant.",
    locale==="fa" ? "Answer in Persian." : "Answer in English.",
  ].join(" ");
  return [
    {role:"system" as const,content:system},
    {role:"user" as const,content:`Clinician question: ${question}\n\nApproved evidence:\n${evidenceText}`},
  ];
}
