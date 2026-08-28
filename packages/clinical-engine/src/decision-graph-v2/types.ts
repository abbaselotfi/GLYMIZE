/**
 * GLYMIZE Decision Graph v2 — domain model.
 *
 * Design invariant: no aggregate medication score exists anywhere in v2.
 * Decisions are made by hard gates, mandatory objectives, Pareto pruning,
 * and deterministic lexicographic tie-breakers.
 */

export type EvidenceStrengthV2 =
  | "guideline_grade_a"
  | "guideline_grade_b"
  | "guideline_grade_c"
  | "expert_consensus"
  | "regulatory_label"
  | "outcome_evidence"
  | "supportive";

export interface EvidenceReferenceV2 {
  sourceId: string;
  title: string;
  version?: string;
  url: string;
  locator?: string;
  strength?: EvidenceStrengthV2;
}

export type DecisionLaneV2 =
  | "glycemic"
  | "kidney"
  | "heart_failure"
  | "ascvd"
  | "hypertension"
  | "lipids"
  | "liver"
  | "diabetic_foot"
  | "other";

export type ClinicalObjectiveIdV2 =
  | "glycemic_control"
  | "high_efficacy_glycemic_control"
  | "insulin_replacement"
  | "kidney_protection"
  | "heart_failure_protection"
  | "ascvd_protection"
  | "weight_benefit"
  | "low_hypoglycemia_risk"
  | "liver_directed_therapy"
  | "blood_pressure_control"
  | "lipid_risk_reduction"
  | "diabetic_foot_parallel_pathway";

export type ObjectiveLevelV2 = "mandatory" | "strong_preference" | "preference";

export interface ClinicalObjectiveV2 {
  id: ClinicalObjectiveIdV2;
  lane: DecisionLaneV2;
  level: ObjectiveLevelV2;
  reason: string;
  evidence: EvidenceReferenceV2[];
}

export type ClinicalEffectDirectionV2 =
  | "strong_benefit"
  | "benefit"
  | "neutral"
  | "risk"
  | "avoid"
  | "not_established";

export interface ClinicalEffectV2 {
  objective: ClinicalObjectiveIdV2;
  direction: ClinicalEffectDirectionV2;
  phenotype?: string;
  evidence: EvidenceReferenceV2[];
  note?: string;
}

export type GlycemicEfficacyBandV2 = "none" | "modest" | "intermediate" | "high" | "very_high";
export type HypoglycemiaRiskBandV2 = "minimal" | "low" | "moderate" | "high";
export type WeightDirectionV2 = "loss" | "neutral" | "gain" | "unknown";

export type MedicationEngineStateV2 = "approved" | "review_required" | "disabled";

export interface KnowledgeMedicationV2 {
  masterDrugId: string;
  genericName: string;
  persianName?: string;
  combination: boolean;
  componentMasterDrugIds?: string[];
  therapeuticAreas: string[];
  therapyGroup: string;
  drugClass?: string;
  primaryLanes: DecisionLaneV2[];
  routeOptions: string[];
  dosageFormGroups?: string[];
  efficacyBand: GlycemicEfficacyBandV2;
  hypoglycemiaRisk: HypoglycemiaRiskBandV2;
  weightDirection: WeightDirectionV2;
  effects: ClinicalEffectV2[];
  tags?: string[];
  evidence: EvidenceReferenceV2[];
  engineState: MedicationEngineStateV2;
}

export type NfiMatchStateV2 = "verified" | "review_required" | "unmatched";
export type MarketPresenceV2 = "confirmed_active" | "recently_observed" | "unknown" | "unavailable";

export interface NfiLicenseStateV2 {
  everValid: boolean;
  currentValid: boolean;
  revoked?: boolean;
  validUntil?: string;
  statusText?: string;
}

export interface StrengthComponentV2 {
  ingredientKey: string;
  amount: number;
  unit: string;
}

/**
 * NFI-normalized purchasable product.
 * `strengthComponents` expresses active ingredient amount per one consumptionUnit.
 * Examples:
 * - tablet: 500 mg per tablet => consumptionUnit="tablet", 500 mg
 * - insulin: 1 U per U => consumptionUnit="U", 1 U
 * - solution: 10 mg per mL => consumptionUnit="mL", 10 mg
 */
export interface IranMarketProductV2 {
  productId: string;
  masterDrugId?: string;
  nfiMatchState: NfiMatchStateV2;
  genericName: string;
  brandName?: string;
  manufacturerName?: string;
  genericRegistryCode?: string;
  brandRegistryCode?: string;
  ircCode?: string;
  dosageFormGroup: string;
  route: string;
  consumptionUnit: string;
  strengthComponents: StrengthComponentV2[];
  /** Number of consumption units in one market purchase unit. */
  consumptionUnitsPerPurchaseUnit: number;
  purchaseUnitLabel: string;
  /** Optional inner container details (e.g. pens per box). */
  containerLabel?: string;
  consumptionUnitsPerContainer?: number;
  containersPerPurchaseUnit?: number;
  priceToman?: number;
  priceObservedAt?: string;
  license: NfiLicenseStateV2;
  marketPresence: MarketPresenceV2;
  sourceUrl?: string;
  sourceReference?: string;
  observedAt: string;
}

export type IranAvailabilityClassV2 =
  | "current_market"
  | "current_license_market_unconfirmed"
  | "historical_only"
  | "excluded_unverified_match"
  | "excluded_revoked"
  | "excluded_never_licensed"
  | "excluded_unavailable";

export interface IranAvailabilityAssessmentV2 {
  masterDrugId: string;
  classification: IranAvailabilityClassV2;
  mainRecommendationEligible: boolean;
  moreOptionsEligible: boolean;
  currentProductIds: string[];
  historicalProductIds: string[];
  reasons: string[];
}

export interface CgmMetricsV2 {
  daysCaptured?: number;
  averageGlucoseMgDl?: number;
  gmiPercent?: number;
  timeInRange70To180Percent?: number;
  timeAbove180Percent?: number;
  timeAbove250Percent?: number;
  timeBelow70Percent?: number;
  timeBelow54Percent?: number;
  coefficientOfVariationPercent?: number;
}

export interface SmbgPatternV2 {
  fastingMgDl?: number[];
  premealMgDl?: number[];
  twoHourPostmealMgDl?: number[];
  bedtimeMgDl?: number[];
}

export interface GlycemicContextV2 {
  currentHba1c: number;
  targetHba1c: number;
  fastingPlasmaGlucoseMgDl?: number;
  twoHourPostprandialGlucoseMgDl?: number;
  randomGlucoseMgDl?: number;
  hyperglycemiaSymptoms?: boolean;
  catabolicFeatures?: boolean;
  ketonesKnownPositive?: boolean;
  smbg?: SmbgPatternV2;
  cgm?: CgmMetricsV2;
}

export interface AnthropometricsV2 {
  weightKg?: number;
  heightCm?: number;
  bmi?: number;
  waistCircumferenceCm?: number;
}

export interface KidneyContextV2 {
  ckd?: boolean;
  eGfr?: number;
  uacrMgG?: number;
  potassiumMmolL?: number;
  dialysis?: boolean;
  kidneyTransplant?: boolean;
  recentAki?: boolean;
}

export interface CardiovascularContextV2 {
  ascvd?: boolean;
  priorMi?: boolean;
  priorStrokeTia?: boolean;
  peripheralArteryDisease?: boolean;
  heartFailure?: boolean;
  lvefPercent?: number;
  nyhaClass?: "I" | "II" | "III" | "IV";
  systolicBloodPressure?: number;
  diastolicBloodPressure?: number;
}

export interface LipidContextV2 {
  ldlMgDl?: number;
  hdlMgDl?: number;
  triglyceridesMgDl?: number;
}

export interface LiverContextV2 {
  masldMash?: boolean;
  fibrosisStage?: "F0" | "F1" | "F2" | "F3" | "F4" | "unknown";
  cirrhosis?: boolean;
  decompensatedCirrhosis?: boolean;
  astUL?: number;
  altUL?: number;
  plateletCount10e9L?: number;
  liverStiffnessKpa?: number;
}

export interface CurrentMedicationV2 {
  masterDrugId?: string;
  genericName: string;
  therapyGroup?: string;
  route?: string;
  dosageFormGroup?: string;
  dailyDose?: StrengthComponentV2[];
  administrationsPerDay?: number;
  basalInsulinUnitsPerDay?: number;
  status?: "active" | "held" | "stopped";
  adherence?: "good" | "partial" | "poor" | "unknown";
  tolerance?: "good" | "limited" | "intolerant" | "unknown";
}

export interface InsulinPracticalContextV2 {
  multipleDailyInjectionFeasible?: boolean;
  mealPatternRegularity?: "regular" | "irregular" | "unknown";
  injectionAcceptance?: "accepts" | "reluctant" | "refuses_unless_required" | "unknown";
}

export interface PatientContextV2 {
  ageYears?: number;
  sexAtBirth?: "female" | "male" | "other_or_unknown";
  pregnancy?: boolean;
  glycemia: GlycemicContextV2;
  anthropometrics?: AnthropometricsV2;
  kidney?: KidneyContextV2;
  cardiovascular?: CardiovascularContextV2;
  lipids?: LipidContextV2;
  liver?: LiverContextV2;
  hypoglycemiaRisk?: "standard" | "high";
  currentMedications?: CurrentMedicationV2[];
  insulinPractical?: InsulinPracticalContextV2;
}

export type RoutePreferenceV2 = "oral_only" | "prefer_oral" | "oral_or_injectable";
export type CostPreferenceV2 = "no_constraint" | "moderate" | "low_cost" | "insured_only";

export interface DecisionPreferencesV2 {
  routePreference: RoutePreferenceV2;
  costPreference: CostPreferenceV2;
  monthlyMedicationBudgetToman?: number;
  insuranceProviders?: string[];
  adherencePriority?: "standard" | "simplify_regimen";
  adminPreferredProductByMasterDrugId?: Record<string, string>;
}

export interface ClinicianContextV2 {
  specialty?: string;
}

export type FactKeyV2 =
  | "pregnancy"
  | "glycemia.severeHyperglycemia"
  | "glycemia.fastingPlasmaGlucoseMgDl"
  | "glycemia.twoHourPostprandialGlucoseMgDl"
  | "kidney.ckd"
  | "kidney.eGfr"
  | "kidney.uacrMgG"
  | "kidney.potassiumMmolL"
  | "cardiovascular.ascvd"
  | "cardiovascular.heartFailure"
  | "cardiovascular.lvefPercent"
  | "liver.masldMash"
  | "liver.fibrosisStage"
  | "liver.cirrhosis"
  | "hypoglycemia.highRisk";

export type ScalarV2 = string | number | boolean;

export type PredicateV2 =
  | { fact: FactKeyV2; op: "exists" }
  | { fact: FactKeyV2; op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte"; value: ScalarV2 }
  | { all: PredicateV2[] }
  | { any: PredicateV2[] }
  | { not: PredicateV2 };

export interface MedicationGateRuleV2 {
  id: string;
  masterDrugId?: string;
  therapyGroup?: string;
  when: PredicateV2;
  effect: "exclude" | "conditional";
  reason: string;
  evidence: EvidenceReferenceV2[];
}

export interface RegimenConflictRuleV2 {
  id: string;
  tagA: string;
  tagB: string;
  reason: string;
  evidence: EvidenceReferenceV2[];
}

export interface RegimenTemplateV2 {
  id: string;
  lane: DecisionLaneV2;
  componentMasterDrugIds?: string[];
  componentTherapyGroups?: string[];
  allowedPathways: Type2PathwayV2[];
  rationale: string;
  evidence: EvidenceReferenceV2[];
  reviewState: "candidate" | "approved" | "retired";
}

export type DoseFormulaV2 =
  | {
      kind: "fixed_daily_components";
      dailyComponents: StrengthComponentV2[];
      administrationsPerDay: number;
    }
  | {
      kind: "fixed_interval_components";
      componentsPerAdministration: StrengthComponentV2[];
      administrationsPerPeriod: number;
      periodDays: number;
    }
  | {
      kind: "weight_based_daily";
      ingredientKey: string;
      unit: string;
      minPerKg: number;
      maxPerKg: number;
      administrationsPerDay: number;
      selection: "lower_bound" | "upper_bound" | "by_glycemic_severity";
      roundTo?: number;
    }
  | {
      kind: "presentation_units";
      unitsPerAdministration: number;
      administrationsPerDay: number;
      unitLabel: string;
    }
  | {
      kind: "frc_initial";
      protocol: "soliqua_us_100_33" | "suliqua_eu_100_50" | "suliqua_eu_100_33" | "xultophy_us_100_3_6";
      insulinIngredientKey: string;
      incretinIngredientKey: string;
    }
  | {
      kind: "prandial_initial";
      ingredientKey: string;
      fixedUnits: number;
      fractionOfBasal: number;
      meal: "largest_meal";
    };

export type DoseRuleSelectionRoleV2 = "default" | "alternative_formulation" | "product_specific";
export type DoseRuleUseCaseV2 = "initiation" | "continuation" | "either";

export interface DoseRuleV2 {
  id: string;
  masterDrugId: string;
  /** Optional exact NFI product binding for product-specific dosing protocols. */
  productId?: string;
  indication: string;
  lane?: DecisionLaneV2;
  dosageFormGroup?: string;
  selectionRole?: DoseRuleSelectionRoleV2;
  useCase?: DoseRuleUseCaseV2;
  formula: DoseFormulaV2;
  eligibility?: PredicateV2;
  titration?: {
    stepText: string;
    intervalDays?: number;
    targetMetric?: string;
  };
  titrationProtocolId?: string;
  targetDoseText?: string;
  maximumDoseText?: string;
  monitoring?: string[];
  evidence: EvidenceReferenceV2[];
  reviewState: "candidate" | "approved" | "retired";
}

export interface ResolvedDosePlanV2 {
  ruleId: string;
  masterDrugId: string;
  /** When present, this dose plan may execute only against this exact market product. */
  productId?: string;
  dosageFormGroup?: string;
  lane?: DecisionLaneV2;
  selectionRole?: DoseRuleSelectionRoleV2;
  useCase?: DoseRuleUseCaseV2;
  dailyComponents?: StrengthComponentV2[];
  perAdministrationComponents?: StrengthComponentV2[];
  administrationsPerDay: number;
  /** Exact normalized administrations within a 30-day treatment window. */
  administrationsPer30Days?: number;
  scheduleText?: string;
  presentationUnitsPerDay?: number;
  presentationUnitsPer30Days?: number;
  consumptionUnitHint?: string;
  displayStartDose: string;
  titrationText?: string;
  targetDoseText?: string;
  maximumDoseText?: string;
  monitoring: string[];
  evidence: EvidenceReferenceV2[];
  clinicianConfirmationRequired: true;
}



export type TitrationActionV2 = "hold" | "increase" | "reduce" | "maintain" | "stop_and_review" | "needs_data";

export interface TitrationProtocolV2 {
  id: string;
  masterDrugId: string;
  kind: "stepwise_fixed" | "basal_fpg";
  minimumDaysOnCurrentDose?: number;
  steps?: Array<{
    currentDose: StrengthComponentV2[];
    nextDose: StrengthComponentV2[];
    reason: string;
  }>;
  basal?: {
    targetLowMgDl: number;
    targetHighMgDl: number;
    increaseUnits: number;
    decreaseUnits: number;
    minimumDoseUnits: number;
    minimumDaysBetweenChanges: number;
  };
  evidence: EvidenceReferenceV2[];
  reviewState: "candidate" | "approved" | "retired";
}

export interface TitrationRequestV2 {
  masterDrugId: string;
  currentDose: StrengthComponentV2[];
  daysOnCurrentDose?: number;
  fastingGlucoseMgDl?: number[];
  symptomaticHypoglycemia?: boolean;
  glucoseBelow70MgDl?: boolean;
  tolerability?: "good" | "limited" | "intolerant" | "unknown";
  additionalGlycemicControlNeeded?: boolean;
}

export interface TitrationRecommendationV2 {
  protocolId?: string;
  action: TitrationActionV2;
  nextDose?: StrengthComponentV2[];
  rationale: string[];
  evidence: EvidenceReferenceV2[];
  clinicianConfirmationRequired: true;
}

export interface InsurancePolicyRuleV2 {
  id: string;
  provider: string;
  productId?: string;
  masterDrugId?: string;
  coveragePercent?: number;
  referencePriceTomanPerPurchaseUnit?: number;
  patientShareTomanPerPurchaseUnit?: number;
  insurerShareTomanPerPurchaseUnit?: number;
  maxCoveredPurchaseUnitsPer30Days?: number;
  approvedSpecialties?: string[];
  requiresPriorAuthorization?: boolean;
  requiresDossier?: boolean;
  requiresOfficeVisit?: boolean;
  requiredDocuments?: string[];
  conditions?: string[];
  effectiveAt?: string;
  sourceUrl?: string;
  sourceReference?: string;
}

export interface InsuranceCostEstimateV2 {
  provider: string;
  eligibility: "eligible" | "conditional" | "ineligible" | "unknown";
  rawCoveragePercent?: number;
  displayCoveragePercent?: number;
  coveredPurchaseUnits: number;
  uncoveredPurchaseUnits: number;
  patientCostIfEligibleToman: number;
  insurerCostIfEligibleToman: number;
  conditions: string[];
  genericRegistryCode?: string;
  brandRegistryCode?: string;
}

export interface ProductMonthlyCostV2 {
  productId: string;
  brandName?: string;
  dosageFormGroup: string;
  doseFit: "exact" | "not_compatible";
  consumptionUnitsPerDay: number;
  consumptionUnits30Days: number;
  containersNeeded30Days?: number;
  purchaseUnitsNeeded30Days: number;
  /** Proportional value of the medicine actually consumed over 30 days. */
  consumedDrugValueToman: number;
  /** Whole-package cash outlay required to start a zero-inventory 30-day window. */
  cashPurchaseCostToman: number;
  /** Steady-state 30-day treatment value after preserving package carryover. */
  normalized30DayTreatmentCostToman: number;
  leftoverConsumptionUnitsAfter30Days: number;
  /** Value remaining in purchased packages after day 30; not assumed wasted. */
  carryoverInventoryValueToman: number;
  insurance: InsuranceCostEstimateV2[];
}

export interface GenericCostBenchmarkV2 {
  basis: "admin_preferred" | "generic_reference" | "median_current_market" | "single_current_market";
  referenceMonthlyCashCostToman: number;
  lowestMonthlyCashCostToman: number;
  highestMonthlyCashCostToman: number;
  medianMonthlyCashCostToman: number;
  referenceNormalized30DayCostToman: number;
  lowestNormalized30DayCostToman: number;
  highestNormalized30DayCostToman: number;
  medianNormalized30DayCostToman: number;
  referenceProductId?: string;
  referenceBrandName?: string;
  comparableProductIds: string[];
}

export type Type2PathwayV2 =
  | "maintain_and_monitor"
  | "modest_intensification"
  | "high_efficacy_combination"
  | "insulin_centered";

export type InsulinActionV2 =
  | "none"
  | "evaluate_start_basal"
  | "titrate_basal"
  | "request_postprandial_pattern"
  | "consider_glp1_or_frc_before_prandial"
  | "add_prandial"
  | "consider_premix";


export type InsulinConversionExecutionStatusV2 = "executable" | "specialist_review" | "unsupported" | "needs_data";
export type InsulinConversionEvidenceTierV2 = "regulatory_label" | "reviewed_interchange" | "extrapolation";

export interface InsulinConversionRuleV2 {
  id: string;
  sourceMasterDrugId: string;
  targetMasterDrugId: string;
  sourceFrequencyPerDay?: number[];
  factor: number;
  executionStatus: Exclude<InsulinConversionExecutionStatusV2, "unsupported" | "needs_data">;
  evidenceTier: InsulinConversionEvidenceTierV2;
  reason: string;
  evidence: EvidenceReferenceV2[];
}

export interface InsulinConversionRequestV2 {
  sourceMasterDrugId: string;
  targetMasterDrugId: string;
  sourceTotalDailyUnits: number;
  sourceFrequencyPerDay: number;
  /** Required for conversions that preserve a multi-injection schedule. */
  sourcePerInjectionUnits?: number[];
  targetFrequencyPerDay?: number;
}

export interface InsulinConversionResultV2 {
  status: InsulinConversionExecutionStatusV2;
  sourceMasterDrugId: string;
  targetMasterDrugId: string;
  sourceTotalDailyUnits: number;
  sourceFrequencyPerDay: number;
  /** Required for conversions that preserve a multi-injection schedule. */
  sourcePerInjectionUnits?: number[];
  targetFrequencyPerDay?: number;
  targetStartingTotalDailyUnits?: number;
  targetPerInjectionUnits?: number[];
  appliedRuleId?: string;
  factor?: number;
  rationale: string[];
  evidence: EvidenceReferenceV2[];
  clinicianConfirmationRequired: true;
}

export type FrcProtocolIdV2 = "soliqua_us_100_33" | "suliqua_eu_100_50" | "suliqua_eu_100_33" | "xultophy_us_100_3_6";

export interface FrcProductProtocolBindingV2 {
  id: string;
  productId: string;
  masterDrugId: string;
  protocol: FrcProtocolIdV2;
  evidence: EvidenceReferenceV2[];
  reviewState: "candidate" | "approved" | "retired";
}

export interface ClinicalStateV2 {
  pathway: Type2PathwayV2;
  insulinAction: InsulinActionV2;
  severeHyperglycemia: boolean;
  hba1cGap: number;
  fastingAtTarget?: boolean;
  postprandialAboveTarget?: boolean;
  reasons: string[];
  evidence: EvidenceReferenceV2[];
}

export type MissingDataPriorityV2 = "required" | "recommended" | "optional";

export interface MissingDataRequirementV2 {
  key: string;
  priority: MissingDataPriorityV2;
  blocksFinalDecision: boolean;
  reason: string;
  evidence: EvidenceReferenceV2[];
}

export type HardGateStatusV2 = "pass" | "conditional" | "exclude" | "historical_only" | "needs_data";

export interface GateOutcomeV2 {
  status: HardGateStatusV2;
  reasons: string[];
  evidence: EvidenceReferenceV2[];
}

export type RegimenKindV2 =
  | "single"
  | "fixed_dose_combination"
  | "approved_multi_drug_template"
  | "current_regimen_plus_add_on"
  | "insulin_basal"
  | "insulin_frc"
  | "insulin_basal_prandial"
  | "premix"
  | "organ_protection";

export interface RegimenComponentV2 {
  masterDrugId: string;
  genericName: string;
  persianName?: string;
  therapyGroup: string;
  tags: string[];
  dosePlan?: ResolvedDosePlanV2;
  doseOptions?: ResolvedDosePlanV2[];
  availability: IranAvailabilityAssessmentV2;
  selectedProduct?: IranMarketProductV2;
  selectedProductCost?: ProductMonthlyCostV2;
  genericCostBenchmark?: GenericCostBenchmarkV2;
}

export type RegimenWeightProfileV2 = "loss" | "neutral" | "gain" | "mixed" | "unknown";

export interface RegimenCandidateV2 {
  regimenId: string;
  lane: DecisionLaneV2;
  kind: RegimenKindV2;
  components: RegimenComponentV2[];
  efficacyBand: GlycemicEfficacyBandV2;
  hypoglycemiaRisk: HypoglycemiaRiskBandV2;
  weightProfile: RegimenWeightProfileV2;
  objectiveCoverage: ClinicalObjectiveIdV2[];
  objectiveStrength: Partial<Record<ClinicalObjectiveIdV2, "benefit" | "strong_benefit">>;
  evidence: EvidenceReferenceV2[];
  gate: GateOutcomeV2;
  routeFit: "match" | "neutral" | "conflict_overridden";
  insuranceFit: "eligible" | "conditional" | "unknown" | "not_covered";
  monthlyPatientCostToman?: number;
  dailyAdministrationBurden?: number;
  distinctProducts: number;
  reasons: string[];
  cautions: string[];
  preferenceConflicts: string[];
}


export type ComposedTherapyActionV2 =
  | "start"
  | "continue"
  | "continue_with_dose_reconciliation";

export interface ComposedTherapyComponentV2 {
  masterDrugId: string;
  genericName: string;
  persianName?: string;
  therapyGroup: string;
  tags: string[];
  action: ComposedTherapyActionV2;
  sourceRegimenIds: string[];
  sourceLanes: DecisionLaneV2[];
  servesObjectives: ClinicalObjectiveIdV2[];
  dosePlan?: ResolvedDosePlanV2;
  selectedProduct?: IranMarketProductV2;
  selectedProductCost?: ProductMonthlyCostV2;
  normalized30DayPatientCostToman?: number;
  reasons: string[];
}

export interface CurrentTherapyReviewV2 {
  masterDrugId?: string;
  genericName: string;
  disposition:
    | "continue_in_plan"
    | "continue_pending_standard_review"
    | "review_for_replacement"
    | "review_for_discontinuation"
    | "unresolved_identity";
  reason: string;
}

export interface ComposedTreatmentPlanV2 {
  planId: string;
  glycemicRegimenId?: string;
  supportingRegimenIds: string[];
  components: ComposedTherapyComponentV2[];
  coveredObjectives: ClinicalObjectiveIdV2[];
  unresolvedObjectives: ClinicalObjectiveIdV2[];
  monthlyPatientCostToman?: number;
  dailyAdministrationBurden?: number;
  currentTherapyReview: CurrentTherapyReviewV2[];
  reasons: string[];
  cautions: string[];
}

export interface RecommendationV2 extends RegimenCandidateV2 {
  whySelected: string[];
  evidenceSummary: EvidenceReferenceV2[];
  insulinToolAction?: {
    action: InsulinActionV2;
    launchRecommended: boolean;
    reason: string;
  };
}

export interface DecisionTraceEntryV2 {
  nodeId: string;
  status: "passed" | "branched" | "needs_data" | "blocked";
  summary: string;
  details?: string[];
  evidence?: EvidenceReferenceV2[];
}

export interface DecisionGraphPolicyV2 {
  engineName: "GLYMIZE Decision Graph";
  engineVersion: string;
  severeHyperglycemiaA1cExclusiveAbove: number;
  severeHyperglycemiaGlucoseAtOrAboveMgDl: number;
  combinationTherapyA1cGapAtOrAbove: number;
  fastingTargetLowMgDl: number;
  fastingTargetHighMgDl: number;
  postprandialTargetUpperMgDl: number;
  overbasalizationBedtimeMorningDeltaMgDl: number;
  topAlternativeCount: number;
  evidence: {
    pharmacologic: EvidenceReferenceV2;
    glycemicGoals: EvidenceReferenceV2;
    technology: EvidenceReferenceV2;
  };
}

export interface DecisionGraphInventoryV2 {
  knowledge: KnowledgeMedicationV2[];
  marketProducts: IranMarketProductV2[];
  doseRules: DoseRuleV2[];
  insurancePolicies: InsurancePolicyRuleV2[];
  medicationGateRules?: MedicationGateRuleV2[];
  regimenConflictRules?: RegimenConflictRuleV2[];
  regimenTemplates?: RegimenTemplateV2[];
  /** Reviewed binding from an exact NFI FRC presentation to its regulatory dosing protocol. */
  frcProtocolBindings?: FrcProductProtocolBindingV2[];
  insulinConversionRules?: InsulinConversionRuleV2[];
  titrationProtocols?: TitrationProtocolV2[];
}

export interface DecisionGraphRequestV2 {
  patient: PatientContextV2;
  preferences: DecisionPreferencesV2;
  clinician?: ClinicianContextV2;
  inventory: DecisionGraphInventoryV2;
}

export interface DecisionGraphResultV2 {
  engine: {
    name: "GLYMIZE Decision Graph";
    version: string;
    scoreBased: false;
    selectionMethod: "hard_gates_then_pareto_then_lexicographic";
  };
  status: "complete" | "needs_data" | "no_fully_eligible_regimen" | "urgent_clinician_review";
  clinicalState: ClinicalStateV2;
  insulinSubgraph: import("./insulin-subgraph.js").InsulinSubgraphResultV2;
  missingData: MissingDataRequirementV2[];
  objectives: ClinicalObjectiveV2[];
  primary?: RecommendationV2;
  alternatives: RecommendationV2[];
  comorbidityRecommendations: RecommendationV2[];
  treatmentPlan?: ComposedTreatmentPlanV2;
  alternativeTreatmentPlans: ComposedTreatmentPlanV2[];
  moreOptions: RecommendationV2[];
  excluded: RegimenCandidateV2[];
  conflicts: string[];
  trace: DecisionTraceEntryV2[];
}
