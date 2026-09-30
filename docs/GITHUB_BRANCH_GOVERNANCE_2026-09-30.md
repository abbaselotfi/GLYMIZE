# OPS-GIT-01 — GitHub branch governance and cleanup — 2026-09-30

Scope: `abbaselotfi/GLYMIZE` remote references only. No local worktree, source, migration, RC or production deployment was changed by the branch cleanup. This is repository governance evidence, not R30-04-B2 acceptance.

## Result

| Remote branch | SHA at cleanup | Protection |
| --- | --- | --- |
| `main` | `0b47d326da326a7997c8fcadd832032cefeed5de` | Active ruleset `24218935`: no deletion or non-fast-forward updates; no bypass actors. |
| `developer` | `0b47d326da326a7997c8fcadd832032cefeed5de` | Created from the exact `main` SHA after the same ruleset was active; API reports protected. |
| `feat/r30-04-b1-sqlcipher` | `92b2a75ddb12d38f0dd6c13e7c70c0fc5d498417` | Retained implementation branch; Pages Preview exclusion remains separate. |

The initial remote inventory contained 154 heads. After `developer` creation there were 155; the exact deletion candidate set was 152. Of these, 129 tips were ancestors of retained `main` or feature history. The other 23 were tagged at their exact tip SHAs under `archive/branch-cleanup-20260930/<original-branch-name>`. All 23 remote tags were verified before an atomic deletion of the 152 candidate heads. A final remote listing contained exactly the three branches above; both protected branch objects and the active deletion/non-fast-forward rules were rechecked. There were no open pull requests. The existing unrelated ruleset `Diabet` was not edited.

Creating `developer` triggered a **successful Cloudflare Pages Preview**, deployment `1de979e2-708f-4d4a-8170-bea373251657` at `0b47d326da326a7997c8fcadd832032cefeed5de`. This is separate from the `main` production deployment. The feature-branch governance documentation SHA `dc68418210264d54291d4e918afc291cd683238f` produced Pages event `0df1ee85-e8ae-4e2a-bad8-b39a7b551d84` with status `skipped` / `Not started`; its build and deploy stages were idle. No production deployment was performed by this cleanup.

For recovery, find the original branch's tag under that archive prefix and inspect its commit before intentionally recreating a branch. Recreating any archived branch would violate the owner's three-branch target until another branch is removed. These tags preserve committed remote tips only; they do not include uncommitted files in any local worktree. Local worktrees and their checked-out branches were neither reset nor pruned.

GitHub reported the repository as **public** before the new protection ruleset was created. The owner later confirmed this visibility is intentional until a future decision; OPS-GIT-01 did not change it. A GitHub administrator can still edit or remove rulesets, so "never delete" is enforced by the current active configuration rather than a physically irreversible guarantee.

## Staged integration policy

The owner confirmed that public visibility is intentional until a later decision. Branch protection does not hide a branch: all tracked content and history on `developer` and the active feature branch remain public. Secrets, credentials, patient data and developer-only confidential files are prohibited from every branch; restricted material belongs in a separate access-controlled private system.

The persistent flow is:

```text
feat/<task> or feature/<task>
  -> pull request to developer
  -> integration validation and review
  -> pull request from developer to main
  -> stable main
```

Ruleset `24218935` was strengthened without bypass actors to require pull requests for updates to `main` and `developer`, in addition to its deletion and non-fast-forward protections. The approval count remains zero because this is currently a single-owner repository; unresolved review conversations must still be resolved. Repository validation additionally checks that PRs to `developer` originate from `feat/*` or `feature/*`, and PRs to `main` originate from `developer`. This workflow check becomes active on each target after the workflow file reaches that target through the staged flow; the ruleset-level PR requirement is active immediately.

OPS-GIT-01 local validation passed `git diff --check`, explicit staged-path review and Gitleaks 8.30.1 with zero findings. Live GitHub GET reverified the active no-bypass ruleset, both protected branch objects, public visibility and the exact three-branch inventory. No local YAML parser or formatter is installed in this worktree, so workflow syntax is not represented as tool-validated locally; GitHub recognition/check results after publication remain the authoritative workflow gate.

Implementation/evidence commit `f302c527586ca9d7269cdd3853dc42ca2dca49ce` was pushed to the retained feature branch with exact local/remote equality. GitHub's Contents API recognized `.github/workflows/validate-pull-request.yml` at that commit; the workflow is PR-only, so no Push run was expected or reported. Cloudflare Pages recorded Preview event `a23c85c0-2689-4e2d-88a2-a77d9c1cfccf` for exact source `f302c52` with status `Idle`; no build or deployment execution is claimed. The documentation-closure commit and its provider record are verified in the delivery response rather than written self-referentially here.
