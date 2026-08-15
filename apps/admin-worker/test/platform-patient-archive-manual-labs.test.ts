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
});
