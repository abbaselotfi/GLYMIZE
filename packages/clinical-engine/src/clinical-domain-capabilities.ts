import type { MedicationClinicalDomain } from "@glymize/contracts";
import { coreClinicalDomainCapabilities } from "./clinical-domain-capabilities/core-capabilities.js";
import { metabolicClinicalDomainCapabilities } from "./clinical-domain-capabilities/metabolic-capabilities.js";
import { specialistClinicalDomainCapabilities } from "./clinical-domain-capabilities/specialist-capabilities.js";
import type { ClinicalDomainCapability } from "./clinical-domain-capabilities/types.js";

export type {
  ClinicalDomainCapability,
  ClinicalDomainExecutionState,
} from "./clinical-domain-capabilities/types.js";

/** Runtime-facing capability boundary assembled from domain-focused modules. */
export const clinicalDomainCapabilities: readonly ClinicalDomainCapability[] = [
  ...coreClinicalDomainCapabilities,
  ...metabolicClinicalDomainCapabilities,
  ...specialistClinicalDomainCapabilities,
];

export function clinicalDomainCapability(domain: MedicationClinicalDomain) {
  return clinicalDomainCapabilities.find((item) => item.domain === domain)!;
}
