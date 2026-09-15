// Local-only gate; never accepts an endpoint, token, database or deployment argument.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
const worker = fileURLToPath(new URL("../", import.meta.url));
const repo = resolve(worker, "../..");
const require = createRequire(import.meta.url);
const hash = value => createHash("sha256").update(value).digest("hex");
const sourceScope = ["apps/admin-worker/src", "apps/admin-worker/test", "packages/contracts/src"];
function fingerprint() {
  const paths = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) paths.push(path);
    }
  }
  for (const scope of sourceScope) visit(resolve(repo, scope));
  paths.push(resolve(repo, "pnpm-lock.yaml"), resolve(worker, "package.json"), fileURLToPath(import.meta.url));
  const entries = paths.map(path => [relative(repo, path).replaceAll("\\", "/"), hash(readFileSync(path))]).sort((a, b) => a[0].localeCompare(b[0]));
  return { fileCount: entries.length, sha256: hash(JSON.stringify(entries)) };
}
const before = fingerprint();
const pkg = require("vitest/package.json");
const vitest = resolve(dirname(require.resolve("vitest/package.json")), pkg.bin.vitest);
const tests = ["test/patient-core-read-session.test.ts", "test/patient-core-read-session-boundary.test.ts"];
const result = spawnSync(process.execPath, [vitest, "run", ...tests, "--maxWorkers=1"], {
  cwd: worker, env: { ...process.env, GLYMIZE_R29_ROLLOUT_EVIDENCE: "1", NO_COLOR: "1" },
  encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024,
});
if (result.error || result.status !== 0) {
  process.stderr.write(result.stdout || "");
  process.stderr.write(result.stderr || result.error?.message || "Local gate failed");
  process.exit(1);
}
const after = fingerprint();
assert.deepEqual(after, before, "Source changed during the gate; rerun against a stable candidate");
const marker = "R29_05_LOCAL_MATRIX ";
const cases = result.stdout.split(/\r?\n/).filter(line => line.startsWith(marker)).flatMap(line => JSON.parse(line.slice(marker.length)));
assert.equal(cases.length, 18);
for (const family of ["observations", "timeline"]) {
  const rows = cases.filter(row => row.family === family);
  assert.equal(rows.length, 9);
  assert.equal(new Set(rows.filter(row => !row.rollback).map(row => row.bits)).size, 8);
  assert.deepEqual(rows.at(-1), { ...rows[0], rollback: true });
}
const git = args => {
  const value = spawnSync("git", args, { cwd: repo, encoding: "utf8", timeout: 10000 });
  assert.equal(value.status, 0);
  return value.stdout.trim();
};
process.stdout.write(JSON.stringify({
  schemaVersion: 1, capturedAt: new Date().toISOString(), kind: "local-node-fake-d1-rollout",
  node: process.version, baseCommit: git(["rev-parse", "HEAD"]), dirtyWorktree: Boolean(git(["status", "--porcelain"])),
  fingerprint: { ...before, scope: sourceScope, includes: ["pnpm-lock.yaml", "apps/admin-worker/package.json", "this runner"] },
  tests, localChecks: "passed", bitOrder: ["D1 sessions", "CryptoKey reuse", "history scope lookup"], cases,
  remoteAcceptance: "not_run", deploymentVersion: null, workerCpuMs: null,
  d1RowsRead: null, d1RowsWritten: null, providerReplication: "unverified", remoteRequests: 0,
}, null, 2) + "\n");
