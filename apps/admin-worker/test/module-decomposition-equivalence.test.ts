import { describe, expect, it } from "vitest";
import {
  cleanupPortalMedia,
  portalMediaExtension,
  portalMediaSignatureMatches,
  sha256BytesHex,
} from "../src/patient-portal/media-policy";
import { parsePatientArchiveCursor } from "../src/patient-record-v2/archive";

describe("Worker module decomposition equivalence", () => {
  it("preserves Patient Record archive cursor parsing", () => {
    expect(
      parsePatientArchiveCursor(
        "2026-09-03T00:00:00.000Z|v2:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002",
      ),
    ).toEqual({
      updatedAt: "2026-09-03T00:00:00.000Z",
      recordKey: "v2:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002",
    });
    expect(parsePatientArchiveCursor("invalid")).toBeNull();
  });

  it("preserves portal media signature, extension, digest, and cleanup behavior", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(portalMediaSignatureMatches("image/png", png.buffer)).toBe(true);
    expect(portalMediaSignatureMatches("image/jpeg", png.buffer)).toBe(false);
    expect(portalMediaExtension("video/quicktime")).toBe("mov");
    expect(await sha256BytesHex(new TextEncoder().encode("glymize").buffer)).toBe(
      "db7c0747a8ac6aaf99273675ae966a2edf1a5491cddaf32e88f6f4319d7f5abe",
    );

    const removed: string[] = [];
    await cleanupPortalMedia(
      { delete: async (key: string) => removed.push(key) } as unknown as R2Bucket,
      ["one", "two"],
    );
    expect(removed).toEqual(["one", "two"]);
  });
});
