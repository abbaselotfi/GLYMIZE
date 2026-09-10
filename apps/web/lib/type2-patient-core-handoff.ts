import type {
  PatientModuleInputKey,
  PatientModuleSourceRevision,
} from "@glymize/contracts/clinical-modules";
import type {
  PatientCoreFactBase,
  PatientCoreFreshness,
  PatientLongitudinalReadModel,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import type { Type2DecisionFactor } from "@glymize/contracts";
import { patientModuleSourceRevisionFingerprint } from "./patient-module-handoff";

export const TYPE2_PATIENT_CORE_MODULE_ID = "diabetes-type-2" as const;

export type Type2PatientCoreCandidateStatus =
  | "ready"
  | "unverified"
  | "stale"
  | "source_revision_missing"
  | "invalid_value";

export type Type2RequiredInputIssueReason =
  | "missing"
  | "unverified"
  | "stale"
  | "source_revision_missing"
  | "invalid_value";

export interface Type2PatientCoreCandidateField {
  key: PatientModuleInputKey;
  label: string;
  value?: number | boolean;
  unit?: string;
  observedAt?: string;
  status: Type2PatientCoreCandidateStatus;
  freshness: PatientCoreFreshness;
  required: boolean;
  source?: PatientModuleSourceRevision;
}

export interface Type2PatientCoreHandoffCandidate {
  moduleId: typeof TYPE2_PATIENT_CORE_MODULE_ID;
  scope: { practiceId: string; patientId: string };
  sourceRevisionFingerprint: string;
  sourceRevisions: PatientModuleSourceRevision[];
  fields: Type2PatientCoreCandidateField[];
  requiredIssues: Array<{
    key: "current_hba1c";
    reason: Type2RequiredInputIssueReason;
  }>;
  prefill: {
    currentHba1c?: number;
    eGfr?: number;
    creatinineClearanceMlMin?: number;
    uacr?: number;
    potassiumMmolL?: number;
    dialysis?: true;
    factors: Type2DecisionFactor[];
  };
}

type ObservationDefinition = {
  key: Exclude<PatientModuleInputKey,
    | "ascvd"
    | "heart_failure"
    | "ckd"
    | "dialysis"
    | "diabetic_foot"
    | "masld_mash"
    | "hypoglycemia_risk"
  >;
  prefixes: string[];
  label: string;
  required: boolean;
};

const observationDefinitions: ObservationDefinition[] = [
  {
    key: "current_hba1c",
    prefixes: ["observation:hba1c:"],
    label: "HbA1c",
    required: true,
  },
  {
    key: "egfr",
    prefixes: ["observation:egfr:"],
    label: "eGFR",
    required: false,
  },
  {
    key: "creatinine_clearance",
    prefixes: [
      "observation:creatinine_clearance:",
      "observation:crcl:",
    ],
    label: "Creatinine clearance",
    required: false,
  },
  {
    key: "uacr",
    prefixes: ["observation:uacr:"],
    label: "UACR",
    required: false,
  },
  {
    key: "potassium",
    prefixes: ["observation:potassium:"],
    label: "Potassium",
    required: false,
  },
];

type ContextDefinition = {
  key: Extract<PatientModuleInputKey,
    | "ascvd"
    | "heart_failure"
    | "ckd"
    | "dialysis"
    | "diabetic_foot"
    | "masld_mash"
    | "hypoglycemia_risk"
  >;
  factKey: string;
  label: string;
  factor?: Type2DecisionFactor;
};

const contextDefinitions: ContextDefinition[] = [
  { key: "ascvd", factKey: "context:ascvd", label: "ASCVD", factor: "ascvd" },
  {
    key: "heart_failure",
    factKey: "context:heartFailure",
    label: "Heart failure",
    factor: "heart_failure",
  },
  { key: "ckd", factKey: "context:ckd", label: "CKD", factor: "ckd" },
  {
    key: "dialysis",
    factKey: "context:dialysis",
    label: "Dialysis",
    factor: "ckd",
  },
  {
    key: "diabetic_foot",
    factKey: "context:diabeticFoot",
    label: "Diabetic foot",
    factor: "diabetic_foot",
  },
  {
    key: "masld_mash",
    factKey: "context:masldMash",
    label: "MASLD/MASH",
    factor: "masld_mash",
  },
  {
    key: "hypoglycemia_risk",
    factKey: "context:hypoglycemiaRisk",
    label: "Hypoglycemia risk",
    factor: "hypoglycemia_risk",
  },
];

function sameScope(
  fact: PatientCoreFactBase,
  scope: { practiceId: string; patientId: string },
) {
  return fact.meta.scope.practiceId === scope.practiceId &&
    fact.meta.scope.patientId === scope.patientId;
}

function assertScope(
  fact: PatientCoreFactBase,
  scope: { practiceId: string; patientId: string },
) {
  if (!sameScope(fact, scope)) {
    throw new Error("PATIENT_MODULE_HANDOFF_SCOPE_MISMATCH");
  }
}

function sourceRevision(
  fact: PatientCoreFactBase,
): PatientModuleSourceRevision | undefined {
  const revision = fact.meta.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    return undefined;
  }
  return {
    factId: fact.factId,
    revision,
    verification: fact.meta.verification,
    freshness: fact.meta.freshness,
  };
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function newestObservation(
  observations: readonly PatientObservationView[],
  prefixes: readonly string[],
) {
  return observations
    .filter((item) => prefixes.some((prefix) => item.factKey.startsWith(prefix)))
    .sort((left, right) => {
      const observed = right.observedAt.localeCompare(left.observedAt);
      if (observed !== 0) return observed;
      const recorded = (right.meta.recordedAt ?? "").localeCompare(
        left.meta.recordedAt ?? "",
      );
      if (recorded !== 0) return recorded;
      return right.factId.localeCompare(left.factId);
    })[0];
}

function candidateStatus(
  fact: PatientCoreFactBase,
  numeric: number | undefined,
): Type2PatientCoreCandidateStatus {
  if (numeric === undefined) return "invalid_value";
  if (fact.meta.verification !== "verified") return "unverified";
  if (fact.meta.freshness === "stale") return "stale";
  if (!sourceRevision(fact)) return "source_revision_missing";
  return "ready";
}

function requiredIssueFor(
  field: Type2PatientCoreCandidateField | undefined,
): Type2RequiredInputIssueReason | undefined {
  if (!field) return "missing";
  if (field.status === "ready") return undefined;
  return field.status;
}

function collectRevision(
  target: Map<string, PatientModuleSourceRevision>,
  fact: PatientCoreFactBase,
) {
  const revision = sourceRevision(fact);
  if (revision) target.set(revision.factId, revision);
}

export function buildType2PatientCoreHandoffCandidate(
  model: PatientLongitudinalReadModel,
): Type2PatientCoreHandoffCandidate {
  const scope = model.context.identity.scope;
  if (model.context.identity.patient.patientId !== scope.patientId) {
    throw new Error("PATIENT_MODULE_HANDOFF_IDENTITY_MISMATCH");
  }

  const fields: Type2PatientCoreCandidateField[] = [];
  const revisions = new Map<string, PatientModuleSourceRevision>();
  const prefill: Type2PatientCoreHandoffCandidate["prefill"] = { factors: [] };

  for (const definition of observationDefinitions) {
    const observation = newestObservation(
      model.context.observations.items,
      definition.prefixes,
    );
    if (!observation) continue;
    assertScope(observation, scope);
    collectRevision(revisions, observation);
    const numeric = numericValue(observation.value);
    const source = sourceRevision(observation);
    const status = candidateStatus(observation, numeric);
    const field: Type2PatientCoreCandidateField = {
      key: definition.key,
      label: definition.label,
      ...(numeric !== undefined ? { value: numeric } : {}),
      ...(observation.unit ? { unit: observation.unit } : {}),
      observedAt: observation.observedAt,
      status,
      freshness: observation.meta.freshness,
      required: definition.required,
      ...(source ? { source } : {}),
    };
    fields.push(field);
    if (status !== "ready" || numeric === undefined) continue;

    if (definition.key === "current_hba1c") prefill.currentHba1c = numeric;
    else if (definition.key === "egfr") prefill.eGfr = numeric;
    else if (definition.key === "creatinine_clearance") {
      prefill.creatinineClearanceMlMin = numeric;
    } else if (definition.key === "uacr") prefill.uacr = numeric;
    else if (definition.key === "potassium") prefill.potassiumMmolL = numeric;
  }

  for (const definition of contextDefinitions) {
    const context = model.context.clinicalContexts.items.find(
      (item) => item.factKey === definition.factKey,
    );
    if (!context) continue;
    assertScope(context, scope);
    collectRevision(revisions, context);
    if (context.state !== "present") continue;
    const source = sourceRevision(context);
    const status: Type2PatientCoreCandidateStatus =
      context.meta.verification !== "verified"
        ? "unverified"
        : context.meta.freshness === "stale"
          ? "stale"
          : !source
            ? "source_revision_missing"
            : "ready";
    fields.push({
      key: definition.key,
      label: definition.label,
      value: true,
      status,
      freshness: context.meta.freshness,
      required: false,
      ...(source ? { source } : {}),
    });
    if (status !== "ready") continue;
    if (definition.key === "dialysis") prefill.dialysis = true;
    if (definition.factor && !prefill.factors.includes(definition.factor)) {
      prefill.factors.push(definition.factor);
    }
  }

  const hba1c = fields.find((field) => field.key === "current_hba1c");
  const hba1cIssue = requiredIssueFor(hba1c);
  const sourceRevisions = [...revisions.values()].sort((left, right) =>
    left.factId.localeCompare(right.factId),
  );

  return {
    moduleId: TYPE2_PATIENT_CORE_MODULE_ID,
    scope,
    sourceRevisionFingerprint:
      patientModuleSourceRevisionFingerprint(sourceRevisions),
    sourceRevisions,
    fields,
    requiredIssues: hba1cIssue
      ? [{ key: "current_hba1c", reason: hba1cIssue }]
      : [],
    prefill,
  };
}

export function type2PatientCoreHandoffMatchesIntent(
  candidate: Type2PatientCoreHandoffCandidate,
  intent: {
    moduleId: string;
    scope: { practiceId: string; patientId: string };
    sourceRevisionFingerprint: string;
  },
) {
  return intent.moduleId === candidate.moduleId &&
    intent.scope.practiceId === candidate.scope.practiceId &&
    intent.scope.patientId === candidate.scope.patientId &&
    intent.sourceRevisionFingerprint === candidate.sourceRevisionFingerprint;
}
