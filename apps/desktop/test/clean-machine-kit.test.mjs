import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCleanMachineKit } from "../scripts/package-clean-machine-kit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACCEPTANCE_SCRIPT = path.join(ROOT, "scripts", "windows-clean-machine-acceptance.ps1");
const sha256 = (value) => createHash("sha256").update(value).digest("hex").toUpperCase();

async function fixture(sourceDirty = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "glymize-c2-kit-"));
  const installerPath = path.join(root, "candidate.exe");
  const desktopManifestPath = path.join(root, "desktop-reference-manifest.json");
  const outputRoot = path.join(root, "kit");
  const installer = Buffer.from("bounded-test-installer");
  await writeFile(installerPath, installer);
  await writeFile(desktopManifestPath, JSON.stringify({
    schemaVersion: 1,
    profile: "desktop-reference",
    version: "a".repeat(24),
    sourceRevision: "b".repeat(40),
    sourceDate: "2026-08-12T00:00:00Z",
    sourceDirty,
  }));
  return { root, installerPath, desktopManifestPath, outputRoot, installer };
}

test("stages a hash-bound standalone clean-machine kit", async () => {
  const value = await fixture();
  try {
    const result = await createCleanMachineKit({
      ...value,
      acceptanceScriptPath: ACCEPTANCE_SCRIPT,
    });
    const manifest = JSON.parse(await readFile(path.join(value.outputRoot, "kit-manifest.json"), "utf8"));
    const copiedInstaller = await readFile(path.join(value.outputRoot, manifest.installer.fileName));
    const copiedScript = await readFile(path.join(value.outputRoot, manifest.acceptanceScript.fileName));
    assert.equal(result.outputRoot, value.outputRoot);
    assert.equal(manifest.packet, "R30-03-C2");
    assert.equal(manifest.sourceDirty, false);
    assert.equal(manifest.installer.sha256, sha256(value.installer));
    assert.equal(manifest.acceptanceScript.sha256, sha256(copiedScript));
    assert.deepEqual(copiedInstaller, value.installer);
    assert.deepEqual(manifest.requiredPhases, ["Preflight", "Install", "PostReboot", "UninstallReinstall", "Finalize"]);
    const firstManifestBytes = await readFile(path.join(value.outputRoot, "kit-manifest.json"));
    await createCleanMachineKit({ ...value, acceptanceScriptPath: ACCEPTANCE_SCRIPT });
    const secondManifestBytes = await readFile(path.join(value.outputRoot, "kit-manifest.json"));
    assert.deepEqual(secondManifestBytes, firstManifestBytes);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rejects a desktop artifact built from dirty source", async () => {
  const value = await fixture(true);
  try {
    await assert.rejects(createCleanMachineKit({ ...value, acceptanceScriptPath: ACCEPTANCE_SCRIPT }), /CLEAN_MACHINE_DIRTY_SOURCE_REJECTED/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("acceptance script keeps the full fail-closed phase and WebView2 contract", async () => {
  const script = await readFile(ACCEPTANCE_SCRIPT, "utf8");
  for (const token of [
    "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "Preflight", "Install", "PostReboot", "UninstallReinstall", "Finalize",
    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "api.cloudflare.com", "github.com",
    "ExpectedKitManifestSha256", "CLEAN_MACHINE_ACCEPTANCE_INCOMPLETE", "installed-native-reference",
  ]) assert(script.includes(token), `missing acceptance token: ${token}`);
  assert(!/Invoke-WebRequest\s+https?:/i.test(script));
});

test("PowerShell can audit an unqualified host without claiming acceptance", { skip: process.platform !== "win32" }, async () => {
  const value = await fixture();
  try {
    await createCleanMachineKit({ ...value, acceptanceScriptPath: ACCEPTANCE_SCRIPT });
    const powershell = process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
    const run = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(value.outputRoot, "windows-clean-machine-acceptance.ps1"), "-Phase", "AuditHost",
      "-KitRoot", value.outputRoot, "-EvidenceRoot", path.join(value.root, "evidence")], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const summary = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(summary.phase, "AuditHost");
    assert.equal(summary.accepted, false);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
