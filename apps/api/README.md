# `@glymize/api`

## Current status: local-development-only compatibility service

This NestJS/Fastify application is not a deployed production runtime in the current GLYMIZE topology. It can be started on loopback by the root `dev:app` workflow for local compatibility work, but no repository deployment workflow publishes it and the GitHub Pages build does not set `NEXT_PUBLIC_API_URL`.

Current production authorities are documented in [`docs/architecture/RUNTIME_OF_RECORD.md`](../../docs/architecture/RUNTIME_OF_RECORD.md):

- catalogue reads are composed in the deployed web application from repository-shipped assets;
- central catalogue publication goes through the authenticated Cloudflare Worker and commits the validated JSON snapshot to GitHub;
- Type 2 evaluation runs from `@glymize/clinical-engine` in the deployed web bundle;
- patient and encounter data is owned by the Cloudflare Worker Patient Record v2 routes and D1.

The controllers in this directory expose in-memory catalogue, guideline, evidence-assistant, and legacy handoff behavior. They are useful for development and compatibility checks, but their process memory is not durable and they must not be treated as a production source of truth. Some seed modules under `apps/api/src` are still imported by the web build; this is source reuse only, not evidence that the NestJS server is serving production requests.

Do not route production traffic or real patient data to this service without a separate reviewed architecture decision covering persistence, authorization, deployment, migration, and operational ownership.

## Local execution

From the repository root:

```text
pnpm --filter @glymize/api dev
```

The default listener is `127.0.0.1:3001`. `HOST=0.0.0.0` is reserved for an explicitly configured container environment. `WEB_ORIGIN` controls allowed browser origins; its local default is `http://localhost:3000`.

