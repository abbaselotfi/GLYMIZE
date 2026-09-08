import type { RegimenCandidateV2, SelectionConstraintKindV2, SelectionConstraintV2 } from "./types.js";

export function resolvedSelectionConstraintV2(candidate: RegimenCandidateV2): SelectionConstraintV2 {
  return candidate.selectionConstraint ?? { status: "pass", kinds: [], reasons: [] };
}

export function candidateSelectionEligibleV2(candidate: RegimenCandidateV2) {
  return resolvedSelectionConstraintV2(candidate).status === "pass";
}

export function blockCandidateSelectionV2(
  candidate: RegimenCandidateV2,
  kind: SelectionConstraintKindV2,
  reason: string,
) {
  const current = resolvedSelectionConstraintV2(candidate);
  candidate.selectionConstraint = {
    status: "blocked",
    kinds: [...new Set([...current.kinds, kind])],
    reasons: [...new Set([...current.reasons, reason])],
  };
}
