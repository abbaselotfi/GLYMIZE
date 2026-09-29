//! Read-only immutable generation inventory. This validates bounded bytes and
//! names, but is NOT a race-safe publication/activation adapter yet: a Windows
//! handle-identity and no-follow strategy is required before accepting imports.
use crate::{
    kc1::{self, Header},
    Error, Result,
};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Read,
    os::windows::fs::MetadataExt,
    path::{Path, PathBuf},
};

const REPARSE: u32 = 0x400;
const MAX_DB: u64 = 16 * 1024 * 1024 * 1024;
const MAX_TOTAL: u64 = 64 * 1024 * 1024 * 1024;
const ZERO: [u8; 16] = [0; 16];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub kind: u8,
    pub id: [u8; 16],
    pub length: u64,
    pub digest: [u8; 32],
}

fn shape(entries: &[Entry]) -> Result<()> {
    if entries.len() < 5 || entries.len() > 16389 {
        return Err(Error("manifest-count"));
    }
    let mut previous = None;
    for e in entries {
        if !(1..=6).contains(&e.kind)
            || (e.kind != 6 && e.id != ZERO)
            || (e.kind == 6 && e.id == ZERO)
        {
            return Err(Error("manifest-entry"));
        }
        let key = (e.kind, e.id);
        if previous.is_some_and(|p| p >= key) {
            return Err(Error("manifest-order"));
        }
        previous = Some(key);
        if e.kind == 5 && e.length > MAX_DB
            || e.kind == 4 && e.length > 16384
            || (e.kind == 1 || e.kind == 2) && e.length != 178
            || e.kind == 3 && !(186..=726).contains(&e.length)
            || e.kind == 6 && e.length > 16 * 1024 * 1024 + 146
        {
            return Err(Error("manifest-length"));
        }
    }
    for (i, e) in entries.iter().take(5).enumerate() {
        if e.kind != i as u8 + 1 {
            return Err(Error("manifest-mandatory"));
        }
    }
    Ok(())
}
pub fn encode_manifest(entries: &[Entry]) -> Result<Vec<u8>> {
    shape(entries)?;
    let mut out = Vec::new();
    out.try_reserve_exact(12 + 57 * entries.len())
        .map_err(|_| Error("manifest-alloc"))?;
    out.extend_from_slice(b"GLYMF001");
    out.extend_from_slice(&(entries.len() as u32).to_le_bytes());
    for e in entries {
        out.push(e.kind);
        out.extend_from_slice(&e.id);
        out.extend_from_slice(&e.length.to_le_bytes());
        out.extend_from_slice(&e.digest);
    }
    Ok(out)
}
pub fn parse_manifest(bytes: &[u8]) -> Result<Vec<Entry>> {
    if bytes.len() < 12 || bytes.len() > 1024 * 1024 || &bytes[..8] != b"GLYMF001" {
        return Err(Error("manifest-header"));
    }
    let count = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
    if !(5..=16389).contains(&count) || bytes.len() != 12 + 57 * count {
        return Err(Error("manifest-count"));
    }
    let mut entries = Vec::new();
    entries
        .try_reserve_exact(count)
        .map_err(|_| Error("manifest-alloc"))?;
    for i in 0..count {
        let at = 12 + 57 * i;
        entries.push(Entry {
            kind: bytes[at],
            id: bytes[at + 1..at + 17].try_into().unwrap(),
            length: u64::from_le_bytes(bytes[at + 17..at + 25].try_into().unwrap()),
            digest: bytes[at + 25..at + 57].try_into().unwrap(),
        });
    }
    shape(&entries)?;
    Ok(entries)
}
fn hex(id: &[u8; 16]) -> String {
    const TABLE: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(32);
    for b in id {
        s.push(TABLE[(b >> 4) as usize] as char);
        s.push(TABLE[(b & 15) as usize] as char);
    }
    s
}
fn filename(entry: &Entry) -> PathBuf {
    match entry.kind {
        1 => PathBuf::from("normal.kc1"),
        2 => PathBuf::from("recovery.kc1"),
        3 => PathBuf::from("custody.kc1"),
        4 => PathBuf::from("device.dpapi"),
        5 => PathBuf::from("database.db"),
        6 => PathBuf::from("objects").join(format!("{}.kc1", hex(&entry.id))),
        _ => unreachable!(),
    }
}
fn regular_file(path: &Path, upper: u64) -> Result<(File, u64)> {
    let meta = fs::symlink_metadata(path).map_err(|_| Error("file-missing"))?;
    if !meta.is_file() || meta.file_attributes() & REPARSE != 0 || meta.len() > upper {
        return Err(Error("file-shape"));
    }
    let file = File::open(path).map_err(|_| Error("file-open"))?;
    let opened = file.metadata().map_err(|_| Error("file-metadata"))?;
    if !opened.is_file() || opened.file_attributes() & REPARSE != 0 || opened.len() != meta.len() {
        return Err(Error("file-race"));
    }
    Ok((file, meta.len()))
}
fn inventory(dir: &Path, entries: &[Entry]) -> Result<()> {
    let meta = fs::symlink_metadata(dir).map_err(|_| Error("generation-missing"))?;
    if !meta.is_dir() || meta.file_attributes() & REPARSE != 0 {
        return Err(Error("generation-shape"));
    }
    let objects = dir.join("objects");
    let meta = fs::symlink_metadata(&objects).map_err(|_| Error("objects-missing"))?;
    if !meta.is_dir() || meta.file_attributes() & REPARSE != 0 {
        return Err(Error("objects-shape"));
    }
    let mut expected = BTreeMap::new();
    for e in entries {
        expected.insert(filename(e), ());
    }
    expected.insert(PathBuf::from("manifest.kc1"), ());
    expected.insert(PathBuf::from("objects"), ());
    let mut actual = BTreeMap::new();
    for item in fs::read_dir(dir).map_err(|_| Error("inventory-read"))? {
        let item = item.map_err(|_| Error("inventory-read"))?;
        actual.insert(PathBuf::from(item.file_name()), ());
    }
    for item in fs::read_dir(objects).map_err(|_| Error("inventory-read"))? {
        let item = item.map_err(|_| Error("inventory-read"))?;
        actual.insert(PathBuf::from("objects").join(item.file_name()), ());
    }
    if expected != actual {
        return Err(Error("inventory-mismatch"));
    }
    Ok(())
}
/// Partial read-only verifier. Callers must first recover and authenticate the
/// trusted root key; this function must not be used as a production import gate.
pub fn verify_generation(
    dir: &Path,
    manifest_key: &[u8; 32],
    workspace: &[u8; 16],
    generation: &[u8; 16],
    epoch: u32,
) -> Result<Vec<Entry>> {
    let manifest_path = dir.join("manifest.kc1");
    let (file, length) = regular_file(&manifest_path, 1024 * 1024 + 146)?;
    let mut sealed = Vec::new();
    sealed
        .try_reserve_exact(length as usize)
        .map_err(|_| Error("manifest-alloc"))?;
    file.take(length + 1)
        .read_to_end(&mut sealed)
        .map_err(|_| Error("manifest-read"))?;
    if sealed.len() as u64 != length {
        return Err(Error("manifest-race"));
    }
    let scope = kc1::ExpectedScope {
        purpose: 7,
        workspace,
        generation,
        epoch,
        subject: generation,
        installation: None,
    };
    let (header, plaintext) = kc1::open(&sealed, manifest_key, &scope)?;
    if header.length as usize != plaintext.len() {
        return Err(Error("manifest-length"));
    }
    let entries = parse_manifest(&plaintext)?;
    inventory(dir, &entries)?;
    let mut total = length;
    for entry in &entries {
        let path = dir.join(filename(entry));
        let (mut file, length) = regular_file(&path, entry.length)?;
        if length != entry.length {
            return Err(Error("component-length"));
        }
        total = total.checked_add(length).ok_or(Error("generation-size"))?;
        if total > MAX_TOTAL {
            return Err(Error("generation-size"));
        }
        let mut hash = Sha256::new();
        let mut first = [0u8; 130];
        let mut first_len = 0usize;
        let mut remain = length;
        let mut buf = [0u8; 65536];
        while remain > 0 {
            let limit = buf.len().min(remain as usize);
            let n = file
                .read(&mut buf[..limit])
                .map_err(|_| Error("component-read"))?;
            if n == 0 {
                return Err(Error("component-short"));
            }
            let copy = (130 - first_len).min(n);
            if copy > 0 {
                first[first_len..first_len + copy].copy_from_slice(&buf[..copy]);
                first_len += copy;
            }
            hash.update(&buf[..n]);
            remain -= n as u64;
        }
        let mut extra = [0u8; 1];
        if file.read(&mut extra).map_err(|_| Error("component-read"))? != 0 {
            return Err(Error("component-long"));
        }
        let digest: [u8; 32] = hash.finalize().into();
        if digest != entry.digest {
            return Err(Error("component-digest"));
        }
        if [1, 2, 3, 6].contains(&entry.kind) {
            if first_len < 130 {
                return Err(Error("component-header"));
            }
            let h = Header::parse_prefix(&first)?;
            let purpose = if entry.kind == 6 { 5 } else { entry.kind };
            if h.workspace != *workspace
                || h.generation != *generation && entry.kind != 6
                || h.epoch != epoch && entry.kind != 6
                || h.purpose != purpose
                || entry.kind == 6 && h.subject != entry.id
                || h.length as u64 + 146 != length
            {
                return Err(Error("component-scope"));
            }
            if entry.kind != 6 && h.subject != *generation {
                return Err(Error("component-subject"));
            }
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform;
    #[test]
    fn manifest_rejects_structural_corruption() {
        let mut entries = (1..=5)
            .map(|kind| Entry {
                kind,
                id: ZERO,
                length: match kind {
                    1 | 2 => 178,
                    3 => 186,
                    4 => 100,
                    _ => 256,
                },
                digest: [kind; 32],
            })
            .collect::<Vec<_>>();
        let bytes = encode_manifest(&entries).unwrap();
        assert_eq!(parse_manifest(&bytes).unwrap(), entries);
        for n in [0, 11, 12, bytes.len() - 1] {
            assert!(parse_manifest(&bytes[..n]).is_err());
        }
        let mut bad = bytes.clone();
        bad[12] = 7;
        assert!(parse_manifest(&bad).is_err());
        entries.push(entries[4].clone());
        assert!(encode_manifest(&entries).is_err());
        entries.pop();
        entries[1].kind = 1;
        assert!(encode_manifest(&entries).is_err());
    }
    #[test]
    fn synthetic_inventory_rejects_splice_and_extra_file() {
        let workspace = [1; 16];
        let generation = [2; 16];
        let root = [3; 32];
        let object = [4; 16];
        let dir = std::env::temp_dir().join(format!(
            "glymize-kc1-inventory-{}",
            hex(&platform::random::<16>().unwrap())
        ));
        fs::create_dir(&dir).unwrap();
        fs::create_dir(dir.join("objects")).unwrap();
        let mk = |purpose, subject, length, installation, kdf, salt| Header {
            purpose,
            workspace,
            installation,
            generation,
            subject,
            epoch: 1,
            kdf,
            salt,
            nonce: platform::random().unwrap(),
            length,
        };
        let normal = kc1::seal(
            &mk(1, generation, 32, [5; 16], 1, [6; 16]),
            &[7; 32],
            &[8; 32],
        )
        .unwrap();
        let recovery =
            kc1::seal(&mk(2, generation, 32, ZERO, 0, ZERO), &[9; 32], &[8; 32]).unwrap();
        let ring = kc1::root_ring(&[(1, root)], 1).unwrap();
        let custody = kc1::seal(
            &mk(3, generation, ring.len() as u32, ZERO, 0, ZERO),
            &[10; 32],
            &ring,
        )
        .unwrap();
        let object_bytes = kc1::seal(&mk(5, object, 3, ZERO, 0, ZERO), &[11; 32], b"obj").unwrap();
        let inputs = [
            (1, ZERO, normal),
            (2, ZERO, recovery),
            (3, ZERO, custody),
            (4, ZERO, vec![12; 80]),
            (5, ZERO, b"synthetic-db-placeholder".to_vec()),
            (6, object, object_bytes),
        ];
        let mut entries = Vec::new();
        for (kind, id, bytes) in inputs {
            let entry = Entry {
                kind,
                id,
                length: bytes.len() as u64,
                digest: Sha256::digest(&bytes).into(),
            };
            fs::write(dir.join(filename(&entry)), bytes).unwrap();
            entries.push(entry);
        }
        let plain = encode_manifest(&entries).unwrap();
        let key = kc1::derive(7, &root, &workspace, 1, &generation).unwrap();
        let manifest = kc1::seal(
            &mk(7, generation, plain.len() as u32, ZERO, 0, ZERO),
            &key,
            &plain,
        )
        .unwrap();
        fs::write(dir.join("manifest.kc1"), &manifest).unwrap();
        assert_eq!(
            verify_generation(&dir, &key, &workspace, &generation, 1).unwrap(),
            entries
        );
        let target = dir.join(filename(&entries[5]));
        let mut tampered = fs::read(&target).unwrap();
        tampered[130] ^= 1;
        fs::write(&target, &tampered).unwrap();
        assert_eq!(
            verify_generation(&dir, &key, &workspace, &generation, 1),
            Err(Error("component-digest"))
        );
        tampered[130] ^= 1;
        fs::write(&target, &tampered).unwrap();
        fs::write(dir.join("unexpected.txt"), b"x").unwrap();
        assert_eq!(
            verify_generation(&dir, &key, &workspace, &generation, 1),
            Err(Error("inventory-mismatch"))
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
