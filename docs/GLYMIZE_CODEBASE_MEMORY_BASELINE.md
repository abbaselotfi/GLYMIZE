# GLYMIZE — Codebase Memory Shared Baseline

Status: PENDING canonical artifact synchronization
Prepared: 2026-09-07
Codebase Memory version: `0.10.8`

## Purpose

This file records the source commit used to generate the shared `.codebase-memory/` artifact committed to the private GLYMIZE repository. It prevents a local-only or unknown-worktree graph from being mistaken for the canonical project baseline.

## Baseline being prepared

Canonicalization branch:

`chore/graph-gate-hardening-20260907`

Expected source commit immediately before the graph artifact is generated:

`0a6e173b3916b17423677de56254bb59a28d659e`

The artifact generated from this commit must include the current Graph Gate hardening and repo-level `.cbmignore`. `.codebase-memory/` itself is excluded from graph indexing by Codebase Memory.

## Verification required before marking ACTIVE

The baseline may be changed from `PENDING` to `ACTIVE` only after all of the following are verified from the canonical local working tree:

- `git status` is clean before graph generation except for expected `.codebase-memory/` output;
- local `HEAD` equals `0a6e173b3916b17423677de56254bb59a28d659e`;
- `git fetch origin` confirms the intended base/branch state;
- `codebase-memory-mcp --version` reports the recorded compatible version;
- a full canonical `index_repository` completes successfully;
- `index_status` reports a usable graph;
- the large clinician-market JSON is excluded via `.cbmignore` rather than timing out;
- SQL parser partials, if any, are recorded as best-effort limitations rather than treated as complete schema authority;
- `.codebase-memory/graph.db.zst`, `.codebase-memory/artifact.json`, and `.codebase-memory/.gitattributes` exist;
- those three files are committed to this branch and pass repository CI before merge.

## Historical pre-canonical scan

A local scan on 2026-09-06 reported `5097` nodes and `19109` edges. Because the source `HEAD` was not proven against canonical `main` before that scan, those counts are historical diagnostic evidence only and are **not** the shared canonical baseline.

## Update cadence

Future artifact snapshots should be committed deliberately at milestone/release boundaries, after major architecture changes, or when a materially newer shared bootstrap is needed. Every shared snapshot should identify the source commit it indexes.
