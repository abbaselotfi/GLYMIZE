import type { PatientCoreFactMeta } from "./provenance.js";

/** Shared identity/provenance envelope for cross-domain patient facts. */
export interface PatientCoreFactBase {
  factId: string;
  factKey: string;
  displayName: string;
  meta: PatientCoreFactMeta;
}
