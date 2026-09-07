export type Type2ClinicalInputRequestSupportV2 =
  | "request_field"
  | "request_composite"
  | "runtime_derived"
  | "not_represented";

export interface Type2ClinicalInputDefinitionV2 {
  requestSupport: Type2ClinicalInputRequestSupportV2;
  requestPath?: string;
  description: string;
}
