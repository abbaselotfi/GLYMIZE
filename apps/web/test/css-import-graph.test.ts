import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = fileURLToPath(new URL("../app", import.meta.url));

function collectFiles(dir: string, extensions: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      found.push(full);
    }
  }
  return found;
}

// Phase 0 / Task 8 guard: the consolidated stylesheets must remain the only
// sources of truth and no unreferenced stylesheet may reappear under app/.
const stylesheets = collectFiles(appDir, [".css"]);
const corpus = collectFiles(appDir, [".ts", ".tsx", ".css"])
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const maintainedSources = [
  "globals.css",
  "design-system-v2.css",
  "design-tokens-v3.css",
  "redesign-v3.css",
];

describe("css import graph", () => {
  it("keeps the consolidated design-system sources of truth in place", () => {
    for (const name of maintainedSources) {
      expect(
        stylesheets.some((file) => file.replaceAll("\\", "/").endsWith(`/${name}`)),
        `${name} must exist under apps/web/app`,
      ).toBe(true);
    }
  });

  it("leaves no orphan stylesheets under app/", () => {
    const orphans = stylesheets
      .map((file) => file.replaceAll("\\", "/").split("/").pop())
      .filter((name) => name !== undefined && !corpus.includes(name));
    expect(orphans).toEqual([]);
  });
});
