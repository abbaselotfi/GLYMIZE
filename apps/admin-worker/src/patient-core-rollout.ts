/**
 * Operational rollout boundary for R28-06 Allergy/Problem authority.
 *
 * Only the explicit string "true" enables the new authority. Missing,
 * malformed, boolean, or alternate truthy-looking values fail closed.
 */
export function patientCoreAllergyProblemAuthorityEnabledFromEnv(
  value: unknown,
) {
  return typeof value === "string" &&
    value.trim().toLowerCase() === "true";
}
