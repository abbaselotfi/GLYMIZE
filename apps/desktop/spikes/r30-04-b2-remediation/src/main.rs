use std::{
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use zeroize::Zeroize;

const MEMORY_KIB: u32 = 65_536;
const ITERATIONS: u32 = 3;
const LANES: u32 = 4;
const OUTPUT_BYTES: usize = 32;
const SAMPLE_COUNT: usize = 5;
const SALT: [u8; 16] = *b"glymize-b2-salt!";
const SYNTHETIC_PASSWORD: &[u8] = b"synthetic-r30-04-b2-calibration-passphrase";
const MAX_PASSWORD_BYTES_UNSELECTED_BOUNDARY: usize = 1_024;

#[derive(Debug)]
struct Calibration {
    crate_version: &'static str,
    elapsed_ms: Vec<u128>,
    fingerprint_sha256: String,
    workspace_bytes: usize,
    workspace_observed_nonzero: bool,
    workspace_cleared: bool,
    output_cleared: bool,
}

fn parse_evidence_path() -> Result<PathBuf, Box<dyn Error>> {
    let mut args = env::args_os().skip(1);
    match (args.next(), args.next(), args.next()) {
        (Some(flag), Some(path), None) if flag == "--evidence" => Ok(PathBuf::from(path)),
        _ => Err("usage: glymize-r30-04-b2-remediation --evidence <path>".into()),
    }
}

fn checked_password(password: &[u8]) -> Result<&[u8], &'static str> {
    if password.len() > MAX_PASSWORD_BYTES_UNSELECTED_BOUNDARY {
        return Err("synthetic-probe-password-bound-exceeded");
    }
    Ok(password)
}

fn allocation_boundary(block_count: usize, inject_failure: bool) -> Result<(), &'static str> {
    if inject_failure {
        return Err("injected-workspace-allocation-failure");
    }
    let layout_bytes = block_count
        .checked_mul(1_024)
        .ok_or("workspace-size-overflow")?;
    if layout_bytes != MEMORY_KIB as usize * 1_024 {
        return Err("unexpected-workspace-size");
    }
    Ok(())
}

fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn boxed_probe_error(context: &str, error: impl std::fmt::Display) -> Box<dyn Error> {
    std::io::Error::other(format!("{context}:{error}")).into()
}

fn calibrate_05() -> Result<Calibration, Box<dyn Error>> {
    use argon2_05::{Algorithm, Argon2, Block, Params, Version};

    let params = Params::new(MEMORY_KIB, ITERATIONS, LANES, Some(OUTPUT_BYTES))
        .map_err(|error| boxed_probe_error("argon2-05-params", error))?;
    allocation_boundary(params.block_count(), false)?;
    let mut workspace = Vec::<Block>::new();
    workspace.try_reserve_exact(params.block_count())?;
    workspace.resize(params.block_count(), Block::default());
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut elapsed_ms = Vec::with_capacity(SAMPLE_COUNT);
    let mut fingerprint_sha256 = String::new();
    let mut workspace_observed_nonzero = true;
    let mut workspace_cleared = true;
    let mut output_cleared = true;
    for sample_index in 0..SAMPLE_COUNT {
        let mut output = [0_u8; OUTPUT_BYTES];
        let started = Instant::now();
        argon2
            .hash_password_into_with_memory(
                checked_password(SYNTHETIC_PASSWORD)?,
                &SALT,
                &mut output,
                &mut workspace,
            )
            .map_err(|error| boxed_probe_error("argon2-05-hash", error))?;
        elapsed_ms.push(started.elapsed().as_millis());
        workspace_observed_nonzero &= workspace
            .iter_mut()
            .any(|block| block.as_mut().iter().any(|word| *word != 0));
        let sample_fingerprint = fingerprint(&output);
        if sample_index == 0 {
            fingerprint_sha256 = sample_fingerprint;
        } else if sample_fingerprint != fingerprint_sha256 {
            return Err("argon2-05-nondeterministic-output".into());
        }
        for block in &mut workspace {
            block.as_mut().zeroize();
        }
        workspace_cleared &= workspace
            .iter_mut()
            .all(|block| block.as_mut().iter().all(|word| *word == 0));
        output.zeroize();
        output_cleared &= output.iter().all(|byte| *byte == 0);
    }

    Ok(Calibration {
        crate_version: "0.5.3",
        elapsed_ms,
        fingerprint_sha256,
        workspace_bytes: workspace.len() * 1_024,
        workspace_observed_nonzero,
        workspace_cleared,
        output_cleared,
    })
}

fn calibrate_06() -> Result<Calibration, Box<dyn Error>> {
    use argon2_06::{Algorithm, Argon2, Block, Params, Version};

    let params = Params::new(MEMORY_KIB, ITERATIONS, LANES, Some(OUTPUT_BYTES))
        .map_err(|error| boxed_probe_error("argon2-06-params", error))?;
    allocation_boundary(params.block_count(), false)?;
    let mut workspace = Vec::<Block>::new();
    workspace.try_reserve_exact(params.block_count())?;
    workspace.resize(params.block_count(), Block::default());
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut elapsed_ms = Vec::with_capacity(SAMPLE_COUNT);
    let mut fingerprint_sha256 = String::new();
    let mut workspace_observed_nonzero = true;
    let mut workspace_cleared = true;
    let mut output_cleared = true;
    for sample_index in 0..SAMPLE_COUNT {
        let mut output = [0_u8; OUTPUT_BYTES];
        let started = Instant::now();
        argon2
            .hash_password_into_with_memory(
                checked_password(SYNTHETIC_PASSWORD)?,
                &SALT,
                &mut output,
                &mut workspace,
            )
            .map_err(|error| boxed_probe_error("argon2-06-hash", error))?;
        elapsed_ms.push(started.elapsed().as_millis());
        workspace_observed_nonzero &= workspace
            .iter_mut()
            .any(|block| block.as_mut().iter().any(|word| *word != 0));
        let sample_fingerprint = fingerprint(&output);
        if sample_index == 0 {
            fingerprint_sha256 = sample_fingerprint;
        } else if sample_fingerprint != fingerprint_sha256 {
            return Err("argon2-06-nondeterministic-output".into());
        }
        for block in &mut workspace {
            block.as_mut().zeroize();
        }
        workspace_cleared &= workspace
            .iter_mut()
            .all(|block| block.as_mut().iter().all(|word| *word == 0));
        output.zeroize();
        output_cleared &= output.iter().all(|byte| *byte == 0);
    }

    Ok(Calibration {
        crate_version: "0.6.0",
        elapsed_ms,
        fingerprint_sha256,
        workspace_bytes: workspace.len() * 1_024,
        workspace_observed_nonzero,
        workspace_cleared,
        output_cleared,
    })
}

fn calibration_json(value: &Calibration) -> Value {
    let mut sorted = value.elapsed_ms.clone();
    sorted.sort_unstable();
    json!({
        "crateVersion": value.crate_version,
        "sampleElapsedMs": value.elapsed_ms,
        "minimumElapsedMs": sorted[0],
        "medianElapsedMs": sorted[sorted.len() / 2],
        "maximumElapsedMs": sorted[sorted.len() - 1],
        "fingerprintSha256": value.fingerprint_sha256,
        "workspaceBytes": value.workspace_bytes,
        "workspaceObservedNonzero": value.workspace_observed_nonzero,
        "workspaceCleared": value.workspace_cleared,
        "outputCleared": value.output_cleared,
    })
}

fn run(evidence_path: &Path) -> Result<(), Box<dyn Error>> {
    let first = calibrate_05()?;
    let second = calibrate_06()?;
    let injected_allocation_failure = allocation_boundary(MEMORY_KIB as usize, true).is_err();
    let password_bound_failure = checked_password(&vec![0_u8; 1_025]).is_err();
    let fingerprints_match = first.fingerprint_sha256 == second.fingerprint_sha256;
    let accepted = injected_allocation_failure
        && password_bound_failure
        && fingerprints_match
        && first.workspace_observed_nonzero
        && first.workspace_cleared
        && first.output_cleared
        && second.workspace_observed_nonzero
        && second.workspace_cleared
        && second.output_cleared;

    let evidence = json!({
        "schema": "glymize.r30-04-b2.kdf-calibration.v1",
        "accepted": accepted,
        "classification": "synthetic-evidence-only",
        "algorithm": "Argon2id",
        "version": "0x13",
        "parameters": {
            "memoryKiB": MEMORY_KIB,
            "iterations": ITERATIONS,
            "lanes": LANES,
            "outputBytes": OUTPUT_BYTES,
            "saltBytes": SALT.len()
        },
        "candidateResults": [calibration_json(&first), calibration_json(&second)],
        "fingerprintsMatch": fingerprints_match,
        "injectedWorkspaceAllocationFailureObserved": injected_allocation_failure,
        "probeOnlyPasswordMaximumBytes": MAX_PASSWORD_BYTES_UNSELECTED_BOUNDARY,
        "passwordBoundFailureObserved": password_bound_failure,
        "limitations": [
            "The allocation failure is injected at the caller-owned workspace boundary; it is not an operating-system OOM event.",
            "The password maximum is a probe safety bound, not a selected persistent protocol limit.",
            "Elapsed time is a host observation, not a product latency SLO."
        ]
    });

    if let Some(parent) = evidence_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(evidence_path, serde_json::to_vec_pretty(&evidence)?)?;
    if !accepted {
        return Err("R30_04_B2_KDF_CALIBRATION_REJECTED".into());
    }
    println!(
        "R30_04_B2_KDF_CALIBRATION_ACCEPTED:{}",
        evidence_path.display()
    );
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let evidence_path = parse_evidence_path()?;
    run(&evidence_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn injected_workspace_failure_is_visible() {
        assert_eq!(
            allocation_boundary(MEMORY_KIB as usize, true),
            Err("injected-workspace-allocation-failure")
        );
    }

    #[test]
    fn probe_password_bound_fails_closed() {
        assert!(checked_password(&vec![0_u8; 1_025]).is_err());
        assert!(checked_password(&vec![0_u8; 1_024]).is_ok());
    }
}
