import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("patient archive and manual lab contracts", () => {
  const platform = fs.readFileSync(
    new URL("../src/platform-index.ts", import.meta.url),
    "utf8",
  );
  const handoffClient = fs.readFileSync(
    new URL("../../web/lib/patient-handoff-client.ts", import.meta.url),
    "utf8",
  );
  const careTeam = fs.readFileSync(
    new URL("../../web/app/care-team/care-team-client.tsx", import.meta.url),
    "utf8",
  );
  const clientOcr = fs.readFileSync(
    new URL("../../web/lib/client-ocr.ts", import.meta.url),
    "utf8",
  );
  const records = fs.readFileSync(
    new URL("../../web/app/records/records-client.tsx", import.meta.url),
    "utf8",
  );
  const shell = fs.readFileSync(
    new URL("../../web/app/components/app-shell.tsx", import.meta.url),
    "utf8",
  );
  const permissions = fs.readFileSync(
    new URL("../../web/lib/runtime-permissions.ts", import.meta.url),
    "utf8",
  );
  const contracts = fs.readFileSync(
    new URL("../../../packages/contracts/src/patient-handoff.ts", import.meta.url),
    "utf8",
  );
  const labParser = fs.readFileSync(
    new URL("../../../packages/clinical-engine/src/lab-text-parser.ts", import.meta.url),
    "utf8",
  );
  const patientParser = fs.readFileSync(
    new URL("../../../packages/clinical-engine/src/patient-document-parser.ts", import.meta.url),
    "utf8",
  );
  const profile = fs.readFileSync(
    new URL("../../web/app/profile/page.tsx", import.meta.url),
    "utf8",
  );
  const profileStyles = fs.readFileSync(
    new URL("../../web/app/profile/profile.module.css", import.meta.url),
    "utf8",
  );
  const careTeamStyles = fs.readFileSync(
    new URL("../../web/app/care-team/care-team.module.css", import.meta.url),
    "utf8",
  );

  it("keeps the practice archive uncapped while using cursor pagination for transport", () => {
    expect(platform).not.toContain(
      "ORDER BY updated_at DESC LIMIT 100",
    );
    expect(platform).toContain(
      "pageSize + 1",
    );
    expect(platform).toContain(
      "nextCursor",
    );
    expect(platform).toContain(
      "ORDER BY updated_at DESC, id DESC",
    );
    expect(platform).not.toContain(
      "DELETE FROM patient_handoffs",
    );
    expect(contracts).toContain(
      "PatientHandoffArchivePage",
    );
    expect(handoffClient).toContain(
      "listPatientHandoffs",
    );
  });

  it("opens an archive record only through the signed-in practice scope", () => {
    expect(platform).toContain(
      "WHERE practice_id=? AND id=?",
    );
    expect(platform).toContain(
      "getHandoffById",
    );
    expect(handoffClient).toContain(
      "getPatientHandoffById",
    );
    expect(records).toContain(
      "openRecord",
    );
  });

  it("exposes Archive navigation only under handoff.read", () => {
    expect(shell).toContain(
      'href: "/records"',
    );
    expect(shell).toContain(
      'permission: "handoff.read"',
    );
    expect(permissions).toContain(
      'pathname === "/records"',
    );
    expect(permissions).toContain(
      'return "handoff.read"',
    );
  });

  it("allows creating laboratory rows manually without OCR", () => {
    expect(careTeam).toContain(
      "newManualLab",
    );
    expect(careTeam).toContain(
      "addManualLab",
    );
    expect(careTeam).toContain(
      "manual-entry",
    );
    expect(careTeam).toContain(
      "referenceRange",
    );
    expect(careTeam).toContain(
      "observedAt",
    );
    expect(careTeam).toContain(
      "updateLabValue",
    );
    expect(careTeam).toContain(
      "removeLab",
    );
    expect(careTeam).toContain(
      "LAB_MASTER_REGISTRY",
    );
    expect(careTeam).toContain(
      "glymize-lab-catalog",
    );
    expect(careTeam).toContain(
  "updateLabName",
);
expect(careTeam).toContain(
  'sourceKind: "manual"',
);
expect(careTeam).toContain(
  "LAB_DATALIST_OPTIONS",
);
    expect(labParser).toContain(
  "LAB_MASTER_REGISTRY",
);
expect(contracts).toContain(
  "canonicalName?: string",
);
expect(contracts).toContain(
  "referenceLow?: number",
);
expect(contracts).toContain(
  "sourceKind?: LabObservationSource",
);
  });
  it("keeps archive CTA visible and separates manual source selection from row insertion", () => {
    expect(profile).toContain("archiveLinkLabel");
    expect(profileStyles).toContain("-webkit-text-fill-color:#fff!important");
    expect(careTeam).toContain("beginManualLabEntry");
    expect(careTeam).toContain("Manual entry");
    expect(careTeam).toContain("Add row");
    expect(careTeam).toContain("addLabRow");
    expect(careTeamStyles).toContain(".labTableToolbar");
    expect(careTeamStyles).toContain(".addLabRow");
  });

  it("starts the next patient without leaving Care Team and protects unsaved draft data", () => {
    expect(careTeam).toContain("savedDraftFingerprintRef");
    expect(careTeam).toContain("currentDraftFingerprint");
    expect(careTeam).toContain("requestNewRecord");
    expect(careTeam).toContain("saveAndStartNew");
    expect(careTeam).toContain("discardAndStartNew");
    expect(careTeam).toContain("resetForNewRecord");
    expect(careTeam).toContain("Promise<boolean>");
    expect(careTeam).toContain("setLoadedRevision(record.revision)");
    expect(careTeam).toContain("New patient handoff");
    expect(careTeam).toContain("Save & start new");
    expect(careTeam).toContain("Discard & start new");
    expect(careTeam).toContain("aria-modal=\"true\"");
    expect(careTeamStyles).toContain(".handoffActions");
    expect(careTeamStyles).toContain(".newRecordDialog");
    expect(careTeamStyles).toContain(".dialogDiscard");
  });

  it("keeps new-patient access near identity, hides generic other-code creation, and reviews OCR demographics", () => {
    expect(careTeam).toContain("inlineNewRecord");
    expect(careTeam).toContain("requestNewRecord");
    expect(careTeam).not.toContain('<option value="other">');
    expect(careTeam).toContain("Legacy identifier (compatibility only)");
    expect(careTeam).toContain("patientFieldSuggestions");
    expect(careTeam).toContain("applyPatientFieldSuggestion");
    expect(careTeam).toContain("Existing fields are never overwritten automatically");
    expect(careTeam).toContain("reportedAgeYears");
    expect(careTeam).toContain("patientFieldProvenance");
    expect(careTeamStyles).toContain(".patientOcrReview");
    expect(careTeamStyles).toContain(".patientOcrSuggestionGrid");
    expect(careTeamStyles).toContain(".inlineNewRecord");
  });

  it("uses visual header OCR when embedded PDF text loses patient metadata or date", () => {
    expect(clientOcr).toContain("patientHeaderCanvas");
    expect(clientOcr).toContain("patientMetadataMissing");
    expect(clientOcr).toContain("createPatientHeaderCanvas");
    expect(clientOcr).toContain("Reading patient header from rendered page");
    expect(clientOcr).toContain("fallbackDateByPage");
    expect(clientOcr).toContain("patientHeaderOcrPages");
    expect(careTeam).toContain("isPersianCalendarDate");
    expect(careTeam).toContain("labDateInputValue");
    expect(careTeam).toContain("مثلاً 1405/05/10");
  });

  it("normalizes presentation-form Persian patient headers and carries reported sex safely", () => {
    expect(patientParser).toContain('raw.normalize("NFKC")');
    expect(patientParser).toContain('.replace(/\\u0640+/g, "")');
    expect(patientParser).toContain("reversedPatientFullName");
    expect(patientParser).toContain('"reported_sex"');
    expect(patientParser).toContain("normalizeReportedSex");
    expect(contracts).toContain("PatientReportedSex");
    expect(contracts).toContain('reportedSex?: PatientReportedSex');
    expect(careTeam).toContain("reportedSex");
    expect(careTeam).toContain("patientSuggestionValue");
    expect(careTeam).toContain("جنس گزارش‌شده");
    expect(careTeamStyles).toContain(".gridClinical");
  });

  it("makes OCR patient suggestions actionable and highlights ambiguous lab numbers", () => {
    expect(careTeam).toContain("fullNameReviewSuggestion");
    expect(careTeam).toContain("confirmFullNameReview");
    expect(careTeam).toContain("isPatientSuggestionApplied");
    expect(careTeam).toContain("اعمال شد ✓");
    expect(careTeam).toContain("labNeedsReviewAttention");
    expect(careTeam).toContain("parserConfidence: 1");
    expect(careTeam).toContain("⚠ تطبیق عدد");
    expect(careTeamStyles).toContain(".labRowAttention");
    expect(careTeamStyles).toContain(".labValueAttention");
    expect(careTeamStyles).toContain(".fullNameReviewDialog");
    expect(labParser).toContain("extractQuantitativeValue");
    expect(labParser).toContain("stripInterpretationLegend");
  });

  it("keeps Care Team collision protection on Patient Record v2 while legacy transport is read-only", () => {
    expect(platform).toContain(
      "LEGACY_HANDOFF_WRITE_RETIRED",
    );
    expect(platform).not.toContain(
      "codeStatusHandoff",
    );
    expect(platform).not.toContain(
      "upsertHandoff",
    );

    expect(handoffClient).not.toContain(
      "checkPatientHandoffCode",
    );
    expect(handoffClient).not.toContain(
      "savePatientHandoff",
    );

    expect(careTeam).toContain(
      "checkCareTeamPatientCode",
    );
    expect(careTeam).toContain(
      "saveCareTeamPatientRecord",
    );
    expect(careTeam).toContain(
      "patientCodeCollision",
    );
    expect(careTeam).toContain(
      "useSuggestedPatientCode",
    );
    expect(careTeam).toContain(
      "openExistingFromCollision",
    );
    expect(careTeam).toContain(
      'writeMode === "update"',
    );
    expect(careTeam).toContain(
      "loadedRecordId",
    );
    expect(careTeamStyles).toContain(
      ".duplicateCodeDialog",
    );

    expect(contracts).toContain(
      "PatientHandoffWriteMode",
    );
    expect(contracts).toContain(
      "PatientHandoffCodeStatus",
    );
  });
});
