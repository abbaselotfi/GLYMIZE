/**
 * Compatibility facade retained for existing imports/tests.
 *
 * WEGOVY initiation/continuation phase cost and insurance authority now live in
 * the single base enrichment pass so `insured_only` can fail closed before the
 * candidate leaves enrichment. Keeping a second post-enrichment authority here
 * would risk reversing an already-applied insurance safety gate.
 */
export { enrichCandidateWithDoseMarketCostV2 } from "./enrich.js";
