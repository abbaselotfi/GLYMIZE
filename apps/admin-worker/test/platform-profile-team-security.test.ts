import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("profile security and care-team membership contracts", () => {
  const platformIndex = fs.readFileSync(
    new URL("../src/platform-index.ts", import.meta.url),
    "utf8",
  );
  const runtimeClient = fs.readFileSync(
    new URL("../../web/lib/runtime-client.ts", import.meta.url),
    "utf8",
  );
  const profile = fs.readFileSync(
    new URL("../../web/app/profile/page.tsx", import.meta.url),
    "utf8",
  );
  const security = fs.readFileSync(
    new URL(
      "../../web/app/profile/security/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  it("exposes secure password change to the authenticated profile", () => {
    expect(security).toContain("updateOwnPassword");
    expect(security).toContain("currentPassword");
    expect(security).toContain("newPassword");
    expect(security).toContain("Confirm new password");
  });

  it("removes only the assistant practice membership and revokes its sessions", () => {
    expect(platformIndex).toContain(
      "async function removeTeamMember",
    );
    expect(platformIndex).toContain(
      "DELETE FROM practice_memberships",
    );
    expect(platformIndex).toContain(
      "role='assistant'",
    );
    expect(platformIndex).toContain(
      "UPDATE refresh_tokens",
    );
    expect(platformIndex).toContain(
      '"team.member_removed"',
    );
    expect(platformIndex).toContain(
      'request.method==="DELETE"',
    );
    expect(runtimeClient).toContain(
      "export async function removeTeamMember",
    );
    expect(profile).toContain(
      "removeTeamMember(member.id)",
    );
    expect(profile).toContain(
      "Remove from team",
    );
  });

  it("keeps infrastructure vendor names out of non-admin route source", () => {
    const appRoot = fileURLToPath(
      new URL("../../web/app/", import.meta.url),
    );
    const violations: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(
        dir,
        { withFileTypes: true },
      )) {
        if (entry.name === "admin") continue;

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(full);
          continue;
        }

        if (
          !entry.isFile() ||
          !/\.(tsx|ts)$/.test(entry.name)
        ) {
          continue;
        }

        const source = fs.readFileSync(full, "utf8");

        if (/GitHub|Cloudflare/i.test(source)) {
          violations.push(path.relative(appRoot, full));
        }
      }
    };

    walk(appRoot);
    expect(violations).toEqual([]);
  });
});
