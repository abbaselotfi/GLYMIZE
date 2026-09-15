import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const vitestPackage = require("vitest/package.json");
const vitest = resolve(dirname(require.resolve("vitest/package.json")), vitestPackage.bin.vitest);
const cohorts = [];
for (const cohort of ["small", "medium", "large"]) {
  // Separate processes keep one cohort's repeated crypto work out of the next.
  const result = spawnSync(
    process.execPath,
    [
      vitest,
      "run",
      "test/patient-core-longitudinal-performance.test.ts",
      "--maxWorkers=1",
      "--silent=false",
      "--disableConsoleIntercept",
    ],
    {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, GLYMIZE_R29_BASELINE: "1", GLYMIZE_R29_COHORT: cohort, NO_COLOR: "1" },
      encoding: "utf8",
      timeout: 150000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stderr || result.error?.message || "Benchmark failed");
    process.stderr.write(result.stdout || "");
    process.exit(1);
  }
  const line = result.stdout.split(/\r?\n/).find((line) => line.includes("R29_01_BASELINE "));
  if (!line) {
    process.stderr.write(result.stdout + result.stderr);
    throw new Error(`Missing evidence for ${cohort}`);
  }
  cohorts.push(
    JSON.parse(line.slice(line.indexOf("R29_01_BASELINE ") + "R29_01_BASELINE ".length)),
  );
}
process.stdout.write(
  `${JSON.stringify({ schemaVersion: 1, capturedAt: new Date().toISOString(), cohorts }, null, 2)}\n`,
);
