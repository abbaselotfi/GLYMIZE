import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientCoreEventView } from "@glymize/contracts/patient-core";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";
import { readPatientCoreTimelineOrders } from "../src/patient-core/timeline-order-reader";
import { readPatientCoreTimeline } from "../src/patient-core/timeline-reader";

vi.mock("../src/patient-core/timeline-order-reader", () => ({
  readPatientCoreTimelineOrders: vi.fn(),
}));

const readOrders = vi.mocked(readPatientCoreTimelineOrders);
const sourceVersion = "2026-09-09T11:00:00.000Z";

const encounters = [
  { id: "enc-3", encounter_at: "2026-09-09T10:00:00.000Z", encounter_kind: "outpatient", status: "completed" },
  { id: "enc-2", encounter_at: "2026-09-09T08:00:00.000Z", encounter_kind: "telehealth", status: "reviewed" },
  { id: "enc-1", encounter_at: "2026-09-09T06:00:00.000Z", encounter_kind: "outpatient", status: "reviewed" },
];

const orderEvents: PatientCoreEventView[] = [
  {
    eventId: "order:order-3",
    eventType: "order",
    effectiveAt: "2026-09-09T09:00:00.000Z",
    status: "pending",
    label: "Order 3",
    source: { sourceType: "physician_order", recordType: "patient_final_order", recordId: "order-3" },
  },
  {
    eventId: "order:order-2",
    eventType: "order",
    effectiveAt: "2026-09-09T07:00:00.000Z",
    status: "pending",
    label: "Order 2",
    source: { sourceType: "physician_order", recordType: "patient_final_order", recordId: "order-2" },
  },
  {
    eventId: "order:order-1",
    eventType: "order",
    effectiveAt: "2026-09-09T05:00:00.000Z",
    status: "pending",
    label: "Order 1",
    source: { sourceType: "physician_order", recordType: "patient_final_order", recordId: "order-1" },
  },
];

function afterPosition<T extends { effectiveAt: string; eventId: string }>(
  items: T[],
  position: { effectiveAt: string; eventId: string } | undefined,
) {
  if (!position) return items;
  return items.filter((item) =>
    item.effectiveAt < position.effectiveAt ||
    (item.effectiveAt === position.effectiveAt && item.eventId > position.eventId)
  );
}

function context() {
  return {
    database: {
      prepare: (sql: string) => ({
        bind: (...bound: unknown[]) => {
          let remaining = encounters.map((item) => ({
            ...item,
            effectiveAt: item.encounter_at,
            eventId: `encounter:${item.id}`,
          }));
          if (sql.includes("encounter_at < ?")) {
            remaining = afterPosition(remaining, {
              effectiveAt: String(bound[3]),
              eventId: String(bound[5]),
            });
          }
          const limit = Number(bound.at(-1));
          return {
            all: async () => ({
              results: remaining.slice(0, limit).map(({ effectiveAt: _a, eventId: _b, ...item }) => item),
            }),
          };
        },
      }),
    },
    user: { practiceId: "practice-1" },
    clinicalSecret: "clinical-secret",
  } as unknown as PatientRecordV2RouteContext;
}

beforeEach(() => {
  readOrders.mockReset();
  readOrders.mockImplementation(async (_context, _patientId, options) =>
    afterPosition(orderEvents, options.cursor).slice(0, options.limit),
  );
});

describe("Patient Core heterogeneous timeline pagination", () => {
  it("walks encounters and signed orders without duplicates or omissions", async () => {
    const ids: string[] = [];
    let page = await readPatientCoreTimeline(context(), "patient-1", {
      sourceVersion,
      limit: 2,
    });

    for (;;) {
      expect(page.completeness).toBe("partial");
      expect(page.gapReason).toBe("source_not_exposed");
      ids.push(...page.items.map((item) => item.eventId));
      if (!page.continuation?.hasMore) break;
      page = await readPatientCoreTimeline(context(), "patient-1", {
        cursor: page.continuation.nextCursor,
        limit: 2,
      });
    }

    expect(ids).toEqual([
      "encounter:enc-3",
      "order:order-3",
      "encounter:enc-2",
      "order:order-2",
      "encounter:enc-1",
      "order:order-1",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(page.continuation?.hasMore).toBe(false);
  });
});
