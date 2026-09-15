// R29-04-C: synthetic, in-memory only. No runtime imports, credentials or remote access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const hash = text => createHash("sha256").update(text).digest("hex");
const schema = read("../migrations/0003_longitudinal_patient_records.sql");
const paths = ["../src/patient-core/timeline-reader.ts", "../src/patient-core/timeline-order-reader.ts"];
const sources = paths.map(read);
const templates = sources.map(source => {
  const queries = [...source.matchAll(/`(SELECT[\s\S]*?)`/g)];
  assert.equal(queries.length, 1);
  const cursor = source.match(/sql: `([\s\S]*?)`/)?.[1];
  assert.ok(cursor);
  return { sql: queries[0][1], cursor };
});
const definitions = [
  ["encounters", "patient_encounters", "practice_id,patient_id,encounter_at DESC,('encounter:' || id) ASC"],
  ["fulfillment", "patient_order_fulfillment_events", "practice_id,order_id,created_at DESC,id DESC"],
  ["links", "patient_investigation_result_links", "order_id,linked_at"],
];
const db = new DatabaseSync(":memory:");
try {
  db.exec(schema);
  db.exec("PRAGMA foreign_keys=OFF");
  const encounterSql = "INSERT INTO patient_encounters(id,patient_id,practice_id,encounter_at,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,'synthetic','synthetic',?,?)";
  const eventSql = "INSERT INTO patient_order_fulfillment_events(id,order_id,plan_id,patient_id,practice_id,fulfillment_status,updated_by,created_at) VALUES (?,?,?,?,?,?,'synthetic',?)";
  const linkSql = "INSERT INTO patient_investigation_result_links(order_id,observation_id,linked_by,linked_at) VALUES (?,?,'synthetic',?)";
  const encounter = db.prepare(encounterSql);
  const plan = db.prepare("INSERT INTO patient_final_plans(id,encounter_id,patient_id,practice_id,plan_version,plan_status,authored_by,signed_at,created_at) VALUES (?,?,?,?,1,?,'synthetic',?,?)");
  const order = db.prepare("INSERT INTO patient_final_orders(id,plan_id,encounter_id,patient_id,practice_id,order_kind,payload_ciphertext,payload_iv,payload_auth_tag,created_at) VALUES (?,?,?,?,?,'investigation','synthetic','synthetic','synthetic',?)");
  const event = db.prepare(eventSql);
  const link = db.prepare(linkSql);
  db.exec("BEGIN");
  for (let patient = 0; patient < 3; patient++) {
    const practice = patient < 2 ? "practice-0" : "practice-2";
    for (let n = 0; n < 120; n++) {
      const id = `p${patient}-${String(n).padStart(3, "0")}`;
      const at = `2026-08-${String(1 + Math.floor(n / 5)).padStart(2, "0")}T00:00:00Z`;
      const created = "2026-08-01T00:00:00Z";
      encounter.run(id, `patient-${patient}`, practice, at, created, created);
      const status = ["signed", "superseded", "void", "draft"][n % 4];
      plan.run(id, id, `patient-${patient}`, practice, status, status === "draft" ? null : at, created);
      order.run(id, id, id, `patient-${patient}`, practice, created);
      for (let revision = 0; revision < 4; revision++) {
        const eventAt = revision < 3 ? "2026-09-01T00:00:00Z" : "2026-09-04T00:00:00Z";
        event.run(`${id}-${revision}`, id, id, `patient-${patient}`, practice,
          ["pending", "scheduled", "completed", "cancelled"][revision], eventAt);
        link.run(id, `synthetic-observation-${revision}`, eventAt);
      }
    }
  }
  db.exec("COMMIT; ANALYZE");
  const cases = [
    ["first", null, "2026-09-03T00:00:00Z", "practice-0"],
    ["encounter-tie", ["2026-08-12T00:00:00Z", "encounter:p0-057"], "2026-09-03T00:00:00Z", "practice-0"],
    ["order-tie", ["2026-08-12T00:00:00Z", "order:p0-057"], "2026-09-03T00:00:00Z", "practice-0"],
    ["older-source", null, "2026-08-15T00:00:00Z", "practice-0"],
    ["wrong-practice", null, "2026-09-03T00:00:00Z", "practice-2"],
    ["before-created", null, "2026-07-01T00:00:00Z", "practice-0"],
  ];
  function evaluate() {
    return cases.flatMap(([name, position, cutoff, practice]) => templates.map((template, index) => {
      const sql = template.sql.replace(index === 0 ? "${encounterCursor.sql}" : "${cursor.sql}", position ? template.cursor : "");
      assert.ok(!sql.includes("${"));
      const binds = index === 0 ? [practice, "patient-0", cutoff]
        : [cutoff, cutoff, practice, "patient-0", cutoff, cutoff, cutoff];
      if (position) binds.push(position[0], position[0], position[1]);
      binds.push(41);
      const rows = db.prepare(sql).all(...binds);
      if (name === "wrong-practice" || name === "before-created") assert.equal(rows.length, 0);
      if (name === "first") {
        assert.equal(rows.length, 41);
        if (index === 1) assert.ok(rows.every(row => row.latest_fulfillment_status === "completed" && row.linked_result_count === 3));
      }
      return { name: `${name}-${index === 0 ? "encounters" : "orders"}`, rows,
        plan: db.prepare("EXPLAIN QUERY PLAN " + sql).all(...binds).map(row => row.detail) };
    }));
  }
  const writes = [
    [encounterSql, ["probe", "patient-0", "practice-0", "2026-09-01", "2026-09-01", "2026-09-01"]],
    [eventSql, ["probe", "p0-000", "p0-000", "patient-0", "practice-0", "completed", "2026-09-01"]],
    [linkSql, ["p0-000", "probe", "2026-09-01"]],
  ];
  const opcodes = ([sql, binds]) => db.prepare("EXPLAIN " + sql).all(...binds).filter(row => row.opcode === "IdxInsert").length;
  const baseline = evaluate();
  const baselineOps = writes.map(opcodes);
  const experiments = definitions.map(([name, table, columns], index) => {
    const indexName = `r29_candidate_${name}`;
    const ddl = `CREATE INDEX ${indexName} ON ${table}(${columns})`;
    db.exec(ddl + "; ANALYZE");
    const current = evaluate();
    const evidence = baseline.map((before, i) => {
      assert.deepEqual(current[i].rows, before.rows, before.name);
      return { name: before.name, baselinePlan: before.plan, candidatePlan: current[i].plan,
        returnedRows: before.rows.length, rowsEqual: true };
    });
    const storage = db.prepare("SELECT SUM(pgsize) AS bytes, SUM(ncell) AS cells, COUNT(*) AS pages FROM dbstat WHERE name=?").get(indexName);
    assert.ok(storage.bytes > 0);
    const candidateOps = opcodes(writes[index]);
    assert.equal(candidateOps, baselineOps[index] + 1);
    // Execute a synthetic insert and roll it back, verifying the probe is accepted.
    db.exec("BEGIN");
    assert.equal(db.prepare(writes[index][0]).run(...writes[index][1]).changes, 1);
    db.exec("ROLLBACK");
    db.exec(`DROP INDEX ${indexName}; ANALYZE`);
    return { name, ddl, storage, insertIdxInsertOpcodes: { baseline: baselineOps[index], candidate: candidateOps },
      rolledBackSyntheticInsert: true, evidence };
  });
  console.log(JSON.stringify({ kind: "local-sqlite-timeline-index-assessment", node: process.version,
    sqlite: db.prepare("SELECT sqlite_version() AS version").get().version,
    schemaSha256: hash(schema), sourceSha256: Object.fromEntries(paths.map((path, i) => [path, hash(sources[i])])),
    syntheticRows: { encounters: 360, plans: 360, orders: 360, fulfillment: 1440, links: 1440 },
    experiments, d1RowsRead: null, d1RowsWritten: null, workerCpuMs: null, remoteRequests: 0 }, null, 2));
} finally { db.close(); }
