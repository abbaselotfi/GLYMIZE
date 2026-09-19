import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../wrangler.rc.jsonc", import.meta.url), "utf8")
  .replace(/^\s*\/\/.*$/gm, ""));

describe("owner-authorized RC deployment boundary", () => {
  it("pins RC resources without replacing the existing remote variables", () => {
    expect(config.name).toBe("glymize-rc-portal-staging");
    expect(config.keep_vars).toBe(true);
    expect(config.vars).toBeUndefined();
    expect(config.main).toBe("src/platform-v3.ts");
    expect(config.d1_databases[0].database_id).toBe("3fa1a950-189d-487c-9ffc-8f91a4557117");
    expect(config.kv_namespaces).toEqual([{ binding: "AI_CONFIG_KV", id: "0b88c7b5544e4b848aaf748ed6a6e75b" }]);
    expect(config.r2_buckets).toEqual([{ binding: "PORTAL_MEDIA", bucket_name: "glymize-portal-media-rc" }]);
  });

  it("only discovers the approved 0018 migration, never 0019 or a wildcard", () => {
    expect(config.d1_databases).toHaveLength(1);
    expect(config.d1_databases[0].migrations_dir).toBe("migrations");
    expect(config.d1_databases[0].migrations_pattern).toBe("migrations/0018_patient_access_rbac.sql");
  });
});
