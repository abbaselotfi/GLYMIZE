//! Exact KC1 framing and public-vector primitives. This is a synthetic spike,
//! not an application API. Caller supplies trusted scope and owns nonce reuse.
use crate::{Error, Result};
use argon2::{Algorithm, Argon2, Block, Params, Version};
use chacha20poly1305::{
    aead::{AeadInPlace, KeyInit},
    Key, Tag, XChaCha20Poly1305, XNonce,
};
use sha2::{Digest, Sha256};
use zeroize::{Zeroize, Zeroizing};

pub const HEADER_LEN: usize = 130;
const ZERO: [u8; 16] = [0; 16];
pub type RootEntry = (u32, [u8; 32]);
pub type RootRing = Zeroizing<Vec<RootEntry>>;

#[derive(Clone, Copy)]
pub struct ExpectedScope<'a> {
    pub purpose: u8,
    pub workspace: &'a [u8; 16],
    pub generation: &'a [u8; 16],
    pub epoch: u32,
    pub subject: &'a [u8; 16],
    pub installation: Option<&'a [u8; 16]>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Header {
    pub purpose: u8,
    pub workspace: [u8; 16],
    pub installation: [u8; 16],
    pub generation: [u8; 16],
    pub subject: [u8; 16],
    pub epoch: u32,
    pub kdf: u16,
    pub salt: [u8; 16],
    pub nonce: [u8; 24],
    pub length: u32,
}
impl Header {
    pub fn encode(&self) -> Result<[u8; HEADER_LEN]> {
        self.validate()?;
        let mut h = [0u8; HEADER_LEN];
        h[..8].copy_from_slice(b"GLYKC001");
        h[8..10].copy_from_slice(&1u16.to_le_bytes());
        h[10] = self.purpose;
        h[12..28].copy_from_slice(&self.workspace);
        h[28..44].copy_from_slice(&self.installation);
        h[44..60].copy_from_slice(&self.generation);
        h[60..76].copy_from_slice(&self.subject);
        h[76..80].copy_from_slice(&self.epoch.to_le_bytes());
        h[80..84].copy_from_slice(&1u32.to_le_bytes());
        h[84..86].copy_from_slice(&self.kdf.to_le_bytes());
        h[86..102].copy_from_slice(&self.salt);
        h[102..126].copy_from_slice(&self.nonce);
        h[126..130].copy_from_slice(&self.length.to_le_bytes());
        Ok(h)
    }
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        let h = Self::parse_prefix(bytes)?;
        if bytes.len()
            != HEADER_LEN
                .checked_add(h.length as usize)
                .and_then(|x| x.checked_add(16))
                .ok_or(Error("kc1-length"))?
        {
            return Err(Error("kc1-length"));
        }
        Ok(h)
    }
    pub fn parse_prefix(bytes: &[u8]) -> Result<Self> {
        if bytes.len() < HEADER_LEN
            || &bytes[..8] != b"GLYKC001"
            || u16::from_le_bytes(bytes[8..10].try_into().unwrap()) != 1
            || bytes[11] != 0
            || u32::from_le_bytes(bytes[80..84].try_into().unwrap()) != 1
        {
            return Err(Error("kc1-header"));
        }
        let h = Self {
            purpose: bytes[10],
            workspace: bytes[12..28].try_into().unwrap(),
            installation: bytes[28..44].try_into().unwrap(),
            generation: bytes[44..60].try_into().unwrap(),
            subject: bytes[60..76].try_into().unwrap(),
            epoch: u32::from_le_bytes(bytes[76..80].try_into().unwrap()),
            kdf: u16::from_le_bytes(bytes[84..86].try_into().unwrap()),
            salt: bytes[86..102].try_into().unwrap(),
            nonce: bytes[102..126].try_into().unwrap(),
            length: u32::from_le_bytes(bytes[126..130].try_into().unwrap()),
        };
        h.validate()?;
        Ok(h)
    }
    fn validate(&self) -> Result<()> {
        if self.epoch == 0 || self.workspace == ZERO || self.generation == ZERO {
            return Err(Error("kc1-scope"));
        }
        match self.purpose {
            1 if self.installation != ZERO
                && self.subject == self.generation
                && self.kdf == 1
                && self.length == 32 => {}
            2 if self.installation == ZERO
                && self.subject == self.generation
                && self.kdf == 0
                && self.salt == ZERO
                && self.length == 32 => {}
            3 if self.installation == ZERO
                && self.subject == self.generation
                && self.kdf == 0
                && self.salt == ZERO
                && (40..=580).contains(&self.length)
                && (self.length - 4).is_multiple_of(36) => {}
            5 if self.installation == ZERO
                && self.subject != ZERO
                && self.kdf == 0
                && self.salt == ZERO
                && self.length <= 16 * 1024 * 1024 => {}
            7 if self.installation == ZERO
                && self.subject == self.generation
                && self.kdf == 0
                && self.salt == ZERO
                && self.length <= 1024 * 1024 => {}
            _ => return Err(Error("kc1-purpose-shape")),
        }
        Ok(())
    }
    pub fn expected(&self, scope: &ExpectedScope<'_>) -> Result<()> {
        if self.purpose != scope.purpose
            || &self.workspace != scope.workspace
            || &self.generation != scope.generation
            || self.epoch != scope.epoch
            || &self.subject != scope.subject
            || (scope.purpose == 1 && scope.installation != Some(&self.installation))
            || (scope.purpose != 1 && scope.installation.is_some())
        {
            return Err(Error("kc1-expected-scope"));
        }
        Ok(())
    }
}

pub fn derive(
    purpose: u8,
    ikm: &[u8],
    workspace: &[u8; 16],
    epoch: u32,
    subject: &[u8; 16],
) -> Result<Zeroizing<[u8; 32]>> {
    if !(1..=7).contains(&purpose)
        || epoch == 0
        || workspace == &ZERO
        || ikm.len() != if purpose == 1 { 64 } else { 32 }
        || ((purpose == 4 || purpose == 6) && subject != &ZERO)
    {
        return Err(Error("kc1-derive-scope"));
    }
    // Exact 49-byte domain separator: label+NUL, purpose, workspace, epoch, subject.
    let mut full = [0u8; 49];
    full[..12].copy_from_slice(b"GLYMIZE-KC1\0");
    full[12] = purpose;
    full[13..29].copy_from_slice(workspace);
    full[29..33].copy_from_slice(&epoch.to_le_bytes());
    full[33..].copy_from_slice(subject);
    let mut key = Zeroizing::new([0u8; 32]);
    hkdf::Hkdf::<Sha256>::new(Some(workspace), ikm)
        .expand(&full, &mut *key)
        .map_err(|_| Error("kc1-hkdf"))?;
    Ok(key)
}

struct Blocks(Vec<Block>);
impl Drop for Blocks {
    fn drop(&mut self) {
        for block in &mut self.0 {
            block.zeroize();
        }
    }
}
pub fn password_key(
    password: &[u8],
    salt: &[u8; 16],
    device: &[u8; 32],
    workspace: &[u8; 16],
    epoch: u32,
    generation: &[u8; 16],
) -> Result<Zeroizing<[u8; 32]>> {
    if password.is_empty()
        || password.len() > 1024
        || password.contains(&0)
        || std::str::from_utf8(password).is_err()
    {
        return Err(Error("kc1-password"));
    }
    let params = Params::new(65536, 3, 4, Some(32)).map_err(|_| Error("kc1-kdf-params"))?;
    let mut blocks = Vec::new();
    blocks
        .try_reserve_exact(65536)
        .map_err(|_| Error("kc1-kdf-alloc"))?;
    blocks.resize(65536, Block::new());
    let mut blocks = Blocks(blocks);
    let mut material = Zeroizing::new([0u8; 64]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into_with_memory(password, salt, &mut material[..32], &mut blocks.0)
        .map_err(|_| Error("kc1-kdf"))?;
    material[32..].copy_from_slice(device);
    derive(1, &material[..], workspace, epoch, generation)
}

pub fn seal(h: &Header, key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
    if plaintext.len() != h.length as usize {
        return Err(Error("kc1-length"));
    }
    let aad = h.encode()?;
    let mut out = Vec::new();
    out.try_reserve_exact(HEADER_LEN + plaintext.len() + 16)
        .map_err(|_| Error("kc1-alloc"))?;
    out.extend_from_slice(&aad);
    out.extend_from_slice(plaintext);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let tag = cipher
        .encrypt_in_place_detached(XNonce::from_slice(&h.nonce), &aad, &mut out[HEADER_LEN..])
        .map_err(|_| Error("kc1-seal"))?;
    out.extend_from_slice(&tag);
    Ok(out)
}
pub fn open(
    envelope: &[u8],
    key: &[u8; 32],
    scope: &ExpectedScope<'_>,
) -> Result<(Header, Zeroizing<Vec<u8>>)> {
    let h = Header::parse(envelope)?;
    h.expected(scope)?;
    let mut plain = Zeroizing::new(envelope[HEADER_LEN..envelope.len() - 16].to_vec());
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let tag = Tag::from_slice(&envelope[envelope.len() - 16..]);
    cipher
        .decrypt_in_place_detached(
            XNonce::from_slice(&h.nonce),
            &envelope[..HEADER_LEN],
            &mut plain,
            tag,
        )
        .map_err(|_| Error("kc1-auth"))?;
    Ok((h, plain))
}

pub fn recovery_card(workspace: &[u8; 16], q: &[u8; 32]) -> Zeroizing<String> {
    let mut hash = Sha256::new();
    hash.update(b"GLYMIZE-RECOVERY-1\0");
    hash.update(workspace);
    hash.update(q);
    let sum = hash.finalize();
    let mut s = Zeroizing::new(String::from("GLY-R1:"));
    for b in workspace {
        use std::fmt::Write;
        write!(s, "{b:02x}").unwrap();
    }
    s.push(':');
    for b in q {
        use std::fmt::Write;
        write!(s, "{b:02x}").unwrap();
    }
    s.push(':');
    for b in &sum[..4] {
        use std::fmt::Write;
        write!(s, "{b:02x}").unwrap();
    }
    s
}
pub fn parse_card(card: &str, expected: &[u8; 16]) -> Result<Zeroizing<[u8; 32]>> {
    if card.len() != 113
        || !card.is_ascii()
        || !card.starts_with("GLY-R1:")
        || card.as_bytes()[39] != b':'
        || card.as_bytes()[104] != b':'
        || !card[7..39]
            .bytes()
            .chain(card[40..104].bytes())
            .chain(card[105..].bytes())
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(Error("kc1-card-shape"));
    }
    let mut workspace = [0u8; 16];
    for (i, b) in workspace.iter_mut().enumerate() {
        *b = u8::from_str_radix(&card[7 + i * 2..9 + i * 2], 16)
            .map_err(|_| Error("kc1-card-hex"))?;
    }
    if &workspace != expected {
        return Err(Error("kc1-card-workspace"));
    }
    let mut q = Zeroizing::new([0u8; 32]);
    for (i, b) in q.iter_mut().enumerate() {
        *b = u8::from_str_radix(&card[40 + i * 2..42 + i * 2], 16)
            .map_err(|_| Error("kc1-card-hex"))?;
    }
    if recovery_card(&workspace, &q).as_str() != card {
        return Err(Error("kc1-card-checksum"));
    }
    Ok(q)
}

pub fn root_ring(entries: &[RootEntry], current: u32) -> Result<Zeroizing<Vec<u8>>> {
    if current == 0
        || entries.is_empty()
        || entries.len() > 16
        || entries.iter().any(|(e, _)| *e == 0)
        || !entries.iter().any(|(e, _)| *e == current)
        || entries.windows(2).any(|v| v[0].0 == 0 || v[0].0 >= v[1].0)
        || entries.last().unwrap().0 > current
    {
        return Err(Error("kc1-ring"));
    }
    let mut out = Zeroizing::new(Vec::with_capacity(4 + 36 * entries.len()));
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    for (epoch, key) in entries {
        out.extend_from_slice(&epoch.to_le_bytes());
        out.extend_from_slice(key);
    }
    Ok(out)
}
pub fn parse_ring(bytes: &[u8], current: u32) -> Result<RootRing> {
    if bytes.len() < 40 || u16::from_le_bytes(bytes[..2].try_into().unwrap()) != 1 {
        return Err(Error("kc1-ring"));
    }
    let count = u16::from_le_bytes(bytes[2..4].try_into().unwrap()) as usize;
    if count == 0 || count > 16 || bytes.len() != 4 + 36 * count {
        return Err(Error("kc1-ring"));
    }
    let mut entries = Zeroizing::new(Vec::with_capacity(count));
    for i in 0..count {
        let at = 4 + 36 * i;
        entries.push((
            u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()),
            bytes[at + 4..at + 36].try_into().unwrap(),
        ));
    }
    if entries.iter().any(|(e, _)| *e == 0)
        || entries.windows(2).any(|v| v[0].0 >= v[1].0)
        || !entries.iter().any(|(e, _)| *e == current)
        || entries.last().unwrap().0 > current
    {
        return Err(Error("kc1-ring"));
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn unhex(s: &str) -> Vec<u8> {
        let (pairs, remainder) = s.as_bytes().as_chunks::<2>();
        assert!(remainder.is_empty());
        pairs
            .iter()
            .map(|x| u8::from_str_radix(std::str::from_utf8(x).unwrap(), 16).unwrap())
            .collect()
    }
    #[test]
    fn vector_and_tamper() {
        let v: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../docs/evidence/r30-04-b2-protocol-vectors/vector.json"
        ))
        .unwrap();
        let get = |s: &str| unhex(v[s].as_str().unwrap());
        let workspace: [u8; 16] = get("workspaceHex").try_into().unwrap();
        let generation: [u8; 16] = get("generationHex").try_into().unwrap();
        let install: [u8; 16] = get("installHex").try_into().unwrap();
        let salt: [u8; 16] = get("saltHex").try_into().unwrap();
        let nonce: [u8; 24] = get("nonceHex").try_into().unwrap();
        let device: [u8; 32] = get("deviceHex").try_into().unwrap();
        let pass = get("passwordUtf8Hex");
        let key = password_key(&pass, &salt, &device, &workspace, 1, &generation).unwrap();
        assert_eq!(&key[..], get("wrappingKeyHex"));
        let h = Header {
            purpose: 1,
            workspace,
            installation: install,
            generation,
            subject: generation,
            epoch: 1,
            kdf: 1,
            salt,
            nonce,
            length: 32,
        };
        let plain = get("snapshotHex");
        let mut sealed = seal(&h, &key, &plain).unwrap();
        assert_eq!(&sealed[..130], get("aadHex"));
        assert_eq!(&sealed[130..162], get("ciphertextHex"));
        assert_eq!(&sealed[162..], get("tagHex"));
        let scope = ExpectedScope {
            purpose: 1,
            workspace: &workspace,
            generation: &generation,
            epoch: 1,
            subject: &generation,
            installation: Some(&install),
        };
        assert_eq!(open(&sealed, &key, &scope).unwrap().1.as_slice(), plain);
        sealed[130] ^= 1;
        assert!(open(&sealed, &key, &scope).is_err());
        let q: [u8; 32] = get("recoveryHex").try_into().unwrap();
        let card = recovery_card(&workspace, &q);
        assert_eq!(card.len(), 113);
        assert_eq!(&*parse_card(&card, &workspace).unwrap(), &q);
        let non_ascii = format!("{}😀{}", &card[..7], &card[11..]);
        assert_eq!(non_ascii.len(), 113);
        assert!(parse_card(&non_ascii, &workspace).is_err());
    }
    #[test]
    fn bounds_and_scope() {
        let h = Header {
            purpose: 1,
            workspace: [1; 16],
            installation: [2; 16],
            generation: [3; 16],
            subject: [3; 16],
            epoch: 1,
            kdf: 1,
            salt: [4; 16],
            nonce: [5; 24],
            length: 32,
        };
        let key = [7; 32];
        let mut e = seal(&h, &key, &[8; 32]).unwrap();
        let correct = ExpectedScope {
            purpose: 1,
            workspace: &[1; 16],
            generation: &[3; 16],
            epoch: 1,
            subject: &[3; 16],
            installation: Some(&[2; 16]),
        };
        for n in [0, 1, 129, 130, 145, 161, 163, 164] {
            if n != e.len() {
                assert!(Header::parse(&e[..n.min(e.len())]).is_err());
            }
        }
        assert!(open(
            &e,
            &key,
            &ExpectedScope {
                purpose: 2,
                installation: None,
                ..correct
            }
        )
        .is_err());
        assert!(open(
            &e,
            &key,
            &ExpectedScope {
                workspace: &[9; 16],
                ..correct
            }
        )
        .is_err());
        assert!(open(
            &e,
            &key,
            &ExpectedScope {
                installation: Some(&[9; 16]),
                ..correct
            }
        )
        .is_err());
        for offset in [0, 8, 10, 11, 28, 44, 60, 76, 80, 84, 126, 162] {
            let old = e[offset];
            e[offset] ^= 1;
            assert!(open(&e, &key, &correct).is_err());
            e[offset] = old;
        }
        assert!(password_key(b"", &[4; 16], &[2; 32], &[1; 16], 1, &[3; 16]).is_err());
        assert!(password_key(&[0xff], &[4; 16], &[2; 32], &[1; 16], 1, &[3; 16]).is_err());
        assert!(password_key(b"a\0b", &[4; 16], &[2; 32], &[1; 16], 1, &[3; 16]).is_err());
        assert!(
            password_key(&vec![b'a'; 1025], &[4; 16], &[2; 32], &[1; 16], 1, &[3; 16]).is_err()
        );
        assert_ne!(
            &*password_key("é".as_bytes(), &[4; 16], &[2; 32], &[1; 16], 1, &[3; 16]).unwrap(),
            &*password_key(
                "e\u{301}".as_bytes(),
                &[4; 16],
                &[2; 32],
                &[1; 16],
                1,
                &[3; 16]
            )
            .unwrap()
        );
    }
}
