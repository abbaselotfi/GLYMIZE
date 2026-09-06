# GLYMIZE agent instructions

All coding agents working in this repository must follow the normative engineering gate in:

`docs/GLYMIZE_CODEBASE_MEMORY_ROADMAP.md`

Before every implementation task:

- check Codebase Memory index status;
- refresh the graph if stale;
- use the graph to identify relevant symbols, dependencies and blast radius;
- directly inspect safety-critical source paths before editing.

After every task:

- refresh the graph when graph-relevant code changed;
- re-check impact/blast radius;
- update the Codebase Memory ADR when architecture or authority boundaries changed;
- do not declare the task complete until applicable post-task graph checks are done.

The graph is advisory. Source code, deterministic tests, CI, authorization/security rules, clinical authority, migration safety and RC/production gates remain authoritative.
