import { describe, expect, it } from "vitest";
import {
  globalReferenceCatalogue,
  globalReferenceCatalogueSources,
} from "../../api/src/catalog/global-reference-catalog";
import {
  draftFingerprint,
  isPersianCalendarDate,
  parseMedicationFrequency,
} from "../app/care-team/care-team-form-model";
import { parseStoredCatalogState } from "../lib/catalog/browser-catalog-state";

describe("web and catalogue module decomposition equivalence", () => {
  it("preserves the global reference catalogue public facade and order", () => {
    expect(globalReferenceCatalogue).toHaveLength(104);
    expect(globalReferenceCatalogue[0]?.id).toBe("global-metformin-1");
    expect(globalReferenceCatalogue.at(-1)?.id).toBe("global-insulin-icodec-semaglutide-1");
    expect(globalReferenceCatalogueSources).toHaveLength(9);
    expect(globalReferenceCatalogueSources[0]?.id).toBe("reference-ada-2026");
    expect(globalReferenceCatalogueSources.at(-1)?.id).toBe("reference-dailymed-brenzavvy");
  });

  it("preserves Care Team frequency, date, and stable-draft helpers", () => {
    expect(parseMedicationFrequency("۲ بار")).toMatchObject({ valid: false });
    expect(parseMedicationFrequency("BID")).toEqual({
      timesPerDay: 2,
      code: "BID",
      valid: true,
    });
    expect(isPersianCalendarDate("۱۴۰۵/۰۶/۱۲")).toBe(true);
    const base = {
      patientCodeKind: "file_number" as const,
      patientCode: "12",
      firstName: "A",
      lastName: "B",
      vitals: {
        weightKg: "",
        heightCm: "",
        systolicBp: "",
        diastolicBp: "",
        pulseBpm: "",
      },
      flags: {},
      medications: [],
      labs: [],
      reportedAgeYears: "",
      reportedSex: "" as const,
      patientFieldProvenance: {},
      ocrText: "",
      nurseNotes: "",
    };
    expect(draftFingerprint(base)).toBe(draftFingerprint(base));
  });

  it("preserves old and wrapped browser catalogue persistence shapes", () => {
    expect(parseStoredCatalogState(null)).toBeNull();
    expect(parseStoredCatalogState("not-json")).toBeNull();
    expect(
      parseStoredCatalogState(
        JSON.stringify({
          savedAt: "2026-09-03T00:00:00.000Z",
          state: { visibility: { item: true } },
        }),
      ),
    ).toMatchObject({
      savedAt: "2026-09-03T00:00:00.000Z",
      state: {
        visibility: { item: true },
        insurance: {},
        brands: {},
        customGenerics: [],
      },
    });
  });
});
