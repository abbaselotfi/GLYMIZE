import { evaluatePredicateV2, type FactMapV2 } from "./predicates.js";
import type {
  ClinicalStateV2,
  DecisionLaneV2,
  DoseRuleUseCaseV2,
  DoseRuleV2,
  PatientContextV2,
  ResolvedDosePlanV2,
  StrengthComponentV2,
} from "./types.js";

function rounded(value: number, step = 1) {
  return Math.round(value / step) * step;
}

function componentText(components: StrengthComponentV2[]) {
  return components.map((item) => `${item.amount} ${item.unit} ${item.ingredientKey}`).join(" + ");
}

function divideComponents(components: readonly StrengthComponentV2[], divisor: number): StrengthComponentV2[] {
  return components.map((component) => ({ ...component, amount: component.amount / divisor }));
}

export function approvedDoseRulesForV2(
  masterDrugId: string,
  rules: readonly DoseRuleV2[],
  facts: FactMapV2,
  useCase: DoseRuleUseCaseV2 = "either",
  lane?: DecisionLaneV2,
) {
  return rules.filter((rule) => {
    if (rule.masterDrugId !== masterDrugId || rule.reviewState !== "approved") return false;
    const ruleUseCase = rule.useCase ?? "either";
    if (useCase !== "either" && ruleUseCase !== "either" && ruleUseCase !== useCase) return false;
    if (rule.lane && lane && rule.lane !== lane) return false;
    return !rule.eligibility || evaluatePredicateV2(rule.eligibility, facts);
  });
}

export function resolveDosePlanV2(
  rule: DoseRuleV2,
  patient: PatientContextV2,
  state: ClinicalStateV2,
): ResolvedDosePlanV2 | undefined {
  if (rule.reviewState !== "approved") return undefined;
  const formula = rule.formula;
  const common = {
    ruleId: rule.id,
    masterDrugId: rule.masterDrugId,
    productId: rule.productId,
    dosageFormGroup: rule.dosageFormGroup,
    lane: rule.lane,
    selectionRole: rule.selectionRole ?? "default" as const,
    useCase: rule.useCase ?? "either" as const,
    titrationText: rule.titration
      ? `${rule.titration.stepText}${rule.titration.intervalDays ? `؛ هر ${rule.titration.intervalDays} روز` : ""}${rule.titration.targetMetric ? `؛ هدف: ${rule.titration.targetMetric}` : ""}`
      : undefined,
    targetDoseText: rule.targetDoseText,
    maximumDoseText: rule.maximumDoseText,
    monitoring: rule.monitoring ?? [],
    evidence: rule.evidence,
    clinicianConfirmationRequired: true as const,
  };

  if (formula.kind === "fixed_daily_components") {
    const perAdministration = formula.administrationsPerDay > 0
      ? divideComponents(formula.dailyComponents, formula.administrationsPerDay)
      : undefined;
    return {
      ...common,
      dailyComponents: formula.dailyComponents,
      perAdministrationComponents: perAdministration,
      administrationsPerDay: formula.administrationsPerDay,
      displayStartDose: `${componentText(formula.dailyComponents)} در روز، در ${formula.administrationsPerDay} نوبت`,
    };
  }

  if (formula.kind === "fixed_interval_components") {
    if (!(formula.periodDays > 0) || !(formula.administrationsPerPeriod > 0)) return undefined;
    const administrationsPerDay = formula.administrationsPerPeriod / formula.periodDays;
    const administrationsPer30Days = administrationsPerDay * 30;
    return {
      ...common,
      perAdministrationComponents: formula.componentsPerAdministration,
      administrationsPerDay,
      administrationsPer30Days,
      scheduleText: formula.periodDays === 7 && formula.administrationsPerPeriod === 1
        ? "once weekly"
        : `${formula.administrationsPerPeriod} administration(s) every ${formula.periodDays} days`,
      displayStartDose: `${componentText(formula.componentsPerAdministration)} per administration; ${formula.administrationsPerPeriod} time(s) every ${formula.periodDays} days`,
    };
  }

  if (formula.kind === "presentation_units") {
    const perDay = formula.unitsPerAdministration * formula.administrationsPerDay;
    return {
      ...common,
      administrationsPerDay: formula.administrationsPerDay,
      presentationUnitsPerDay: perDay,
      consumptionUnitHint: formula.unitLabel,
      displayStartDose: `${formula.unitsPerAdministration} ${formula.unitLabel} × ${formula.administrationsPerDay} بار در روز`,
    };
  }

  if (formula.kind === "weight_based_daily") {
    const weightKg = patient.anthropometrics?.weightKg;
    if (weightKg === undefined) return undefined;
    let perKg: number;
    if (formula.selection === "lower_bound") perKg = formula.minPerKg;
    else if (formula.selection === "upper_bound") perKg = formula.maxPerKg;
    else perKg = state.severeHyperglycemia ? formula.maxPerKg : formula.minPerKg;
    const daily = rounded(weightKg * perKg, formula.roundTo ?? 1);
    const dailyComponents = [{ ingredientKey: formula.ingredientKey, amount: daily, unit: formula.unit }];
    return {
      ...common,
      dailyComponents,
      perAdministrationComponents: formula.administrationsPerDay === 1 ? dailyComponents : divideComponents(dailyComponents, formula.administrationsPerDay),
      administrationsPerDay: formula.administrationsPerDay,
      displayStartDose: `${daily} ${formula.unit}/day (${perKg} ${formula.unit}/kg/day بر اساس وزن ${weightKg} kg)`,
    };
  }

  if (formula.kind === "frc_initial") {
    const active = (patient.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active");
    const currentBasal = active.find((item) =>
      typeof item.basalInsulinUnitsPerDay === "number" && Number.isFinite(item.basalInsulinUnitsPerDay),
    );
    const basalUnits = currentBasal?.basalInsulinUnitsPerDay;
    const currentGlp = active.some((item) =>
      ["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "fixed_ratio_combination"].includes(item.therapyGroup ?? ""),
    );
    let doseSteps: number | undefined;
    let insulinUnits: number | undefined;
    let incretinAmount: number | undefined;
    let incretinUnit: "mcg" | "mg" = "mcg";
    let titrationText = common.titrationText;
    let maximumDoseText = common.maximumDoseText;
    const rationale: string[] = [];

    if (formula.protocol === "soliqua_us_100_33") {
      if (basalUnits !== undefined && basalUnits > 60) return undefined;
      doseSteps = basalUnits !== undefined && basalUnits >= 30 ? 30 : 15;
      insulinUnits = doseSteps;
      incretinAmount = Math.round((doseSteps / 3) * 100) / 100;
      titrationText = "Titrate SOLIQUA 100/33 by 2–4 units up or down once weekly according to fasting glucose, metabolic needs, and individualized glycemic goal.";
      maximumDoseText = "60 dose units/day (60 U insulin glargine + 20 mcg lixisenatide).";
      rationale.push(basalUnits === undefined ? "No active basal dose detected: regulatory starting dose 15 units." : basalUnits < 30 ? "Previous basal dose <30 U/day: regulatory starting dose 15 units." : "Previous basal dose 30–60 U/day: regulatory starting dose 30 units.");
      if (currentGlp) rationale.push("Previous GLP-1-based therapy must be discontinued before initiation per product label.");
    } else if (formula.protocol === "xultophy_us_100_3_6") {
      doseSteps = basalUnits !== undefined || currentGlp ? 16 : 10;
      insulinUnits = doseSteps;
      incretinAmount = Math.round(doseSteps * 0.036 * 1000) / 1000;
      incretinUnit = "mg";
      titrationText = "Titrate XULTOPHY 100/3.6 by 2 units at 3–4 day intervals (once or twice weekly) according to self-monitored fasting glucose and individualized target.";
      maximumDoseText = "50 dose units/day (50 U insulin degludec + 1.8 mg liraglutide).";
      rationale.push(basalUnits !== undefined || currentGlp ? "Current basal insulin or GLP-1 RA detected: regulatory starting dose 16 units." : "Basal-insulin/GLP-1-naive: regulatory starting dose 10 units.");
    } else {
      // EU Suliqua uses two pens. For twice-daily basal insulin or glargine U-300,
      // the prior total daily basal dose is reduced by 20% before the starting-dose table.
      let adjusted = basalUnits;
      if (adjusted !== undefined) {
        const sourceName = (currentBasal?.genericName ?? "").toLocaleLowerCase();
        const sourceFrequency = currentBasal?.administrationsPerDay ?? 1;
        if (/u[- ]?300|300\s*(?:u|unit)/i.test(sourceName) || sourceFrequency > 1) {
          adjusted = adjusted * 0.8;
          rationale.push("Prior U-300 glargine or multiple-daily basal regimen: 20% reduction applied before the EU Suliqua starting-dose table.");
        }
      }
      if (formula.protocol === "suliqua_eu_100_50") {
        if (adjusted === undefined || adjusted < 20) doseSteps = 10;
        else if (adjusted < 30) doseSteps = 20;
        else return undefined;
        insulinUnits = doseSteps;
        incretinAmount = doseSteps * 0.5;
        maximumDoseText = "This 100/50 pen delivers 10–40 dose steps; initial selection must remain within the labeled starting table.";
      } else if (formula.protocol === "suliqua_eu_100_33") {
        if (adjusted === undefined || adjusted < 30 || adjusted > 60) return undefined;
        doseSteps = 30;
        insulinUnits = 30;
        incretinAmount = 10;
        maximumDoseText = "This 100/33 pen delivers 30–60 dose steps; initial selection must remain within the labeled starting table.";
      }
      titrationText = "Individualize once-daily Suliqua titration using fasting glucose and the approved product information for the exact pen.";
    }

    if (doseSteps === undefined || insulinUnits === undefined || incretinAmount === undefined) return undefined;
    const dailyComponents: StrengthComponentV2[] = [
      { ingredientKey: formula.insulinIngredientKey, amount: insulinUnits, unit: "U" },
      { ingredientKey: formula.incretinIngredientKey, amount: incretinAmount, unit: incretinUnit },
    ];
    return {
      ...common,
      dailyComponents,
      perAdministrationComponents: dailyComponents,
      administrationsPerDay: 1,
      displayStartDose: `${doseSteps} dose step(s): ${componentText(dailyComponents)}`,
      titrationText: [titrationText, ...rationale].filter(Boolean).join(" "),
      maximumDoseText,
    };
  }

  const basal = (patient.currentMedications ?? [])
    .filter((item) => (item.status ?? "active") === "active")
    .map((item) => item.basalInsulinUnitsPerDay)
    .find((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (formula.kind === "prandial_initial") {
    if (basal === undefined) return undefined;
    const fractional = rounded(basal * formula.fractionOfBasal, 1);
    const suggested = Math.max(formula.fixedUnits, fractional);
    const dailyComponents = [{ ingredientKey: formula.ingredientKey, amount: suggested, unit: "U" }];
    return {
      ...common,
      dailyComponents,
      perAdministrationComponents: dailyComponents,
      administrationsPerDay: 1,
      displayStartDose: `${suggested} U با وعده اصلی (قاعده مرجع: ${formula.fixedUnits} U یا ${Math.round(formula.fractionOfBasal * 100)}% دوز basal؛ تأیید پزشک الزامی)`,
    };
  }
}

/**
 * Preserves an explicitly documented current dose as a continuation execution
 * plan. This does not infer or newly prescribe a dose; it allows Decision Graph
 * to evaluate current-regimen cost/market fit and compare simplification options.
 */
export function resolveDocumentedCurrentDosePlanV2(
  masterDrugId: string,
  patient: PatientContextV2,
  evidence: ResolvedDosePlanV2["evidence"],
): ResolvedDosePlanV2 | undefined {
  const current = (patient.currentMedications ?? []).find((item) =>
    (item.status ?? "active") === "active" && item.masterDrugId === masterDrugId,
  );
  if (!current?.dailyDose?.length || !current.administrationsPerDay || current.administrationsPerDay <= 0) return undefined;
  const dailyComponents = current.dailyDose.map((item) => ({ ...item }));
  const perAdministrationComponents = divideComponents(dailyComponents, current.administrationsPerDay);
  return {
    ruleId: `CURRENT-DOCUMENTED:${masterDrugId}`,
    masterDrugId,
    dosageFormGroup: current.dosageFormGroup,
    selectionRole: "default",
    useCase: "continuation",
    dailyComponents,
    perAdministrationComponents,
    administrationsPerDay: current.administrationsPerDay,
    displayStartDose: `Current documented regimen: ${componentText(dailyComponents)} per day in ${current.administrationsPerDay} administration(s)`,
    titrationText: "No titration is inferred from the current-medication record; any dose change requires an approved dose rule.",
    monitoring: [],
    evidence,
    clinicianConfirmationRequired: true,
  };
}
