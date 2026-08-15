export type PatientCodeKind = "file_number" | "national_id" | "other";
export type PatientHandoffStatus = "draft" | "ready_for_physician" | "reviewed";
export type VerificationState = "unverified" | "confirmed" | "rejected";
export type LabInterpretation = "N" | "H" | "L" | "HH" | "LL" | "A";
export type LabObservationSource = "manual" | "ocr" | "pdf_text" | "import";
export type PatientReportedSex = "male" | "female";

export interface PatientHandoffMedication {
  genericMedicationId?: string;
  genericName: string;
  doseAmount?: number;
  doseUnit?: string;
  frequencyPerDay?: number;
  frequencyCode?: string;
  status?: "active" | "held" | "stopped";
  verification: VerificationState;
}

export interface PatientHandoffLab {
  id: string;
  canonicalKey?: string;
  canonicalName?: string;
  rawName: string;
  value?: number;
  valueText?: string;
  unit?: string;
  specimen?: string;
  referenceRange?: string;
  referenceLow?: number;
  referenceHigh?: number;
  observedAt?: string;
  sourceKind?: LabObservationSource;
  interpretation?: LabInterpretation;
  interpretationSource?: "ocr" | "manual";
  ocrConfidence?: number;
  parserConfidence?: number;
  verification: VerificationState;
  sourceDocumentName?: string;
  sourcePage?: number;
}

export interface PatientHandoffVitals {
  weightKg?: number;
  heightCm?: number;
  systolicBp?: number;
  diastolicBp?: number;
  pulseBpm?: number;
}

export interface PatientHandoffDemographics {
  /**
   * Encounter-reported age from a source such as a laboratory report.
   * Patient Record v2 should prefer a verified date of birth when available.
   */
  reportedAgeYears?: number;
  /**
   * Sex explicitly reported on an encounter/source document.
   * This is not a substitute for a verified longitudinal demographic field.
   */
  reportedSex?: PatientReportedSex;
}

export type PatientHandoffStructuredField =
  | "firstName"
  | "lastName"
  | "nationalId"
  | "reportedAgeYears"
  | "reportedSex"
  | "weightKg"
  | "heightCm";

export interface PatientHandoffFieldProvenance {
  sourceKind: "manual" | "ocr" | "pdf_text" | "import";
  sourceDocumentName?: string;
  sourcePage?: number;
  ocrConfidence?: number;
  parserConfidence?: number;
  verification: VerificationState;
}

export type PatientHandoffFieldProvenanceMap = Partial<
  Record<PatientHandoffStructuredField, PatientHandoffFieldProvenance>
>;

export interface PatientHandoffClinicalFlags {
  ascvd?: boolean;
  heartFailure?: boolean;
  ckd?: boolean;
  dialysis?: boolean;
  diabeticFoot?: boolean;
  masldMash?: boolean;
  hypoglycemiaRisk?: boolean;
}

export interface PatientHandoffRecord {
  id: string;
  patientCodeKind: PatientCodeKind;
  patientCodeDisplay: string;
  firstName?: string;
  lastName?: string;
  status: PatientHandoffStatus;
  createdAt: string;
  updatedAt: string;
  revision: number;
  demographics?: PatientHandoffDemographics;
  patientFieldProvenance?: PatientHandoffFieldProvenanceMap;
  vitals: PatientHandoffVitals;
  clinicalFlags: PatientHandoffClinicalFlags;
  labs: PatientHandoffLab[];
  medications: PatientHandoffMedication[];
  nurseNotes?: string;
  ocrText?: string;
}

export interface PatientHandoffArchiveItem {
  id: string;
  patientCodeKind: PatientCodeKind;
  patientCodeDisplay: string;
  status: PatientHandoffStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatientHandoffArchivePage {
  items: PatientHandoffArchiveItem[];
  nextCursor: string | null;
}

export interface PatientHandoffUpsertInput {
  patientCode: string;
  patientCodeKind: PatientCodeKind;
  firstName?: string;
  lastName?: string;
  status?: PatientHandoffStatus;
  demographics?: PatientHandoffDemographics;
  patientFieldProvenance?: PatientHandoffFieldProvenanceMap;
  vitals?: PatientHandoffVitals;
  clinicalFlags?: PatientHandoffClinicalFlags;
  labs?: PatientHandoffLab[];
  medications?: PatientHandoffMedication[];
  nurseNotes?: string;
  ocrText?: string;
}

export interface PatientHandoffLookupInput {
  patientCode: string;
}

export interface PatientHandoffLookupResult {
  found: boolean;
  record?: PatientHandoffRecord;
}
