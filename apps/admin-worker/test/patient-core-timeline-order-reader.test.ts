import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptClinicalPayload } from "../src/runtime-security";
import type { PatientRecordV2RouteContext } from "../src/patient-record-v2/context";
import { readPatientCoreTimelineOrders } from "../src/patient-core/timeline-order-reader";

vi.mock("../src/runtime-security", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/runtime-security")>();
  return { ...original, decryptClinicalPayload: vi.fn() };
});

const decrypt = vi.mocked(decryptClinicalPayload);

beforeEach(() => {
  decrypt.mockReset();
  decrypt.mockResolvedValue({ genericName: "Metformin" } as never);
});

describe("Patient Core timeline order watermark", () => {
  it("freezes signed membership and append-only execution state at sourceVersion", async () => {
    let sql = "";
    let bound: unknown[] = [];
    const context = {
      database: {
        prepare: (value: string) => {
          sql = value;
          return {
            bind: (...values: unknown[]) => {
              bound = values;
              return {
                all: async () => ({
                  results: [{
                    order_id: "order-1",
                    encounter_id: "enc-1",
                    order_kind: "medication",
                    order_status: "active",
                    plan_status: "signed",
                    payload_ciphertext: "cipher",
                    payload_iv: "iv",
                    payload_auth_tag: "tag",
                    signed_at: "2026-09-08T10:00:00.000Z",
                    latest_fulfillment_status: "registered",
                    linked_result_count: 0,
                  }],
                }),
              };
            },
          };
        },
      },
      user: { practiceId: "practice-1" },
      clinicalSecret: "clinical-secret",
    } as unknown as PatientRecordV2RouteContext;
    const sourceVersion = "2026-09-09T10:00:00.000Z";

    const result = await readPatientCoreTimelineOrders(context, "patient-1", {
      sourceVersion,
      limit: 12,
    });

    expect(sql).toContain("p.plan_status IN ('signed','superseded','void')");
    expect(sql).toContain("p.signed_at<=?");
    expect(sql).toContain("f.created_at<=?");
    expect(sql).toContain("l.linked_at<=?");
    expect(bound).toEqual([
      sourceVersion,
      sourceVersion,
      "practice-1",
      "patient-1",
      sourceVersion,
      sourceVersion,
      sourceVersion,
      12,
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        eventId: "order:order-1",
        effectiveAt: "2026-09-08T10:00:00.000Z",
        status: "in_progress",
        label: "Metformin",
      }),
    ]);
  });

  it("keeps a previously signed order visible after its plan is superseded", async () => {
    const context = {
      database: {
        prepare: () => ({
          bind: () => ({
            all: async () => ({
              results: [{
                order_id: "order-2",
                encounter_id: "enc-2",
                order_kind: "medication",
                order_status: "active",
                plan_status: "superseded",
                payload_ciphertext: "cipher",
                payload_iv: "iv",
                payload_auth_tag: "tag",
                signed_at: "2026-09-07T10:00:00.000Z",
                latest_fulfillment_status: null,
                linked_result_count: 0,
              }],
            }),
          }),
        }),
      },
      user: { practiceId: "practice-1" },
      clinicalSecret: "clinical-secret",
    } as unknown as PatientRecordV2RouteContext;

    const result = await readPatientCoreTimelineOrders(context, "patient-1", {
      sourceVersion: "2026-09-09T10:00:00.000Z",
      limit: 12,
    });
    expect(result[0]).toMatchObject({
      eventId: "order:order-2",
      status: "superseded",
    });
  });
});
