---
name: GLYMIZE shared engineering contract
alwaysApply: true
---

# Continue — GLYMIZE shared workflow

Continue is an optional coding extension, not a coordinator and not a separate source of project truth.

Before any GLYMIZE change, read root `AGENTS.md`, canonical `docs/ROADMAP.md` section 0, `docs/ACTIVE_TASK_HANDOFF.md` for continued work, `docs/GLYMIZE_CODEBASE_MEMORY_ROADMAP.md`, and relevant clinical/domain roadmaps.

Follow the owner model checkpoint, engineering gates and existing deployment restrictions.

Recommend a read-only planning workflow when root cause, architecture, encryption, identity, RBAC, clinical authority, migration, synchronization or blast radius is uncertain.

Recommend an editing workflow only for bounded implementation after mandatory pre-task gates.

Do not claim to switch the VS Code mode or model selector automatically.

Use only available owner-configured models and providers.

Only one coding agent may edit a shared worktree at a time.

Before taking over from Codex, Claude Code, Cline or another extension, inspect the branch, handoff, `git status`, staged and unstaged diffs and actual test evidence.

Never reset or discard prior uncommitted changes.

At a meaningful checkpoint, record a concise sanitized handoff with task ID, verified completed work, changed paths, test results, remaining risks and next action.

If the previous agent exhausted its quota, reconstruct the state from Git and source.

For shared tooling changes, update this mirror together with root `AGENTS.md` and the active handoff; do not create a Continue-only workflow or status source.

Never commit secrets or patient data.

Never deploy, migrate, force-push or merge merely because agents have switched.

The shared root contract and Roadmap override conflicting extension-specific instructions.
