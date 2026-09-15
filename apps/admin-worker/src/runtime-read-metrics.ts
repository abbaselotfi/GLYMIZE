export interface RuntimeReadMetricsSnapshot {
  metricsVersion: 2;
  queryCount: number;
  queryFailureCount: number;
  /** Compatibility alias for returnedRows, never D1 rows_read. */
  rowCount: number;
  returnedRows: number;
  /** Sum only where D1 metadata was available; null means none was available. */
  knownRowsRead: number | null;
  queriesWithRowsRead: number;
  rowsReadComplete: boolean;
  queryMs: number;
  decryptionCount: number;
  decryptionFailureCount: number;
  decryptionMs: number;
  responseBytes: number;
  totalMs: number;
  d1Routing?: {
    requestedMode: "direct-primary" | "first-primary";
    primary: number;
    replica: number;
    unknown: number;
    regions: Record<string, number>;
    unknownRegion: number;
  };
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export class RuntimeReadMetricsCollector {
  private readonly d1Routing?: NonNullable<RuntimeReadMetricsSnapshot["d1Routing"]>;

  constructor(requestedMode?: "direct-primary" | "first-primary") {
    if (requestedMode) this.d1Routing = {
      requestedMode, primary: 0, replica: 0, unknown: 0, regions: {}, unknownRegion: 0,
    };
  }

  recordD1Routing(result: unknown) {
    if (!this.d1Routing) return;
    const meta = result && typeof result === "object" && "meta" in result
      && result.meta && typeof result.meta === "object" ? result.meta : undefined;
    const primary = meta && "served_by_primary" in meta ? meta.served_by_primary : undefined;
    this.d1Routing[primary === true ? "primary" : primary === false ? "replica" : "unknown"] += 1;
    const region = meta && "served_by_region" in meta ? meta.served_by_region : undefined;
    // Bounded provider labels only; never copy arbitrary result/error contents.
    if (typeof region === "string" && /^[A-Za-z]{2,12}$/.test(region)
      && (Object.hasOwn(this.d1Routing.regions, region) || Object.keys(this.d1Routing.regions).length < 12)) {
      this.d1Routing.regions[region] = (Object.hasOwn(this.d1Routing.regions, region)
        ? this.d1Routing.regions[region]! : 0) + 1;
    } else this.d1Routing.unknownRegion += 1;
  }
  private readonly startedAt = nowMs();
  private queryCount = 0;
  private queryFailureCount = 0;
  private rowCount = 0;
  private knownRowsRead = 0;
  private queriesWithRowsRead = 0;
  private queryMs = 0;
  private decryptionCount = 0;
  private decryptionFailureCount = 0;
  private decryptionMs = 0;

  recordQuery(rows: number, durationMs: number, rowsRead?: number, failed = false) {
    this.queryCount += 1;
    if (failed) this.queryFailureCount += 1;
    this.rowCount += Number.isFinite(rows) ? Math.max(0, Math.trunc(rows)) : 0;
    if (rowsRead !== undefined && Number.isSafeInteger(rowsRead) && rowsRead >= 0) {
      this.knownRowsRead += rowsRead;
      this.queriesWithRowsRead += 1;
    }
    this.queryMs += Math.max(0, durationMs);
  }

  recordDecryption(durationMs: number, failed = false) {
    this.decryptionCount += 1;
    if (failed) this.decryptionFailureCount += 1;
    this.decryptionMs += Math.max(0, durationMs);
  }

  finish(payload: unknown): RuntimeReadMetricsSnapshot {
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    return {
      metricsVersion: 2,
      queryCount: this.queryCount,
      queryFailureCount: this.queryFailureCount,
      rowCount: this.rowCount,
      returnedRows: this.rowCount,
      knownRowsRead: this.queriesWithRowsRead ? this.knownRowsRead : null,
      queriesWithRowsRead: this.queriesWithRowsRead,
      rowsReadComplete: this.queryCount > 0 && this.queriesWithRowsRead === this.queryCount,
      queryMs: rounded(this.queryMs),
      decryptionCount: this.decryptionCount,
      decryptionFailureCount: this.decryptionFailureCount,
      decryptionMs: rounded(this.decryptionMs),
      responseBytes: encoded.byteLength,
      totalMs: rounded(nowMs() - this.startedAt),
      ...(this.d1Routing ? { d1Routing: { ...this.d1Routing, regions: { ...this.d1Routing.regions } } } : {}),
    };
  }
}

function d1RowsRead(result: unknown): number | undefined {
  if (!result || typeof result !== "object" || !("meta" in result)) return undefined;
  const meta = result.meta;
  if (!meta || typeof meta !== "object" || !("rows_read" in meta)) return undefined;
  return typeof meta.rows_read === "number" ? meta.rows_read : undefined;
}

export async function measureRuntimeReadQuery<T>(
  metrics: RuntimeReadMetricsCollector | undefined,
  operation: () => Promise<T>,
  rowCount: (result: T) => number,
) {
  const startedAt = nowMs();
  try {
    const result = await operation();
    metrics?.recordD1Routing(result);
    metrics?.recordQuery(rowCount(result), nowMs() - startedAt, d1RowsRead(result));
    return result;
  } catch (error) {
    metrics?.recordD1Routing(undefined);
    metrics?.recordQuery(0, nowMs() - startedAt, undefined, true);
    throw error;
  }
}

export async function measureRuntimeReadDecryption<T>(
  metrics: RuntimeReadMetricsCollector | undefined,
  operation: () => Promise<T>,
) {
  const startedAt = nowMs();
  try {
    const result = await operation();
    metrics?.recordDecryption(nowMs() - startedAt, result === null);
    return result;
  } catch (error) {
    metrics?.recordDecryption(nowMs() - startedAt, true);
    throw error;
  }
}
