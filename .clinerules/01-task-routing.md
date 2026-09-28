# GLYMIZE — Cline task routing and agent handoff

These are Cline-specific operating instructions, not a second Roadmap or clinical authority.

Follow root `AGENTS.md`, canonical `docs/ROADMAP.md` section 0, `docs/GLYMIZE_CODEBASE_MEMORY_ROADMAP.md`, and applicable clinical/domain roadmaps before implementation.

## Select a mode and model

- Identify the current bounded Roadmap packet, dependencies, acceptance gates and prior implementation.
- Propose Plan for unknown root cause, architecture, encrypted storage, patient identity, RBAC, clinical rules, migrations, synchronization or uncertain multi-module blast radius.
- Propose Act for bounded implementation whose required plan and gates are established. Act must still run mandatory pre-task checks.
- State MODEL CHECKPOINT in Persian using the format in `docs/ROADMAP.md` section 0.
- Recommend a model available through the owner's configured providers and report unknown quota or reasoning effort honestly.
- A recommendation does not automatically change the VS Code Plan/Act toggle or provider selector.
- Never assign security- or clinical-authority-critical implementation to a weaker model solely because it is free.
- Respect the owner model-switch checkpoint and `ادامه تسک`.

## One writer; portable handoff

- Only one coding agent may edit the same worktree at a time.
- Do not restore a Cline checkpoint over another agent's changes.
- Before taking over, inspect `docs/ACTIVE_TASK_HANDOFF.md`, current branch, `git status --short`, staged and unstaged diffs, relevant source and actual test evidence.
- Treat previous agent claims as unverified until supported by files, Git or tests.
- Never discard, reset or overwrite incomplete changes.
- At meaningful checkpoints, record a concise sanitized handoff: task ID, branch, verified completed work, changed files, decisions, actual tests, remaining risks and exact next action.
- If a previous agent exhausted its quota, reconstruct unfinished work from Git and source without requiring a final response from that agent.
- Follow the existing model checkpoint, engineering gates and deployment restrictions.
- For shared tooling changes, keep this file aligned with root `AGENTS.md`, the active handoff and the canonical Roadmap; do not create a Cline-only dependency or status claim.
- Do not commit secrets or patient-level data.
- Do not deploy, migrate, merge or force-push merely because coding agents have switched.
