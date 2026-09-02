export const providerDirectoryStatuses = [
  "hidden",
  "published",
  "suspended",
] as const;
export type ProviderDirectoryStatus = (typeof providerDirectoryStatuses)[number];

export const providerVisitModes = [
  "in_person",
  "audio",
  "video",
  "asynchronous",
] as const;
export type ProviderVisitMode = (typeof providerVisitModes)[number];

export interface ProviderDirectoryCapabilities {
  providerDirectory: boolean;
}

/** Patient-safe projection. No contact, permission, or clinical fields are exposed. */
export interface PublicProviderProfile {
  id: string;
  displayName: string;
  specialtyCode?: string;
  specialtyName: string;
  subspecialtyName?: string;
  practiceDisplayName: string;
  publicLocation?: string;
  visitModes: ProviderVisitMode[];
  languages: string[];
  medicalCouncilCode?: string;
  publishedAt: string;
}

export interface ProviderDirectorySearchResult {
  providers: PublicProviderProfile[];
}

export interface ProviderProfileDraftInput {
  displayName: string;
  specialtyCode?: string;
  specialtyName: string;
  subspecialtyName?: string;
  practiceDisplayName: string;
  publicLocation?: string;
  visitModes: ProviderVisitMode[];
  languages: string[];
  showMedicalCouncilCode: boolean;
}

export interface ManagedProviderProfile extends ProviderProfileDraftInput {
  id: string;
  practiceId: string;
  physicianUserId: string;
  directoryStatus: ProviderDirectoryStatus;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}
