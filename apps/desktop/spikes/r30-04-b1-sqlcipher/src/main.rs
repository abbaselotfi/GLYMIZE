use rusqlite::backup::Backup;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde_json::{json, Value};
use std::env;
use std::error::Error;
use std::ffi::c_void;
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

type AnyResult<T> = Result<T, Box<dyn Error>>;

const WORKSPACE_ID: &str = "00000000-0000-4000-8000-00000000b001";
const SCHEMA_VERSION: i64 = 1;
const COHORT_SIZE: usize = 5_000;
const WARM_RUNS: usize = 200;
const COLD_RUNS: usize = 20;
const STORAGE_CANARY: &str = "GLYMIZE_B1_SYNTHETIC_STORAGE_CANARY_9F31";
const CRASH_CANARY: &str = "GLYMIZE_B1_SYNTHETIC_CRASH_CANARY_72A4";
const UNSENT_OPERATION_ID: &str = "00000000-0000-4000-8000-00000000f001";
const CRASH_OPERATION_ID: &str = "00000000-0000-4000-8000-00000000f002";

fn failure(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(io::Error::other(message.into()))
}

fn stage(name: &str) {
    eprintln!("[R30-04-B1] {name}");
}

fn synthetic_database_key() -> [u8; 32] {
    let mut key = [0_u8; 32];
    for (index, byte) in key.iter_mut().enumerate() {
        *byte = ((index as u8).wrapping_mul(37)).wrapping_add(19);
    }
    key
}

fn synthetic_backup_key() -> [u8; 32] {
    let mut key = synthetic_database_key();
    for byte in &mut key {
        *byte ^= 0xa5;
    }
    key
}

fn synthetic_wrong_key() -> [u8; 32] {
    let mut key = synthetic_database_key();
    key[0] ^= 0xff;
    key
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn hex_decode_32(value: &str) -> AnyResult<[u8; 32]> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(failure("SYNTHETIC_KEY_INPUT_INVALID"));
    }

    let mut result = [0_u8; 32];
    for (index, slot) in result.iter_mut().enumerate() {
        *slot = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)?;
    }
    Ok(result)
}

fn raw_key_spec(key: &[u8; 32]) -> [u8; 67] {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut spec = [0_u8; 67];
    spec[..2].copy_from_slice(b"x'");
    for (index, byte) in key.iter().enumerate() {
        spec[2 + index * 2] = HEX[(byte >> 4) as usize];
        spec[3 + index * 2] = HEX[(byte & 15) as usize];
    }
    spec[66] = b'\'';
    spec
}

fn apply_raw_key(connection: &Connection, key: &[u8; 32]) -> AnyResult<()> {
    // SQLCipher treats 32 binary bytes as a passphrase. The native raw-key
    // interface requires x'<64 hex digits>', with an explicit 67-byte length.
    // This synthetic-only harness does not establish production zeroization.
    let spec = raw_key_spec(key);
    let status = unsafe {
        rusqlite::ffi::sqlite3_key(
            connection.handle(),
            spec.as_ptr().cast::<c_void>(),
            spec.len() as i32,
        )
    };
    if status != rusqlite::ffi::SQLITE_OK {
        return Err(failure(format!("SQLCIPHER_KEY_FAILED:{status}")));
    }
    Ok(())
}

fn cipher_version(connection: &Connection) -> AnyResult<String> {
    let version: String =
        connection.pragma_query_value(None, "cipher_version", |row| row.get(0))?;
    if version.trim().is_empty() {
        return Err(failure("SQLCIPHER_IDENTITY_MISSING"));
    }
    Ok(version)
}

fn configure_connection(connection: &Connection) -> AnyResult<()> {
    connection.execute_batch(
        "PRAGMA cipher_memory_security = OFF;
         PRAGMA foreign_keys = ON;
         PRAGMA trusted_schema = OFF;
         PRAGMA temp_store = MEMORY;
         PRAGMA secure_delete = ON;
         PRAGMA synchronous = FULL;
         PRAGMA mmap_size = 0;
         PRAGMA cache_size = -4096;
         PRAGMA wal_autocheckpoint = 0;",
    )?;

    let journal_mode: String =
        connection.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
    if !journal_mode.eq_ignore_ascii_case("wal") {
        return Err(failure(format!("WAL_MODE_NOT_ACTIVE:{journal_mode}")));
    }

    let temp_store: i64 = connection.pragma_query_value(None, "temp_store", |row| row.get(0))?;
    if temp_store != 2 {
        return Err(failure(format!("TEMP_STORE_NOT_MEMORY:{temp_store}")));
    }

    let synchronous: i64 = connection.pragma_query_value(None, "synchronous", |row| row.get(0))?;
    if synchronous != 2 {
        return Err(failure(format!("SYNCHRONOUS_NOT_FULL:{synchronous}")));
    }
    Ok(())
}

fn open_keyed(path: &Path, key: &[u8; 32], create: bool) -> AnyResult<Connection> {
    let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    if create {
        flags |= OpenFlags::SQLITE_OPEN_CREATE;
    }
    let connection = Connection::open_with_flags(path, flags)?;
    apply_raw_key(&connection, key)?;
    Ok(connection)
}

fn verify_workspace(connection: &Connection) -> AnyResult<()> {
    let identity: Option<(String, i64)> = connection
        .query_row(
            "SELECT workspace_id, schema_version FROM spike_metadata LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    if identity != Some((WORKSPACE_ID.to_owned(), SCHEMA_VERSION)) {
        return Err(failure("WORKSPACE_OR_SCHEMA_IDENTITY_MISMATCH"));
    }
    Ok(())
}

fn create_schema(connection: &Connection) -> AnyResult<()> {
    connection.execute_batch(
        "CREATE TABLE spike_metadata (
             workspace_id TEXT PRIMARY KEY NOT NULL,
             schema_version INTEGER NOT NULL
         ) STRICT;
         CREATE TABLE synthetic_patient (
             patient_id TEXT PRIMARY KEY NOT NULL,
             lookup_token BLOB NOT NULL,
             display_label TEXT NOT NULL,
             padding BLOB NOT NULL
         ) STRICT;
         CREATE UNIQUE INDEX idx_synthetic_patient_lookup_token
             ON synthetic_patient(lookup_token);
         CREATE TABLE synthetic_outbox (
             operation_id TEXT PRIMARY KEY NOT NULL,
             payload TEXT NOT NULL,
             state TEXT NOT NULL CHECK (state IN ('pending', 'acknowledged')),
             created_sequence INTEGER NOT NULL
         ) STRICT;",
    )?;
    connection.execute(
        "INSERT INTO spike_metadata(workspace_id, schema_version) VALUES (?1, ?2)",
        params![WORKSPACE_ID, SCHEMA_VERSION],
    )?;
    Ok(())
}

fn lookup_token(index: usize) -> [u8; 32] {
    let mut token = [0_u8; 32];
    let bytes = (index as u64).to_le_bytes();
    for chunk in token.chunks_exact_mut(bytes.len()) {
        chunk.copy_from_slice(&bytes);
    }
    token
}

fn seed_synthetic_data(connection: &mut Connection) -> AnyResult<()> {
    stage("seed-transaction-open");
    let transaction = connection.transaction()?;
    {
        let mut statement = transaction.prepare(
            "INSERT INTO synthetic_patient(patient_id, lookup_token, display_label, padding)
             VALUES (?1, ?2, ?3, ?4)",
        )?;
        let padding = vec![0x5a_u8; 512];
        for index in 0..COHORT_SIZE {
            let patient_id = format!("synthetic-patient-{index:06}");
            let token = lookup_token(index);
            let display_label = format!("Synthetic record {index:06}");
            statement.execute(params![
                patient_id,
                token.as_slice(),
                display_label,
                padding.as_slice(),
            ])?;
        }
    }
    stage("seed-outbox");
    transaction.execute(
        "INSERT INTO synthetic_outbox(operation_id, payload, state, created_sequence)
         VALUES (?1, ?2, 'pending', 1)",
        params![
            UNSENT_OPERATION_ID,
            format!("{{\"syntheticCanary\":\"{STORAGE_CANARY}\"}}")
        ],
    )?;
    stage("seed-commit");
    transaction.commit()?;

    stage("seed-temp-sort");
    connection.execute_batch(
        "CREATE TEMP TABLE temp_sort_probe(value TEXT NOT NULL);
         INSERT INTO temp_sort_probe(value)
         SELECT display_label || hex(padding) FROM synthetic_patient;
         SELECT value FROM temp_sort_probe ORDER BY value DESC LIMIT 1;",
    )?;
    stage("seed-complete");
    Ok(())
}

fn collect_compile_options(connection: &Connection) -> AnyResult<Vec<String>> {
    let mut statement = connection.prepare("PRAGMA compile_options")?;
    let options = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    if !options
        .iter()
        .any(|option| option == "TEMP_STORE=2" || option == "TEMP_STORE=3")
    {
        return Err(failure("SQLCIPHER_TEMP_STORE_COMPILE_POLICY_MISSING"));
    }
    Ok(options)
}

fn verify_integrity(connection: &Connection) -> AnyResult<()> {
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(failure(format!("SQLITE_INTEGRITY_FAILED:{integrity}")));
    }

    let mut statement = connection.prepare("PRAGMA cipher_integrity_check")?;
    let results = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    if !results.is_empty() && results.iter().any(|value| value != "ok") {
        return Err(failure(format!(
            "SQLCIPHER_INTEGRITY_FAILED:{}",
            results.join("|")
        )));
    }
    Ok(())
}

fn verify_indexed_lookup(connection: &Connection) -> AnyResult<String> {
    let plan: String = connection.query_row(
        "EXPLAIN QUERY PLAN
         SELECT patient_id FROM synthetic_patient WHERE lookup_token = ?1",
        params![lookup_token(COHORT_SIZE / 2).as_slice()],
        |row| row.get(3),
    )?;
    if !plan.contains("idx_synthetic_patient_lookup_token") {
        return Err(failure(format!("INDEX_NOT_USED:{plan}")));
    }

    let patient_id: String = connection.query_row(
        "SELECT patient_id FROM synthetic_patient WHERE lookup_token = ?1",
        params![lookup_token(COHORT_SIZE / 2).as_slice()],
        |row| row.get(0),
    )?;
    if patient_id != format!("synthetic-patient-{:06}", COHORT_SIZE / 2) {
        return Err(failure("INDEXED_LOOKUP_RETURNED_WRONG_RECORD"));
    }
    Ok(plan)
}

fn percentile(sorted_values: &[u64], percentile: f64) -> u64 {
    if sorted_values.is_empty() {
        return 0;
    }
    let rank = ((sorted_values.len() as f64 * percentile).ceil() as usize).saturating_sub(1);
    sorted_values[rank.min(sorted_values.len() - 1)]
}

fn latency_summary(mut values: Vec<u64>) -> Value {
    values.sort_unstable();
    json!({
        "runs": values.len(),
        "unit": "microseconds",
        "min": values.first().copied().unwrap_or(0),
        "p50": percentile(&values, 0.50),
        "p95": percentile(&values, 0.95),
        "max": values.last().copied().unwrap_or(0)
    })
}

fn benchmark_lookup(path: &Path, key: &[u8; 32], connection: &Connection) -> AnyResult<Value> {
    let mut warm = Vec::with_capacity(WARM_RUNS);
    {
        let mut statement = connection
            .prepare("SELECT patient_id FROM synthetic_patient WHERE lookup_token = ?1")?;
        for run in 0..WARM_RUNS {
            let token = lookup_token((run * 97) % COHORT_SIZE);
            let started = Instant::now();
            let _: String = statement.query_row(params![token.as_slice()], |row| row.get(0))?;
            warm.push(started.elapsed().as_micros() as u64);
        }
    }

    let mut cold = Vec::with_capacity(COLD_RUNS);
    for run in 0..COLD_RUNS {
        let token = lookup_token((run * 211) % COHORT_SIZE);
        let started = Instant::now();
        let cold_connection = open_keyed(path, key, false)?;
        verify_workspace(&cold_connection)?;
        let _: String = cold_connection.query_row(
            "SELECT patient_id FROM synthetic_patient WHERE lookup_token = ?1",
            params![token.as_slice()],
            |row| row.get(0),
        )?;
        drop(cold_connection);
        cold.push(started.elapsed().as_micros() as u64);
    }

    Ok(json!({
        "cohortSize": COHORT_SIZE,
        "warmExactLookup": latency_summary(warm),
        "coldOpenKeyVerifyAndExactLookup": latency_summary(cold),
        "claimBoundary": "synthetic spike measurements only; not a production SLO or plaintext comparison"
    }))
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty()
        && haystack
            .windows(needle.len())
            .any(|window| window == needle)
}

fn files_under(root: &Path) -> AnyResult<Vec<PathBuf>> {
    let mut files = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path.is_file() {
                files.push(path);
            }
        }
    }
    files.sort();
    Ok(files)
}

fn assert_canaries_absent(root: &Path, canaries: &[&str]) -> AnyResult<Vec<Value>> {
    let mut inventory = Vec::new();
    for path in files_under(root)? {
        let bytes = fs::read(&path)?;
        for canary in canaries {
            if contains_bytes(&bytes, canary.as_bytes()) {
                return Err(failure(format!(
                    "PLAINTEXT_CANARY_FOUND:{}:{}",
                    canary,
                    path.display()
                )));
            }
        }
        inventory.push(json!({
            "path": path.file_name().and_then(|name| name.to_str()).unwrap_or("unknown"),
            "bytes": bytes.len()
        }));
    }
    Ok(inventory)
}

fn expect_unreadable(path: &Path, key: Option<&[u8; 32]>) -> AnyResult<String> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    if let Some(key) = key {
        apply_raw_key(&connection, key)?;
    }
    match connection.query_row("SELECT count(*) FROM sqlite_master", [], |row| {
        row.get::<_, i64>(0)
    }) {
        Ok(_) => Err(failure(
            "ENCRYPTED_DATABASE_WAS_READABLE_WITH_INVALID_KEY_STATE",
        )),
        Err(error) => Ok(error.to_string()),
    }
}

fn verify_raw_key_interoperability(root: &Path) -> AnyResult<Value> {
    // Fixed public synthetic fixture; intentionally independent of raw_key_spec.
    const FIXTURE: &str = "x'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'";
    let key: [u8; 32] = std::array::from_fn(|index| index as u8);
    let path = root.join("raw-key-interop.db");
    let writer = Connection::open(&path)?;
    writer.pragma_update(None, "key", FIXTURE)?;
    writer.execute_batch(
        "CREATE TABLE raw_key_probe(value INTEGER NOT NULL); INSERT INTO raw_key_probe VALUES (1);",
    )?;
    drop(writer);

    let native = open_keyed(&path, &key, false)?;
    let initial: i64 = native.query_row("SELECT value FROM raw_key_probe", [], |row| row.get(0))?;
    if initial != 1 {
        return Err(failure("RAW_KEY_PRAGMA_TO_NATIVE_MISMATCH"));
    }
    native.execute("UPDATE raw_key_probe SET value = 2", [])?;
    drop(native);
    let reader = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    reader.pragma_update(None, "key", FIXTURE)?;
    let updated: i64 = reader.query_row("SELECT value FROM raw_key_probe", [], |row| row.get(0))?;
    if updated != 2 {
        return Err(failure("RAW_KEY_NATIVE_TO_PRAGMA_MISMATCH"));
    }
    drop(reader);

    let passphrase = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let status = unsafe {
        rusqlite::ffi::sqlite3_key(passphrase.handle(), key.as_ptr().cast::<c_void>(), 32)
    };
    if status != rusqlite::ffi::SQLITE_OK {
        return Err(failure("BINARY_PASSPHRASE_PROBE_SETUP_FAILED"));
    }
    if passphrase
        .query_row("SELECT count(*) FROM sqlite_master", [], |row| {
            row.get::<_, i64>(0)
        })
        .is_ok()
    {
        return Err(failure("RAW_KEY_DATABASE_ACCEPTED_BINARY_PASSPHRASE"));
    }
    drop(passphrase);
    expect_unreadable(&path, None)?;
    expect_unreadable(&path, Some(&synthetic_wrong_key()))?;
    Ok(json!({
        "pragmaToNative": "pass", "nativeToPragma": "pass",
        "sameBytesAsBinaryPassphraseRejected": "pass",
        "wrongKeyRejected": "pass", "noKeyRejected": "pass"
    }))
}

fn tamper_copy(source: &Path, destination: &Path) -> AnyResult<()> {
    fs::copy(source, destination)?;
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(destination)?;
    if file.metadata()?.len() < 512 {
        return Err(failure("DATABASE_TOO_SMALL_FOR_TAMPER_PROBE"));
    }
    file.seek(SeekFrom::Start(128))?;
    let mut byte = [0_u8; 1];
    file.read_exact(&mut byte)?;
    byte[0] ^= 0x80;
    file.seek(SeekFrom::Start(128))?;
    file.write_all(&byte)?;
    file.sync_all()?;
    Ok(())
}

fn backup_round_trip(
    source_path: &Path,
    source_key: &[u8; 32],
    backup_path: &Path,
    backup_key: &[u8; 32],
) -> AnyResult<Value> {
    let source = open_keyed(source_path, source_key, false)?;
    verify_workspace(&source)?;
    let mut destination = open_keyed(backup_path, backup_key, true)?;
    cipher_version(&destination)?;
    destination.execute_batch(
        "PRAGMA cipher_memory_security = OFF;
         PRAGMA temp_store = MEMORY;
         PRAGMA synchronous = FULL;",
    )?;
    {
        let backup = Backup::new(&source, &mut destination)?;
        backup.run_to_completion(64, Duration::from_millis(5), None)?;
    }
    drop(destination);
    drop(source);

    let restored = open_keyed(backup_path, backup_key, false)?;
    verify_workspace(&restored)?;
    verify_integrity(&restored)?;
    let state: String = restored.query_row(
        "SELECT state FROM synthetic_outbox WHERE operation_id = ?1",
        params![UNSENT_OPERATION_ID],
        |row| row.get(0),
    )?;
    if state != "pending" {
        return Err(failure("BACKUP_DID_NOT_PRESERVE_UNSENT_OPERATION"));
    }
    let count: i64 = restored.query_row("SELECT count(*) FROM synthetic_patient", [], |row| {
        row.get(0)
    })?;
    if count != COHORT_SIZE as i64 {
        return Err(failure(format!("BACKUP_COHORT_MISMATCH:{count}")));
    }
    drop(restored);

    let no_key_error = expect_unreadable(backup_path, None)?;
    let wrong_key_error = expect_unreadable(backup_path, Some(source_key))?;

    let bytes = fs::read(backup_path)?;
    if contains_bytes(&bytes, STORAGE_CANARY.as_bytes()) {
        return Err(failure("BACKUP_CONTAINS_PLAINTEXT_CANARY"));
    }

    Ok(json!({
        "bytes": bytes.len(),
        "cohortRows": count,
        "unsentOperationState": state,
        "separateSyntheticBackupKey": true,
        "noKeyRejected": {"status": "pass", "errorClass": no_key_error},
        "sourceDatabaseKeyRejected": {"status": "pass", "errorClass": wrong_key_error}
    }))
}

fn crash_child(path: &Path, operation_id: &str) -> AnyResult<()> {
    let mut encoded_key = String::new();
    io::stdin().read_to_string(&mut encoded_key)?;
    let key = hex_decode_32(encoded_key.trim())?;
    let connection = open_keyed(path, &key, false)?;
    verify_workspace(&connection)?;
    configure_connection(&connection)?;
    connection.execute(
        "INSERT INTO synthetic_outbox(operation_id, payload, state, created_sequence)
         VALUES (?1, ?2, 'pending', 2)",
        params![
            operation_id,
            format!("{{\"syntheticCanary\":\"{CRASH_CANARY}\"}}")
        ],
    )?;
    io::stdout().write_all(b"CRASH_CHILD_COMMITTED\n")?;
    io::stdout().flush()?;
    std::process::abort();
}

fn verify_crash_recovery(root: &Path, path: &Path, key: &[u8; 32]) -> AnyResult<Value> {
    let executable = env::current_exe()?;
    let mut child = Command::new(executable)
        .arg("--crash-child")
        .arg(path)
        .arg(CRASH_OPERATION_ID)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .ok_or_else(|| failure("CRASH_CHILD_STDIN_MISSING"))?
        .write_all(hex_encode(key).as_bytes())?;
    let output = child.wait_with_output()?;
    if output.status.success() {
        return Err(failure("CRASH_CHILD_DID_NOT_ABORT"));
    }
    if !String::from_utf8_lossy(&output.stdout).contains("CRASH_CHILD_COMMITTED") {
        return Err(failure("CRASH_CHILD_DID_NOT_CONFIRM_COMMIT"));
    }

    let wal_path = PathBuf::from(format!("{}-wal", path.display()));
    let wal_bytes = fs::read(&wal_path)?;
    if wal_bytes.len() <= 32 {
        return Err(failure("CRASH_WAL_NOT_PERSISTED"));
    }
    if contains_bytes(&wal_bytes, CRASH_CANARY.as_bytes()) {
        return Err(failure("CRASH_WAL_CONTAINS_PLAINTEXT_CANARY"));
    }
    let side_files_before_recovery = assert_canaries_absent(root, &[STORAGE_CANARY, CRASH_CANARY])?;

    let recovered = open_keyed(path, key, false)?;
    verify_workspace(&recovered)?;
    verify_integrity(&recovered)?;
    let state: String = recovered.query_row(
        "SELECT state FROM synthetic_outbox WHERE operation_id = ?1",
        params![CRASH_OPERATION_ID],
        |row| row.get(0),
    )?;
    if state != "pending" {
        return Err(failure("CRASH_RECOVERY_LOST_COMMITTED_OPERATION"));
    }
    drop(recovered);

    Ok(json!({
        "childExitCode": output.status.code(),
        "walBytesBeforeRecovery": wal_bytes.len(),
        "recoveredOperationState": state,
        "sideFilesBeforeRecovery": side_files_before_recovery
    }))
}

#[derive(Clone, Copy)]
struct ProcessSnapshot {
    cpu_ms: f64,
    working_set_bytes: usize,
    peak_working_set_bytes: usize,
    total_physical_memory_bytes: u64,
}

#[cfg(windows)]
fn process_snapshot() -> AnyResult<ProcessSnapshot> {
    let script = format!(
        "$p=Get-Process -Id {}; \
         $m=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; \
         $c=if($null -eq $p.CPU){{0.0}}else{{[double]$p.CPU}}; \
         [Console]::Write($c.ToString('R',[Globalization.CultureInfo]::InvariantCulture) + '|' + \
         $p.WorkingSet64 + '|' + $p.PeakWorkingSet64 + '|' + $m)",
        std::process::id()
    );
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()?;
    if !output.status.success() {
        return Err(failure(format!(
            "WINDOWS_PROCESS_METRICS_FAILED:{}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    let text = String::from_utf8(output.stdout)?;
    let fields = text.trim().split('|').collect::<Vec<_>>();
    if fields.len() != 4 {
        return Err(failure(format!(
            "WINDOWS_PROCESS_METRICS_FORMAT_INVALID:{}",
            text.trim()
        )));
    }
    Ok(ProcessSnapshot {
        cpu_ms: fields[0].parse::<f64>()? * 1_000.0,
        working_set_bytes: fields[1].parse()?,
        peak_working_set_bytes: fields[2].parse()?,
        total_physical_memory_bytes: fields[3].parse()?,
    })
}

#[cfg(not(windows))]
fn process_snapshot() -> AnyResult<ProcessSnapshot> {
    Err(failure("R30_04_B1_REQUIRES_WINDOWS"))
}

fn run_spike(evidence_path: &Path) -> AnyResult<()> {
    if !cfg!(windows) {
        return Err(failure("R30_04_B1_REQUIRES_WINDOWS"));
    }

    stage("process-metrics-start");
    let started_epoch_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let run_started = Instant::now();
    let process_before = process_snapshot()?;
    let evidence_parent = evidence_path
        .parent()
        .ok_or_else(|| failure("EVIDENCE_PARENT_REQUIRED"))?;
    fs::create_dir_all(evidence_parent)?;
    let run_root = evidence_parent.join(format!("run-{}-{started_epoch_ms}", std::process::id()));
    fs::create_dir(&run_root)?;

    stage("raw-key-interoperability");
    let raw_key_interoperability = verify_raw_key_interoperability(&run_root)?;

    let database_path = run_root.join("clinic-spike.db");
    let tampered_path = run_root.join("clinic-spike-tampered.db");
    let backup_path = run_root.join("clinic-spike-backup.db");
    let database_key = synthetic_database_key();
    let backup_key = synthetic_backup_key();

    stage("database-create");
    let mut connection = open_keyed(&database_path, &database_key, true)?;
    let version = cipher_version(&connection)?;
    configure_connection(&connection)?;
    let compile_options = collect_compile_options(&connection)?;
    stage("schema-and-seed");
    create_schema(&connection)?;
    seed_synthetic_data(&mut connection)?;
    verify_workspace(&connection)?;
    verify_integrity(&connection)?;
    stage("integrity-and-index");
    let query_plan = verify_indexed_lookup(&connection)?;
    stage("side-file-scan");
    let side_files_during_wal = assert_canaries_absent(&run_root, &[STORAGE_CANARY])?;
    stage("lookup-benchmark");
    let benchmark = benchmark_lookup(&database_path, &database_key, &connection)?;

    let checkpoint: (i64, i64, i64) =
        connection.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
    if checkpoint.0 != 0 {
        return Err(failure(format!("WAL_CHECKPOINT_BUSY:{}", checkpoint.0)));
    }
    drop(connection);

    stage("negative-key-tests");
    let no_key_error = expect_unreadable(&database_path, None)?;
    let wrong_key_error = expect_unreadable(&database_path, Some(&synthetic_wrong_key()))?;

    stage("tamper-test");
    tamper_copy(&database_path, &tampered_path)?;
    let tampered_error = match open_keyed(&tampered_path, &database_key, false) {
        Ok(tampered) => {
            match tampered.query_row("SELECT count(*) FROM synthetic_patient", [], |row| {
                row.get::<_, i64>(0)
            }) {
                Ok(_) => return Err(failure("TAMPERED_DATABASE_WAS_READABLE")),
                Err(error) => error.to_string(),
            }
        }
        Err(error) => error.to_string(),
    };

    stage("backup-round-trip");
    let backup = backup_round_trip(&database_path, &database_key, &backup_path, &backup_key)?;
    stage("wal-crash-recovery");
    let crash_recovery = verify_crash_recovery(&run_root, &database_path, &database_key)?;
    let final_file_inventory = assert_canaries_absent(&run_root, &[STORAGE_CANARY, CRASH_CANARY])?;

    stage("process-metrics-end");
    let process_after = process_snapshot()?;
    let elapsed = run_started.elapsed();
    let cpu_ms = (process_after.cpu_ms - process_before.cpu_ms).max(0.0);
    let logical_cpus = thread::available_parallelism()?.get();
    let normalized_cpu_percent = if elapsed.as_secs_f64() > 0.0 {
        cpu_ms / elapsed.as_secs_f64() / 10.0 / logical_cpus as f64
    } else {
        0.0
    };

    let report = json!({
        "schema": "glymize.r30-04-b1.sqlcipher-spike-evidence.v2",
        "accepted": true,
        "scope": {
            "syntheticDataOnly": true,
            "tauriLinked": false,
            "rendererIpc": false,
            "authentication": false,
            "d1Migration": false,
            "runtimeActivation": false
        },
        "platform": {
            "os": env::var("OS").unwrap_or_else(|_| env::consts::OS.to_owned()),
            "architecture": env::consts::ARCH,
            "processor": env::var("PROCESSOR_IDENTIFIER").unwrap_or_else(|_| "unknown".to_owned()),
            "logicalCpus": logical_cpus,
            "totalPhysicalMemoryBytes": process_after.total_physical_memory_bytes
        },
        "cipher": {
            "version": version,
            "keyApi": "sqlite3_key",
            "keyMode": "raw-256-hex-blob",
            "keySpecBytes": 67,
            "compileOptions": compile_options,
            "tempStoreEffective": "MEMORY",
            "cipherMemorySecurity": "OFF in B1 after Windows VirtualLock failure; requires B2 review",
            "journalMode": "WAL",
            "synchronous": "FULL"
        },
        "checks": {
            "rawKeyInteroperability": raw_key_interoperability,
            "correctKeyAndWorkspaceIdentity": "pass",
            "noKeyRejected": {"status": "pass", "errorClass": no_key_error},
            "wrongKeyRejected": {"status": "pass", "errorClass": wrong_key_error},
            "tamperedDatabaseRejected": {"status": "pass", "errorClass": tampered_error},
            "integrity": "pass",
            "indexedExactLookup": {"status": "pass", "queryPlan": query_plan},
            "walCheckpoint": {"status": "pass", "result": [checkpoint.0, checkpoint.1, checkpoint.2]},
            "walCrashRecovery": crash_recovery,
            "sideFilePlaintextCanaryScan": {"status": "pass", "filesDuringWal": side_files_during_wal},
            "encryptedBackupRoundTrip": backup
        },
        "measurements": {
            "startedEpochMs": started_epoch_ms.to_string(),
            "elapsedMs": elapsed.as_secs_f64() * 1000.0,
            "processCpuMs": cpu_ms,
            "normalizedCpuPercentAcrossLogicalCpus": normalized_cpu_percent,
            "workingSetBytesAtEnd": process_after.working_set_bytes,
            "peakWorkingSetBytes": process_after.peak_working_set_bytes,
            "workerThreadStack": "Rust default",
            "lookup": benchmark,
            "diskFiles": final_file_inventory
        },
        "limitations": [
            "synthetic spike evidence only",
            "not a production SLO",
            "not a plaintext SQLite comparison",
            "does not authorize PHI or activate GLYMIZE runtime storage",
            "cipher_memory_security=ON failed on this Windows host after VirtualLock LastError 1453 and is deferred to the R30-04-B2 key protocol review",
            "file names, sizes, timestamps and access patterns remain visible"
        ]
    });
    stage("write-evidence");
    fs::write(evidence_path, serde_json::to_vec_pretty(&report)?)?;
    println!("R30_04_B1_ACCEPTED_TRUE");
    println!("Evidence: {}", evidence_path.display());
    println!("Artifacts: {}", run_root.display());
    Ok(())
}

fn main() -> AnyResult<()> {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    if arguments.first().and_then(|value| value.to_str()) == Some("--crash-child") {
        if arguments.len() != 3 {
            return Err(failure("CRASH_CHILD_ARGUMENTS_INVALID"));
        }
        let path = PathBuf::from(&arguments[1]);
        let operation_id = arguments[2]
            .to_str()
            .ok_or_else(|| failure("CRASH_OPERATION_ID_INVALID"))?;
        return crash_child(&path, operation_id);
    }

    if arguments.len() != 2 || arguments[0].to_str() != Some("--evidence") {
        return Err(failure(
            "USAGE: glymize-r30-04-b1-sqlcipher-spike --evidence <path>",
        ));
    }
    let evidence_path = PathBuf::from(&arguments[1]);
    let result = thread::Builder::new()
        .name("r30-04-b1-sqlcipher-spike".to_owned())
        .spawn(move || run_spike(&evidence_path).map_err(|error| error.to_string()))?
        .join()
        .map_err(|_| failure("SQLCIPHER_SPIKE_THREAD_PANICKED"))?;
    result.map_err(failure)
}

#[cfg(test)]
mod tests {
    use super::{
        hex_decode_32, hex_encode, latency_summary, lookup_token, raw_key_spec,
        synthetic_database_key,
    };

    #[test]
    fn raw_key_spec_preserves_every_byte_value_and_exact_format() {
        for value in 0..=255_u8 {
            let spec = raw_key_spec(&[value; 32]);
            assert_eq!(spec.len(), 67);
            assert_eq!(&spec[..2], b"x'");
            assert_eq!(spec[66], b'\'');
            assert_eq!(
                std::str::from_utf8(&spec[2..66]).unwrap(),
                format!("{value:02x}").repeat(32)
            );
        }
    }

    #[test]
    fn raw_key_spec_matches_independent_known_answer() {
        let key = std::array::from_fn(|index| index as u8);
        assert_eq!(
            &raw_key_spec(&key),
            b"x'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'"
        );
    }

    #[test]
    fn key_pipe_rejects_invalid_lengths_and_non_hex_input() {
        for invalid in [
            "".to_owned(),
            "0".repeat(63),
            "0".repeat(65),
            "z".repeat(64),
            "é".repeat(32),
        ] {
            assert!(hex_decode_32(&invalid).is_err());
        }
    }

    #[test]
    fn synthetic_key_pipe_encoding_round_trips() {
        let key = synthetic_database_key();
        assert_eq!(hex_decode_32(&hex_encode(&key)).unwrap(), key);
    }

    #[test]
    fn lookup_tokens_are_deterministic_and_distinct() {
        assert_eq!(lookup_token(42), lookup_token(42));
        assert_ne!(lookup_token(42), lookup_token(43));
    }

    #[test]
    fn latency_summary_uses_bounded_nearest_rank_percentiles() {
        let summary = latency_summary(vec![10, 20, 30, 40, 50]);
        assert_eq!(summary["p50"], 30);
        assert_eq!(summary["p95"], 50);
    }
}
