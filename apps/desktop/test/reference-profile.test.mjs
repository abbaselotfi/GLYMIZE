import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertSafeRelativePath, assertUniqueCaseInsensitive, createDesktopManifest, validateDesktopStage, walkRegularFiles } from "../scripts/reference-profile.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "glymize-desktop-profile-"));
  const reference = { schemaVersion: 1, profile: "reference-lite", sourceHash: "a".repeat(64), sourceDate: "2026-08-12T00:00:00Z", rows: [{ id: "one" }] };
  for (const [name, body] of [["offline/index.html", "<script src=\"/_next/static/app.js\"></script>"],
    ["_next/static/app.js", "console.log('reference')"], ["data/offline-reference.json", JSON.stringify(reference)]]) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), body);
  }
  const metadata = { sourceRevision: "b".repeat(40), sourceDirty: false, sourceHash: reference.sourceHash, sourceDate: reference.sourceDate };
  const manifest = await createDesktopManifest(root, metadata);
  await writeFile(path.join(root, "desktop-reference-manifest.json"), JSON.stringify(manifest));
  return { root, manifest };
}

test("accepts the exact deterministic desktop reference set", async (t) => {
  const { root, manifest } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await validateDesktopStage(root, manifest), true);
  assert.equal((await createDesktopManifest(root, { sourceRevision: manifest.sourceRevision, sourceDirty: false,
    sourceHash: manifest.sourceHash, sourceDate: manifest.sourceDate })).version, manifest.version);
});

test("rejects unsafe paths and Windows case collisions", () => {
  for (const value of ["../secret", "/offline/index.html", "admin/index.html", "_worker.js", "data/private.json"])
    assert.throws(() => assertSafeRelativePath(value), /PATH_REJECTED/);
  assert.throws(() => assertUniqueCaseInsensitive(["_next/static/A.js", "_next/static/a.js"]), /CASE_COLLISION/);
});

test("rejects extra, missing and modified staged files", async (t) => {
  const { root, manifest } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "secret.ico"), "secret");
  await assert.rejects(validateDesktopStage(root, manifest), /FILE_SET_MISMATCH/);
  await rm(path.join(root, "secret.ico"));
  await writeFile(path.join(root, "_next/static/app.js"), "changed");
  await assert.rejects(validateDesktopStage(root, manifest), /HASH_MISMATCH/);
  await rm(path.join(root, "offline", "index.html"));
  await assert.rejects(validateDesktopStage(root, manifest), /FILE_SET_MISMATCH/);
});

test("rejects symlinks before reading their targets", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "glymize-desktop-symlink-"));
  const outside = await mkdtemp(path.join(tmpdir(), "glymize-desktop-outside-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await writeFile(path.join(outside, "secret.txt"), "secret");
  await symlink(outside, path.join(root, "linked"), "junction");
  await assert.rejects(walkRegularFiles(root), /SYMLINK_REJECTED/);
});

test("native scaffold exposes no IPC command or remote navigation permission", async () => {
  const config = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  assert.deepEqual(config.app.security.capabilities[0].permissions, []);
  assert.equal(config.app.withGlobalTauri, false);
  assert.equal(config.app.windows[0].create, false);
  assert.equal(config.bundle.windows.webviewInstallMode.type, "offlineInstaller");
  const rust = await readFile(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
  assert.match(rust, /on_navigation/);
  assert.match(rust, /NewWindowResponse::Deny/);
  assert.match(rust, /on_download\(\|_, _\| false\)/);
  assert.doesNotMatch(rust, /invoke_handler|plugin\(/);
});
