// Local-only R29-04-B assessment. No database filename, network or credentials accepted.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const migrationPaths = ["../migrations/0003_longitudinal_patient_records.sql", "../migrations/0004_encounter_snapshot_revisions.sql"];
const migrations = migrationPaths.map(read);
const reader = read("../src/patient-core/observation-reader.ts");
// Fail loudly on query shape drift; use actual source SQL, not a maintained copy.
const sqlTemplates = [...reader.matchAll(/`(SELECT[\s\S]*?)`/g)].map(match => match[1]);
assert.equal(sqlTemplates.length, 2);
const cursorSql = reader.match(/sql: `([\s\S]*?)`/)?.[1];
assert.ok(cursorSql?.includes("o.id < ?"));
assert.ok(sqlTemplates.every(sql => sql.includes("${cursor.sql}")));
const db = new DatabaseSync(":memory:");
try {
  for (const migration of migrations) db.exec(migration);
  // Synthetic planner fixture only: not a migration/FK/clinical integrity rehearsal.
  db.exec("PRAGMA foreign_keys=OFF");
  const snapshot = db.prepare("INSERT INTO patient_encounter_snapshots (id,encounter_id,patient_id,practice_id,revision,payload_ciphertext,payload_iv,payload_auth_tag,created_by,created_at) VALUES (?,?,?,?,?,'synthetic','synthetic','synthetic','synthetic',?)");
  const observationSql = "INSERT INTO patient_observations (id,encounter_id,patient_id,practice_id,canonical_key,observed_at,verification,payload_ciphertext,payload_iv,payload_auth_tag,created_by,created_at,snapshot_revision) VALUES (?,?,?,?,?,?,?,'synthetic','synthetic','synthetic','synthetic',?,?)";
  const observation = db.prepare(observationSql);
  db.exec("BEGIN");
  for (let patient = 0; patient < 3; patient++) {
    const practiceId = patient < 2 ? "practice-0" : "practice-2";
    for (let encounter = 0; encounter < 20; encounter++) {
      const encounterId = `e-${patient}-${String(encounter).padStart(2, "0")}`;
      const observed = `2026-08-${String(encounter + 1).padStart(2, "0")}T00:00:00Z`;
      for (let revision = 1; revision <= 2; revision++) {
        const created = `2026-09-0${revision}T00:00:00Z`;
        snapshot.run(`${encounterId}-${revision}`, encounterId, `patient-${patient}`, practiceId, revision, created);
        for (let row = 0; row < 80; row++) {
          observation.run(`${encounterId}-${revision}-${String(row).padStart(2, "0")}`, encounterId,
            `patient-${patient}`, practiceId, row % 10 === 0 ? "raw:synthetic" : `key-${row % 9}`,
            observed, row % 13 === 0 ? "rejected" : "confirmed", created, revision);
        }
      }
    }
  }
  db.exec("COMMIT; ANALYZE");
  const sourceVersion = "2026-09-03T00:00:00Z";
  function query(index, position, cutoff = sourceVersion, practice = "practice-0") {
    const sql = sqlTemplates[index].replace("${cursor.sql}", position ? cursorSql : "");
    assert.ok(!sql.includes("${"));
    const binds = [practice, "patient-0", cutoff, cutoff];
    if (position) binds.push(position.observed_at, position.observed_at, position.created_at,
      position.observed_at, position.created_at, position.id);
    if (index === 1) binds.push(80);
    return {
      sql, binds,
      plan: db.prepare("EXPLAIN QUERY PLAN " + sql).all(...binds).map(row => row.detail),
      rows: db.prepare(sql).all(...binds),
    };
  }
  // Derive a real deep keyset position from the unmodified SQL, including ties.
  let position;
  for (let page = 0; page < 8; page++) {
    const rows = query(1, position).rows;
    assert.equal(rows.length, 80);
    position = rows.at(-1);
  }
  const cases = [
    ["first", undefined, sourceVersion, "practice-0"],
    ["deep", position, sourceVersion, "practice-0"],
    ["older-source", undefined, "2026-09-01T12:00:00Z", "practice-0"],
    ["wrong-practice", undefined, sourceVersion, "practice-2"],
  ];
  const evaluate = () => cases.flatMap(([name, cursor, cutoff, practice]) => [0, 1].map(index => ({
    name: `${name}-${index === 0 ? "count" : "page"}`,
    ...query(index, cursor, cutoff, practice),
  })));
  const baseline = evaluate();
  const probeBinds = ["probe", "e-0-00", "patient-0", "practice-0", "synthetic", "2026-09-01", "confirmed", "2026-09-01", 1];
  const insertOpcodes = () => db.prepare("EXPLAIN " + observationSql).all(...probeBinds).filter(row => row.opcode === "IdxInsert").length;
  const baselineInsertOpcodes = insertOpcodes();
  const candidateSql = "CREATE INDEX r29_candidate_observation_history ON patient_observations(practice_id,patient_id,observed_at DESC,created_at DESC,id DESC)";
  db.exec(candidateSql + "; ANALYZE");
  const candidate = evaluate();
  const candidateInsertOpcodes = insertOpcodes();
  assert.equal(candidateInsertOpcodes, baselineInsertOpcodes + 1);
  const candidateStorage = db.prepare("SELECT SUM(pgsize) AS bytes, SUM(ncell) AS cells, COUNT(*) AS pages FROM dbstat WHERE name='r29_candidate_observation_history'").get();
  assert.ok(candidateStorage.bytes > 0);
  db.exec("BEGIN");
  assert.equal(observation.run(...probeBinds).changes, 1);
  db.exec("ROLLBACK");
  const evidence = baseline.map((before, index) => {
    const after = candidate[index];
    assert.deepEqual(after.rows, before.rows, before.name);
    if (before.name.startsWith("wrong-practice")) {
      if (before.name.endsWith("page")) assert.equal(before.rows.length, 0);
      else assert.equal(before.rows[0].source_row_count, 0);
    }
    return {
      name: before.name, baselinePlan: before.plan, candidatePlan: after.plan,
      returnedRows: before.rows.length,
      counts: before.name.endsWith("count") ? before.rows[0] : undefined,
      rowsEqual: true, rowsRead: null,
    };
  });
  assert.equal(baseline[0].rows[0].source_row_count, 1600);
  assert.equal(baseline[1].rows.length, 80);
  assert.ok(!candidate[1].plan.some(detail => detail.includes("TEMP B-TREE")));
  console.log(JSON.stringify({
    kind: "local-sqlite-observation-plan-assessment", node: process.version,
    sqlite: db.prepare("SELECT sqlite_version() AS version").get().version,
    schemaScope: migrationPaths, schemaSha256: createHash("sha256").update(migrations.join("\n")).digest("hex"),
    readerSha256: createHash("sha256").update(reader).digest("hex"),
    syntheticRows: { observations: 9600, snapshots: 120, patients: 3 },
    candidateSql, evidence, candidateStorage,
    compiledInsertIdxInsertOpcodes: { baseline: baselineInsertOpcodes, candidate: candidateInsertOpcodes },
    rolledBackSyntheticInsert: true,
    d1RowsRead: null, d1RowsWritten: null, workerCpuMs: null, remoteRequests: 0,
  }, null, 2));
} finally {
  db.close();
}
