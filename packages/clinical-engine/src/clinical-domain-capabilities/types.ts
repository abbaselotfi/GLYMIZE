import type { MedicationClinicalDomain } from "@glymize/contracts";
import type { Type2CapabilityInputContractV2 } from "../type2-input-contract-v2.js";

/**
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
  /** Human-readable clinical summary. Never parse this text into execution or UI requirements. */
  minimumSafeInputs: string[];
  /** Machine-readable drift/coverage references. This metadata does not execute clinical rules. */
  inputContract: Type2CapabilityInputContractV2;
  evidenceAuthorities: string[];
  boundary: string;
  nextGap?: string;
}
