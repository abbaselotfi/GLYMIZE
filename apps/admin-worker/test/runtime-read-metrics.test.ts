import { describe, expect, it } from "vitest";
import {
  measureRuntimeReadDecryption,
  measureRuntimeReadQuery,
  RuntimeReadMetricsCollector,
} from "../src/runtime-read-metrics";

describe("runtime read metric semantics", () => {
  it("reports requested routing separately from actual routing and unknown metadata", async () => {
    const metrics = new RuntimeReadMetricsCollector("first-primary");
    for (const meta of [
      { served_by_primary: true, served_by_region: "WEUR" },
      { served_by_primary: false, served_by_region: "WEUR" },
      { served_by_primary: "false", served_by_region: "bad-region-secret" },
      undefined,
    ]) {
      await measureRuntimeReadQuery(metrics, async () => ({ meta }), () => 0);
    }
    expect(metrics.finish({}).d1Routing).toEqual({
      requestedMode: "first-primary", primary: 1, replica: 1, unknown: 2,
      regions: { WEUR: 2 }, unknownRegion: 2,
    });
    expect(new RuntimeReadMetricsCollector().finish({})).not.toHaveProperty("d1Routing");
    expect(JSON.stringify(metrics.finish({}))).not.toContain("bad-region-secret");
  });

  it("separates returned rows from scanned rows and reports missing first() metadata", async () => {
    const metrics = new RuntimeReadMetricsCollector();
    await measureRuntimeReadQuery(
      metrics,
      async () => ({ results: [1, 2], meta: { rows_read: 400 } }),
      (r) => r.results.length,
    );
    await measureRuntimeReadQuery(
      metrics,
      async () => ({ id: "synthetic" }),
      () => 1,
    );
    expect(metrics.finish({})).toMatchObject({
      metricsVersion: 2,
      queryCount: 2,
      returnedRows: 3,
      rowCount: 3,
      knownRowsRead: 400,
      queriesWithRowsRead: 1,
      rowsReadComplete: false,
    });
  });

  it("distinguishes a measured zero from unknown and rejects invalid metadata", async () => {
    const metrics = new RuntimeReadMetricsCollector();
    expect(metrics.finish({})).toMatchObject({ knownRowsRead: null, rowsReadComplete: false });
    await measureRuntimeReadQuery(
      metrics,
      async () => ({ meta: { rows_read: 0 } }),
      () => 0,
    );
    expect(metrics.finish({})).toMatchObject({ knownRowsRead: 0, rowsReadComplete: true });
    for (const rows_read of [-1, NaN, Infinity, 1.5, "9"]) {
      await measureRuntimeReadQuery(
        metrics,
        async () => ({ meta: { rows_read } }),
        () => 0,
      );
    }
    expect(metrics.finish({})).toMatchObject({
      queryCount: 6,
      knownRowsRead: 0,
      queriesWithRowsRead: 1,
      rowsReadComplete: false,
    });
  });

  it("counts failures without swallowing errors or retaining payloads", async () => {
    const metrics = new RuntimeReadMetricsCollector();
    const failure = new Error("synthetic failure");
    await expect(
      measureRuntimeReadQuery(
        metrics,
        async () => {
          throw failure;
        },
        () => 1,
      ),
    ).rejects.toBe(failure);
    await expect(
      measureRuntimeReadDecryption(metrics, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await measureRuntimeReadDecryption(metrics, async () => null)).toBeNull();
    const payload = { sensitive: "never-include-this-in-metrics", text: "فارسی" };
    const result = await measureRuntimeReadDecryption(metrics, async () => payload);
    expect(result).toBe(payload);
    const snapshot = metrics.finish(payload);
    expect(snapshot).toMatchObject({
      queryCount: 1,
      queryFailureCount: 1,
      decryptionCount: 3,
      decryptionFailureCount: 2,
      returnedRows: 0,
    });
    expect(snapshot.responseBytes).toBe(
      new TextEncoder().encode(JSON.stringify(payload)).byteLength,
    );
    expect(JSON.stringify(snapshot)).not.toContain(payload.sensitive);
    expect(new RuntimeReadMetricsCollector().finish({}).queryCount).toBe(0);
  });

  it("preserves concurrent query results with request-local accounting", async () => {
    const metrics = new RuntimeReadMetricsCollector();
    let release!: (value: { results: number[]; meta: { rows_read: number } }) => void;
    const slow = measureRuntimeReadQuery(
      metrics,
      () =>
        new Promise<{ results: number[]; meta: { rows_read: number } }>((resolve) => {
          release = resolve;
        }),
      (r) => r.results.length,
    );
    const fast = await measureRuntimeReadQuery(
      metrics,
      async () => ({ results: [2], meta: { rows_read: 5 } }),
      (r) => r.results.length,
    );
    release({ results: [1], meta: { rows_read: 7 } });
    expect((await slow).results).toEqual([1]);
    expect(fast.results).toEqual([2]);
    expect(metrics.finish({})).toMatchObject({
      queryCount: 2,
      knownRowsRead: 12,
      returnedRows: 2,
      rowsReadComplete: true,
    });
  });
});
