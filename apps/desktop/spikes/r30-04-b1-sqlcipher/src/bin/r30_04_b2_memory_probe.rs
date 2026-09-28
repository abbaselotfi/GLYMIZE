use rusqlite::{Connection, OpenFlags};
use serde_json::json;
use std::env;
use std::error::Error;
use std::ffi::c_void;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

type AnyResult<T> = Result<T, Box<dyn Error>>;

const ALLOCATION_COUNT: usize = 8;
const ALLOCATION_BYTES: usize = 2 * 1024 * 1024;

fn failure(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(io::Error::other(message.into()))
}

fn synthetic_key() -> [u8; 32] {
    std::array::from_fn(|index| ((index as u8).wrapping_mul(37)).wrapping_add(19))
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

fn apply_raw_key(connection: &Connection) -> AnyResult<()> {
    let mut spec = raw_key_spec(&synthetic_key());
    let status = unsafe {
        rusqlite::ffi::sqlite3_key(
            connection.handle(),
            spec.as_ptr().cast::<c_void>(),
            spec.len() as i32,
        )
    };
    spec.fill(0);
    if status != rusqlite::ffi::SQLITE_OK {
        return Err(failure(format!("SQLCIPHER_KEY_FAILED:{status}")));
    }
    Ok(())
}

#[derive(Clone, Copy)]
enum LogTarget {
    None,
    Stderr,
    File,
}

struct ProbeMode {
    name: &'static str,
    memory_security: bool,
    log_target: LogTarget,
}

fn parse_mode(value: &str) -> AnyResult<ProbeMode> {
    match value {
        "off-none" => Ok(ProbeMode {
            name: "off-none",
            memory_security: false,
            log_target: LogTarget::None,
        }),
        "on-none" => Ok(ProbeMode {
            name: "on-none",
            memory_security: true,
            log_target: LogTarget::None,
        }),
        "on-stderr" => Ok(ProbeMode {
            name: "on-stderr",
            memory_security: true,
            log_target: LogTarget::Stderr,
        }),
        "on-file" => Ok(ProbeMode {
            name: "on-file",
            memory_security: true,
            log_target: LogTarget::File,
        }),
        _ => Err(failure("MEMORY_PROBE_MODE_INVALID")),
    }
}

fn configure_logging(connection: &Connection, target: LogTarget, log_path: &Path) -> AnyResult<()> {
    connection.pragma_update(None, "cipher_log_level", "NONE")?;
    connection.pragma_update(None, "cipher_log_source", "NONE")?;
    match target {
        LogTarget::None => {
            connection.pragma_update(None, "cipher_log", "stderr")?;
        }
        LogTarget::Stderr => {
            connection.pragma_update(None, "cipher_log", "stderr")?;
            connection.pragma_update(None, "cipher_log_source", "MEMORY")?;
            connection.pragma_update(None, "cipher_log_level", "WARN")?;
        }
        LogTarget::File => {
            connection.pragma_update(None, "cipher_log", log_path.to_string_lossy().as_ref())?;
            connection.pragma_update(None, "cipher_log_source", "MEMORY")?;
            connection.pragma_update(None, "cipher_log_level", "WARN")?;
        }
    }
    Ok(())
}

fn run(mode: ProbeMode, work_root: &Path) -> AnyResult<()> {
    fs::create_dir_all(work_root)?;
    let database_path = work_root.join(format!("{}.db", mode.name));
    let log_path = work_root.join(format!("{}.sqlcipher.log", mode.name));
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
        | OpenFlags::SQLITE_OPEN_CREATE
        | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let connection = Connection::open_with_flags(&database_path, flags)?;
    configure_logging(&connection, mode.log_target, &log_path)?;
    connection.pragma_update(
        None,
        "cipher_memory_security",
        if mode.memory_security { "ON" } else { "OFF" },
    )?;
    apply_raw_key(&connection)?;
    let cipher_version: String =
        connection.pragma_query_value(None, "cipher_version", |row| row.get(0))?;
    let memory_security: String =
        connection.pragma_query_value(None, "cipher_memory_security", |row| row.get(0))?;
    let memory_security_enabled =
        memory_security == "1" || memory_security.eq_ignore_ascii_case("on");
    if memory_security_enabled != mode.memory_security {
        return Err(failure(format!(
            "MEMORY_SECURITY_STATE_MISMATCH:{memory_security}"
        )));
    }

    connection.execute_batch(
        "PRAGMA temp_store = MEMORY;
         PRAGMA mmap_size = 0;
         CREATE TABLE synthetic_allocation_probe (
           id INTEGER PRIMARY KEY,
           payload BLOB NOT NULL
         ) STRICT;",
    )?;
    for id in 0..ALLOCATION_COUNT {
        connection.execute(
            "INSERT INTO synthetic_allocation_probe(id, payload) VALUES (?1, zeroblob(?2))",
            (id as i64, ALLOCATION_BYTES as i64),
        )?;
    }
    let total_bytes: i64 = connection.query_row(
        "SELECT sum(length(payload)) FROM synthetic_allocation_probe",
        [],
        |row| row.get(0),
    )?;
    connection.execute_batch("DROP TABLE synthetic_allocation_probe; VACUUM;")?;
    drop(connection);

    println!(
        "{}",
        serde_json::to_string(&json!({
            "schema": "glymize.r30-04-b2.sqlcipher-memory-child.v1",
            "mode": mode.name,
            "passed": true,
            "cipherVersion": cipher_version,
            "cipherMemorySecurity": memory_security_enabled,
            "logTarget": match mode.log_target {
                LogTarget::None => "disabled",
                LogTarget::Stderr => "stderr",
                LogTarget::File => "file",
            },
            "boundedWorkload": {
                "allocationCount": ALLOCATION_COUNT,
                "bytesPerAllocation": ALLOCATION_BYTES,
                "totalBlobBytes": total_bytes
            },
            "syntheticDataOnly": true
        }))?
    );
    Ok(())
}

fn main() -> AnyResult<()> {
    if !cfg!(windows) {
        return Err(failure("R30_04_B2_MEMORY_PROBE_REQUIRES_WINDOWS"));
    }
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    if arguments.len() != 4
        || arguments[0].to_str() != Some("--mode")
        || arguments[2].to_str() != Some("--work-root")
    {
        return Err(failure(
            "USAGE: r30_04_b2_memory_probe --mode <off-none|on-none|on-stderr|on-file> --work-root <path>",
        ));
    }
    let mode = parse_mode(
        arguments[1]
            .to_str()
            .ok_or_else(|| failure("MEMORY_PROBE_MODE_NOT_UTF8"))?,
    )?;
    run(mode, &PathBuf::from(&arguments[3]))
}

#[cfg(test)]
mod tests {
    use super::{parse_mode, raw_key_spec, synthetic_key};

    #[test]
    fn raw_key_spec_is_exact_and_complete() {
        let spec = raw_key_spec(&synthetic_key());
        assert_eq!(spec.len(), 67);
        assert_eq!(&spec[..2], b"x'");
        assert_eq!(spec[66], b'\'');
        assert!(spec[2..66].iter().all(u8::is_ascii_hexdigit));
    }

    #[test]
    fn modes_are_closed_and_explicit() {
        for mode in ["off-none", "on-none", "on-stderr", "on-file"] {
            assert_eq!(parse_mode(mode).unwrap().name, mode);
        }
        assert!(parse_mode("on-unknown").is_err());
    }
}
