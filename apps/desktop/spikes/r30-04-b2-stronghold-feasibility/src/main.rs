use iota_stronghold::engine::runtime::memories::buffer::Buffer;
use iota_stronghold::procedures::{FatalProcedureError, UseSecret};
use iota_stronghold::{KeyProvider, Location, SnapshotPath, Stronghold};
use rusqlite::{Connection, OpenFlags};
use serde_json::json;
use std::env;
use std::error::Error;
use std::ffi::c_void;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zeroize::{Zeroize, Zeroizing};

type AnyResult<T> = Result<T, Box<dyn Error>>;

const CLIENT_PATH: &[u8] = b"glymize-r30-04-b2-synthetic-client";
const VAULT_PATH: &[u8] = b"database-custody";
const DATABASE_RECORD_PATH: &[u8] = b"synthetic-database-key";
const WRONG_RECORD_PATH: &[u8] = b"synthetic-wrong-key";
const SHORT_RECORD_PATH: &[u8] = b"synthetic-short-key";
const SYNTHETIC_VALUE: &str = "GLYMIZE_R30_04_B2_SYNTHETIC_ONLY";

fn failure(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(io::Error::other(message.into()))
}

fn synthetic_database_key() -> [u8; 32] {
    std::array::from_fn(|index| ((index as u8).wrapping_mul(37)).wrapping_add(19))
}

fn synthetic_wrong_key() -> [u8; 32] {
    let mut key = synthetic_database_key();
    key[0] ^= 0xff;
    key
}

fn synthetic_snapshot_key() -> [u8; 32] {
    std::array::from_fn(|index| ((index as u8).wrapping_mul(53)).wrapping_add(7))
}

fn location(record_path: &[u8]) -> Location {
    Location::generic(VAULT_PATH.to_vec(), record_path.to_vec())
}

fn raw_key_spec(key: &[u8]) -> Result<[u8; 67], FatalProcedureError> {
    if key.len() != 32 {
        return Err("SQLCIPHER_RAW_KEY_LENGTH_INVALID".to_owned().into());
    }
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut spec = [0_u8; 67];
    spec[..2].copy_from_slice(b"x'");
    for (index, byte) in key.iter().enumerate() {
        spec[2 + index * 2] = HEX[(byte >> 4) as usize];
        spec[3 + index * 2] = HEX[(byte & 15) as usize];
    }
    spec[66] = b'\'';
    Ok(spec)
}

struct ApplySqlCipherRawKey {
    handle: *mut rusqlite::ffi::sqlite3,
    source: Location,
}

impl UseSecret<1> for ApplySqlCipherRawKey {
    type Output = bool;

    fn use_secret(self, guard: [Buffer<u8>; 1]) -> Result<Self::Output, FatalProcedureError> {
        let borrowed = guard[0].borrow();
        let mut spec = raw_key_spec(borrowed.as_ref())?;
        let status = unsafe {
            rusqlite::ffi::sqlite3_key(
                self.handle,
                spec.as_ptr().cast::<c_void>(),
                spec.len() as i32,
            )
        };
        spec.zeroize();
        if status != rusqlite::ffi::SQLITE_OK {
            return Err(format!("SQLCIPHER_KEY_FAILED:{status}").into());
        }
        Ok(true)
    }

    fn source(&self) -> [Location; 1] {
        [self.source.clone()]
    }
}

fn apply_key_from_vault(
    client: &iota_stronghold::Client,
    connection: &Connection,
    source: Location,
) -> AnyResult<()> {
    let applied = ApplySqlCipherRawKey {
        handle: unsafe { connection.handle() },
        source,
    }
    .exec(client)?;
    if !applied {
        return Err(failure("STRONGHOLD_KEY_APPLICATION_DID_NOT_SUCCEED"));
    }
    Ok(())
}

fn open_database(path: &Path, create: bool) -> AnyResult<Connection> {
    let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    if create {
        flags |= OpenFlags::SQLITE_OPEN_CREATE;
    }
    Ok(Connection::open_with_flags(path, flags)?)
}

fn query_synthetic_value(connection: &Connection) -> AnyResult<String> {
    Ok(
        connection.query_row("SELECT value FROM custody_probe WHERE id = 1", [], |row| {
            row.get(0)
        })?,
    )
}

fn wrong_key_is_rejected(client: &iota_stronghold::Client, path: &Path) -> AnyResult<bool> {
    let connection = open_database(path, false)?;
    apply_key_from_vault(client, &connection, location(WRONG_RECORD_PATH))?;
    let rejected = query_synthetic_value(&connection).is_err();
    drop(connection);
    Ok(rejected)
}

fn run_feasibility(evidence_path: &Path) -> AnyResult<()> {
    if !cfg!(windows) {
        return Err(failure("R30_04_B2_STRONGHOLD_PROBE_REQUIRES_WINDOWS"));
    }
    let evidence_parent = evidence_path
        .parent()
        .ok_or_else(|| failure("EVIDENCE_PARENT_REQUIRED"))?;
    fs::create_dir_all(evidence_parent)?;
    let run_nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let run_root = evidence_parent.join(format!("run-{}-{run_nonce}", std::process::id()));
    fs::create_dir(&run_root)?;
    let database_path = run_root.join("synthetic.db");
    let snapshot_path = SnapshotPath::from_path(run_root.join("custody.stronghold"));

    let stronghold = Stronghold::default();
    let client = stronghold.create_client(CLIENT_PATH)?;
    let vault = client.vault(VAULT_PATH);
    vault.write_secret(
        location(DATABASE_RECORD_PATH),
        Zeroizing::new(synthetic_database_key().to_vec()),
    )?;
    vault.write_secret(
        location(WRONG_RECORD_PATH),
        Zeroizing::new(synthetic_wrong_key().to_vec()),
    )?;
    vault.write_secret(location(SHORT_RECORD_PATH), Zeroizing::new(vec![0x5a; 31]))?;

    let connection = open_database(&database_path, true)?;
    apply_key_from_vault(&client, &connection, location(DATABASE_RECORD_PATH))?;
    let cipher_version: String =
        connection.pragma_query_value(None, "cipher_version", |row| row.get(0))?;
    connection.execute_batch(
        "PRAGMA cipher_memory_security = OFF;
         CREATE TABLE custody_probe(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT;",
    )?;
    connection.execute(
        "INSERT INTO custody_probe(id, value) VALUES (1, ?1)",
        [SYNTHETIC_VALUE],
    )?;
    if query_synthetic_value(&connection)? != SYNTHETIC_VALUE {
        return Err(failure("INITIAL_STRONGHOLD_KEYED_READ_FAILED"));
    }
    drop(connection);

    let snapshot_key = KeyProvider::try_from(Zeroizing::new(synthetic_snapshot_key().to_vec()))?;
    stronghold.commit_with_keyprovider(&snapshot_path, &snapshot_key)?;
    stronghold.clear()?;
    let cleared_clone_has_record = client
        .record_exists(&location(DATABASE_RECORD_PATH))
        .unwrap_or(false);
    if cleared_clone_has_record {
        return Err(failure("STRONGHOLD_CLEAR_LEFT_RECORD_AVAILABLE"));
    }

    let loaded =
        stronghold.load_client_from_snapshot(CLIENT_PATH, &snapshot_key, &snapshot_path)?;
    let restored = open_database(&database_path, false)?;
    apply_key_from_vault(&loaded, &restored, location(DATABASE_RECORD_PATH))?;
    if query_synthetic_value(&restored)? != SYNTHETIC_VALUE {
        return Err(failure("SNAPSHOT_RELOAD_KEYED_READ_FAILED"));
    }
    drop(restored);

    if !wrong_key_is_rejected(&loaded, &database_path)? {
        return Err(failure("WRONG_STRONGHOLD_SECRET_OPENED_DATABASE"));
    }

    let short_key_connection = open_database(&database_path, false)?;
    let short_key_error =
        apply_key_from_vault(&loaded, &short_key_connection, location(SHORT_RECORD_PATH))
            .err()
            .ok_or_else(|| failure("SHORT_STRONGHOLD_SECRET_WAS_ACCEPTED"))?
            .to_string();
    drop(short_key_connection);
    if !short_key_error.contains("SQLCIPHER_RAW_KEY_LENGTH_INVALID") {
        return Err(failure("SHORT_STRONGHOLD_SECRET_ERROR_CLASS_MISMATCH"));
    }

    let remaining_handle = open_database(&database_path, false)?;
    apply_key_from_vault(&loaded, &remaining_handle, location(DATABASE_RECORD_PATH))?;
    stronghold.clear()?;
    let existing_handle_retains_native_key_copy =
        query_synthetic_value(&remaining_handle)? == SYNTHETIC_VALUE;
    if !existing_handle_retains_native_key_copy {
        return Err(failure(
            "EXPECTED_SQLCIPHER_HANDLE_COPY_BOUNDARY_NOT_OBSERVED",
        ));
    }
    drop(remaining_handle);

    let post_clear_connection = open_database(&database_path, false)?;
    let post_clear_new_handle_rejected = apply_key_from_vault(
        &loaded,
        &post_clear_connection,
        location(DATABASE_RECORD_PATH),
    )
    .is_err();
    drop(post_clear_connection);
    if !post_clear_new_handle_rejected {
        return Err(failure("CLEARED_STRONGHOLD_KEYED_NEW_HANDLE"));
    }

    let invalid_snapshot_key_length_rejected =
        KeyProvider::try_from(Zeroizing::new(vec![0x42; 31])).is_err();
    if !invalid_snapshot_key_length_rejected {
        return Err(failure("INVALID_SNAPSHOT_KEY_LENGTH_ACCEPTED"));
    }

    let report = json!({
        "schema": "glymize.r30-04-b2.stronghold-feasibility.v1",
        "accepted": false,
        "classification": "feasibility-evidence-only",
        "platform": {
            "os": env::var("OS").unwrap_or_else(|_| env::consts::OS.to_owned()),
            "architecture": env::consts::ARCH
        },
        "versions": {
            "iotaStronghold": "2.1.0",
            "sqlcipher": cipher_version,
            "rawKeyEncoding": "x'<64 lowercase hex digits>' / 67 bytes"
        },
        "checks": {
            "privateUseSecretToNativeSqlcipher": "pass",
            "procedureOutputContainsKeyBytes": false,
            "snapshotCommitClearReload": "pass",
            "wrongVaultSecretRejected": "pass",
            "shortVaultSecretRejectedBeforeSqlcipher": "pass",
            "clearRemovedVaultAccessForNewHandle": "pass",
            "existingSqlcipherHandleRetainsNativeKeyCopyAfterStrongholdClear": existing_handle_retains_native_key_copy,
            "invalidSnapshotKeyLengthRejected": invalid_snapshot_key_length_rejected
        },
        "scope": {
            "syntheticDataOnly": true,
            "tauriLinked": false,
            "rendererIpc": false,
            "persistentCustodyProtocolSelected": false,
            "runtimeActivation": false,
            "patientData": false
        },
        "limitations": [
            "SQLCipher necessarily copies key material into its native connection context",
            "Stronghold clear does not revoke an already-keyed SQLCipher handle",
            "all production handles and statements must close before custody clear or lock",
            "snapshot KDF, recovery, rotation, rewrap and replacement-device protocol remain unselected",
            "Stronghold memory behavior does not prove SQLCipher page, Argon2, renderer, crash-dump or hibernation protection"
            ,"stronghold-runtime 2.0.1 does not surface the sodium_mlock return value, so allocation success does not prove an operating-system page lock"
        ]
    });
    fs::write(evidence_path, serde_json::to_vec_pretty(&report)?)?;
    println!("R30_04_B2_STRONGHOLD_FEASIBILITY_COMPLETED");
    println!("Evidence: {}", evidence_path.display());
    Ok(())
}

fn run_allocation_probe(bytes: usize) -> AnyResult<()> {
    const MAX_ALLOCATION_PROBE_BYTES: usize = 16 * 1024 * 1024;
    if bytes == 0 || bytes > MAX_ALLOCATION_PROBE_BYTES {
        return Err(failure("ALLOCATION_PROBE_SIZE_OUT_OF_BOUNDS"));
    }
    let stronghold = Stronghold::default();
    let client = stronghold.create_client(b"allocation-probe-client")?;
    let vault = client.vault(b"allocation-probe-vault");
    let outcome = vault.write_secret(
        Location::generic(b"allocation-probe-vault".to_vec(), b"record".to_vec()),
        Zeroizing::new(vec![0xa5; bytes]),
    );
    let stored = outcome.is_ok();
    stronghold.clear()?;
    println!(
        "{}",
        serde_json::to_string(&json!({
            "schema": "glymize.r30-04-b2.stronghold-allocation-child.v1",
            "bytes": bytes,
            "stored": stored,
            "strongholdClearCompleted": true,
            "errorClass": if stored { "none" } else { "stronghold-allocation-rejected" },
            "syntheticDataOnly": true
        }))?
    );
    if stored {
        Ok(())
    } else {
        Err(failure("STRONGHOLD_ALLOCATION_REJECTED"))
    }
}

fn main() -> AnyResult<()> {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    if arguments.len() == 2 && arguments[0].to_str() == Some("--evidence") {
        return run_feasibility(&PathBuf::from(&arguments[1]));
    }
    if arguments.len() == 2 && arguments[0].to_str() == Some("--allocation-probe-bytes") {
        let bytes = arguments[1]
            .to_str()
            .ok_or_else(|| failure("ALLOCATION_PROBE_SIZE_NOT_UTF8"))?
            .parse::<usize>()?;
        return run_allocation_probe(bytes);
    }
    Err(failure(
        "USAGE: stronghold-feasibility --evidence <path> | --allocation-probe-bytes <1..16777216>",
    ))
}

#[cfg(test)]
mod tests {
    use super::{raw_key_spec, synthetic_database_key};

    #[test]
    fn raw_key_spec_is_exact_and_complete() {
        let spec = raw_key_spec(&synthetic_database_key()).unwrap();
        assert_eq!(spec.len(), 67);
        assert_eq!(&spec[..2], b"x'");
        assert_eq!(spec[66], b'\'');
        assert!(spec[2..66].iter().all(u8::is_ascii_hexdigit));
    }

    #[test]
    fn raw_key_spec_rejects_non_32_byte_secrets() {
        assert!(raw_key_spec(&[0_u8; 31]).is_err());
        assert!(raw_key_spec(&[0_u8; 33]).is_err());
    }
}
