import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".tmp",
  ".turbo",
  ".venv",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

async function filesUnder(relativeRoot) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  const files = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/"));
      }
    }
  }

  await visit(absoluteRoot);
  return files.sort();
}

const allFiles = await filesUnder(".");
const webAppFiles = allFiles.filter((file) => file.startsWith("apps/web/app/"));
const webPages = webAppFiles.filter((file) => /\/page\.(?:js|jsx|ts|tsx)$/.test(file));
const webRouteHandlers = webAppFiles.filter((file) => /\/route\.(?:js|jsx|ts|tsx)$/.test(file));
const javascriptTests = allFiles.filter((file) => /\.(?:test|spec)\.(?:cjs|js|jsx|mjs|ts|tsx)$/.test(file));
const pythonTests = allFiles.filter((file) => /(?:^|\/)test_[^/]+\.py$/.test(file));
const workerMigrations = allFiles.filter((file) =>
  /^apps\/admin-worker\/migrations\/\d+[^/]*\.sql$/.test(file),
);
const postgresMigrations = allFiles.filter((file) =>
  /^infra\/postgres\/\d+[^/]*\.sql$/.test(file),
);

const summary = [
  "<!-- current-state:generated:start -->",
  "| Repository fact | Count |",
  "| --- | ---: |",
  `| Web App Router entries | ${webPages.length + webRouteHandlers.length} (${webPages.length} pages, ${webRouteHandlers.length} route handlers) |`,
  `| Automated test files | ${javascriptTests.length + pythonTests.length} (${javascriptTests.length} JS/TS, ${pythonTests.length} Python) |`,
  `| SQL migration files | ${workerMigrations.length + postgresMigrations.length} (${workerMigrations.length} Worker/D1, ${postgresMigrations.length} PostgreSQL foundation) |`,
  "<!-- current-state:generated:end -->",
];

console.log(summary.join("\n"));
