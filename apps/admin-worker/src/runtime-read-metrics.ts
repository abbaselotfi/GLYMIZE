export interface RuntimeReadMetricsSnapshot {
  queryCount: number;
  rowCount: number;
  queryMs: number;
  decryptionCount: number;
  decryptionMs: number;
  responseBytes: number;
  totalMs: number;
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export class RuntimeReadMetricsCollector {
  private readonly startedAt = nowMs();
  private queryCount = 0;
  private rowCount = 0;
  private queryMs = 0;
  private decryptionCount = 0;
  private decryptionMs = 0;

  recordQuery(rows: number, durationMs: number) {
    this.queryCount += 1;
    this.rowCount += Math.max(0, Math.trunc(rows));
    this.queryMs += Math.max(0, durationMs);
  }

  recordDecryption(durationMs: number) {
    this.decryptionCount += 1;
    this.decryptionMs += Math.max(0, durationMs);
  }

  finish(payload: unknown): RuntimeReadMetricsSnapshot {
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    return {
      queryCount: this.queryCount,
      rowCount: this.rowCount,
      queryMs: rounded(this.queryMs),
      decryptionCount: this.decryptionCount,
      decryptionMs: rounded(this.decryptionMs),
      responseBytes: encoded.byteLength,
      totalMs: rounded(nowMs() - this.startedAt),
    };
  }
}

export async function measureRuntimeReadQuery<T>(
  metrics: RuntimeReadMetricsCollector | undefined,
  operation: () => Promise<T>,
  rowCount: (result: T) => number,
) {
  const startedAt = nowMs();
  const result = await operation();
  metrics?.recordQuery(rowCount(result), nowMs() - startedAt);
  return result;
}

export async function measureRuntimeReadDecryption<T>(
  metrics: RuntimeReadMetricsCollector | undefined,
  operation: () => Promise<T>,
) {
  const startedAt = nowMs();
  const result = await operation();
  metrics?.recordDecryption(nowMs() - startedAt);
  return result;
}
