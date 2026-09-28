# Claude Code — GLYMIZE

@AGENTS.md

The repository's `AGENTS.md` and its linked roadmaps are the authoritative engineering instructions. Do not create a separate Claude-only roadmap or model-selection policy.

At a new task or after taking over work from Codex, Cline or another coding agent, identify the exact worktree, branch and handoff state before changing files.

Follow the owner model checkpoint in `docs/ROADMAP.md` section 0. Recommend the model and reasoning effort available in the current Claude Code selector rather than claiming you changed them.

If a quota, network or provider failure interrupts execution, preserve existing edits.

At the next successful opportunity, record a concise, sanitized handoff in `docs/ACTIVE_TASK_HANDOFF.md`.

If unable to respond, the next agent must reconstruct the state from Git and the repository without assuming an unrecorded action succeeded.

Keep shared tooling status synchronized with root `AGENTS.md`, the canonical Roadmap and the active handoff; this file is only a Claude-specific entry point.

Never commit API keys, tokens, credentials, patient identifiers or raw PHI.

No implicit deployment, migration, branch merge or reset of another agent's changes.
