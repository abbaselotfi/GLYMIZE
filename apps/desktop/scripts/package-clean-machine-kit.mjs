import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "../..");
const ACCEPTANCE_SCRIPT_NAME = "windows-clean-machine-acceptance.ps1";
const KIT_MANIFEST_NAME = "kit-manifest.json";

function assertLeafFileName(value, label) {
  assert.equal(typeof value, "string", `${label}_NAME_REQUIRED`);
  assert.equal(path.basename(value), value, `${label}_NAME_NOT_LEAF`);
  assert(!value.includes("/"), `${label}_NAME_UNSAFE`);
  assert(!value.includes("\\"), `${label}_NAME_UNSAFE`);
}

async function digestFile(filePath) {
  const bytes = await readFile(filePath);
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
  };
}

function assertDesktopManifest(manifest) {
  assert.equal(manifest?.schemaVersion, 1, "CLEAN_MACHINE_REFERENCE_SCHEMA_REJECTED");
  assert.equal(manifest?.profile, "desktop-reference", "CLEAN_MACHINE_REFERENCE_PROFILE_REJECTED");
  assert.equal(manifest?.sourceDirty, false, "CLEAN_MACHINE_DIRTY_SOURCE_REJECTED");
  assert.match(manifest?.sourceRevision ?? "", /^[0-9a-f]{40}$/i, "CLEAN_MACHINE_SOURCE_REVISION_REJECTED");
  assert.match(manifest?.version ?? "", /^[0-9a-f]{24}$/i, "CLEAN_MACHINE_REFERENCE_VERSION_REJECTED");
}

export async function createCleanMachineKit({
  installerPath,
  acceptanceScriptPath,
  desktopManifestPath,
  outputRoot,
}) {
  const resolvedInstaller = path.resolve(installerPath);
  const resolvedScript = path.resolve(acceptanceScriptPath);
  const resolvedDesktopManifest = path.resolve(desktopManifestPath);
  const resolvedOutput = path.resolve(outputRoot);
  assert.notEqual(resolvedOutput, path.parse(resolvedOutput).root, "CLEAN_MACHINE_OUTPUT_ROOT_REJECTED");
  assert.notEqual(resolvedOutput, REPO_ROOT, "CLEAN_MACHINE_REPOSITORY_OUTPUT_REJECTED");
  const allowedOutputRoots = [path.join(REPO_ROOT, ".tmp"), os.tmpdir()].map((value) => `${path.resolve(value)}${path.sep}`);
  assert(allowedOutputRoots.some((value) => `${resolvedOutput}${path.sep}`.startsWith(value)), "CLEAN_MACHINE_OUTPUT_SCOPE_REJECTED");

  const desktopManifest = JSON.parse(await readFile(resolvedDesktopManifest, "utf8"));
  assertDesktopManifest(desktopManifest);
  const installer = await digestFile(resolvedInstaller);
  const acceptanceScript = await digestFile(resolvedScript);
  assert(installer.bytes > 0, "CLEAN_MACHINE_INSTALLER_EMPTY");
  assert(acceptanceScript.bytes > 0, "CLEAN_MACHINE_ACCEPTANCE_SCRIPT_EMPTY");

  const installerFileName = path.basename(resolvedInstaller);
  assertLeafFileName(installerFileName, "INSTALLER");
  assertLeafFileName(ACCEPTANCE_SCRIPT_NAME, "SCRIPT");

  const stagingRoot = `${resolvedOutput}.staging-${process.pid}-${Date.now()}`;
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  await copyFile(resolvedInstaller, path.join(stagingRoot, installerFileName));
  await copyFile(resolvedScript, path.join(stagingRoot, ACCEPTANCE_SCRIPT_NAME));

  const manifest = {
    schemaVersion: 1,
    packet: "R30-03-C2",
    profile: "windows-clean-machine-acceptance",
    sourceRevision: desktopManifest.sourceRevision,
    sourceDate: desktopManifest.sourceDate,
    sourceDirty: false,
    referenceManifestVersion: desktopManifest.version,
    installer: { fileName: installerFileName, ...installer },
    acceptanceScript: { fileName: ACCEPTANCE_SCRIPT_NAME, ...acceptanceScript },
    requiredPhases: ["Preflight", "Install", "PostReboot", "UninstallReinstall", "Finalize"],
    acceptanceConstraints: {
      target: "Windows 11 x64 disposable VM",
      initialWebView2: "absent",
      toolchains: "Git, Node, pnpm, Rust, Cargo, MSVC and MSBuild absent",
      network: "DNS, GitHub and Cloudflare blocked before install through finalization",
      privilege: "non-elevated current-user install",
      authority: "reference-only; no PHI, auth, IPC, migration or deployment",
    },
  };
  await writeFile(path.join(stagingRoot, KIT_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const stagedInstaller = await digestFile(path.join(stagingRoot, installerFileName));
  const stagedScript = await digestFile(path.join(stagingRoot, ACCEPTANCE_SCRIPT_NAME));
  assert.deepEqual(stagedInstaller, installer, "CLEAN_MACHINE_INSTALLER_COPY_MISMATCH");
  assert.deepEqual(stagedScript, acceptanceScript, "CLEAN_MACHINE_SCRIPT_COPY_MISMATCH");
  await rm(resolvedOutput, { recursive: true, force: true });
  await rename(stagingRoot, resolvedOutput);
  return { outputRoot: resolvedOutput, manifest };
}

async function main() {
  const installerPath = process.env.GLYMIZE_NSIS_INSTALLER
    ? path.resolve(process.env.GLYMIZE_NSIS_INSTALLER)
    : path.join(DESKTOP_ROOT, "src-tauri", "target", "release", "bundle", "nsis", "GLYMIZE Reference_0.1.0_x64-setup.exe");
  const outputRoot = process.env.GLYMIZE_CLEAN_MACHINE_KIT_OUT
    ? path.resolve(process.env.GLYMIZE_CLEAN_MACHINE_KIT_OUT)
    : path.join(REPO_ROOT, ".tmp", "r30-03-c2-clean-machine-kit");
  const result = await createCleanMachineKit({
    installerPath,
    acceptanceScriptPath: path.join(SCRIPT_DIR, ACCEPTANCE_SCRIPT_NAME),
    desktopManifestPath: path.join(DESKTOP_ROOT, "dist", "desktop-reference-manifest.json"),
    outputRoot,
  });
  const kitManifest = await stat(path.join(result.outputRoot, KIT_MANIFEST_NAME));
  const kitManifestDigest = await digestFile(path.join(result.outputRoot, KIT_MANIFEST_NAME));
  console.log(JSON.stringify({
    outputRoot: result.outputRoot,
    sourceRevision: result.manifest.sourceRevision,
    referenceManifestVersion: result.manifest.referenceManifestVersion,
    installer: result.manifest.installer,
    kitManifestBytes: kitManifest.size,
    kitManifestSha256: kitManifestDigest.sha256,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
