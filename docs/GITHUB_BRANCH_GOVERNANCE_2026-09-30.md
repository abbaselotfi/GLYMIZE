# GitHub branch governance and cleanup — 2026-09-30

Scope: `abbaselotfi/GLYMIZE` remote references only. No local worktree, source, migration, RC or production deployment was changed by the branch cleanup. This is repository governance evidence, not R30-04-B2 acceptance.

## Result

| Remote branch | SHA at cleanup | Protection |
| --- | --- | --- |
| `main` | `0b47d326da326a7997c8fcadd832032cefeed5de` | Active ruleset `24218935`: no deletion or non-fast-forward updates; no bypass actors. |
| `developer` | `0b47d326da326a7997c8fcadd832032cefeed5de` | Created from the exact `main` SHA after the same ruleset was active; API reports protected. |
| `feat/r30-04-b1-sqlcipher` | `92b2a75ddb12d38f0dd6c13e7c70c0fc5d498417` | Retained implementation branch; Pages Preview exclusion remains separate. |

The initial remote inventory contained 154 heads. After `developer` creation there were 155; the exact deletion candidate set was 152. Of these, 129 tips were ancestors of retained `main` or feature history. The other 23 were tagged at their exact tip SHAs under `archive/branch-cleanup-20260930/<original-branch-name>`. All 23 remote tags were verified before an atomic deletion of the 152 candidate heads. A final remote listing contained exactly the three branches above; both protected branch objects and the active deletion/non-fast-forward rules were rechecked. There were no open pull requests. The existing unrelated ruleset `Diabet` was not edited.

For recovery, find the original branch's tag under that archive prefix and inspect its commit before intentionally recreating a branch. Recreating any archived branch would violate the owner's three-branch target until another branch is removed. These tags preserve committed remote tips only; they do not include uncommitted files in any local worktree. Local worktrees and their checked-out branches were neither reset nor pruned.

GitHub reported the repository as **public** before the new protection ruleset was created. The cleanup did not change visibility. If public visibility was unintentional, the owner must decide how to regain private-repository branch-protection capability before switching visibility; doing so without a compatible plan could disable these protections. A GitHub administrator can still edit or remove rulesets, so "never delete" is enforced by the current active configuration rather than a physically irreversible guarantee.
