// Public deterministic design vectors ONLY. No file IO, OS custody or product linkage.
use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{AeadInPlace, KeyInit},
    XChaCha20Poly1305,
};
use hkdf::Hkdf;
use serde_json::json;
use sha2::{Digest, Sha256};
fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn main() {
    let ws: Vec<u8> = (0..16).collect();
    let install: Vec<u8> = (16..32).collect();
    let generation: Vec<u8> = (32..48).collect();
    let salt: Vec<u8> = (48..64).collect();
    let device: Vec<u8> = (64..96).collect();
    let snapshot: Vec<u8> = (96..128).collect();
    let recovery: Vec<u8> = (128..160).collect();
    let nonce: Vec<u8> = (160..184).collect();
    let password = "Glymize-آفلاین-Vector-1".as_bytes();
    let mut kdf = [0u8; 32];
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(65536, 3, 4, Some(32)).unwrap(),
    )
    .hash_password_into(password, &salt, &mut kdf)
    .unwrap();
    let mut info = b"GLYMIZE-KC1\0".to_vec();
    info.push(1);
    info.extend(&ws);
    info.extend(1u32.to_le_bytes());
    info.extend(&generation);
    let mut ikm = kdf.to_vec();
    ikm.extend(&device);
    let mut key = [0u8; 32];
    Hkdf::<Sha256>::new(Some(&ws), &ikm)
        .expand(&info, &mut key)
        .unwrap();
    let mut header = b"GLYKC001".to_vec();
    header.extend(1u16.to_le_bytes());
    header.extend([1, 0]);
    header.extend(&ws);
    header.extend(&install);
    header.extend(&generation);
    header.extend(&generation);
    header.extend(1u32.to_le_bytes());
    header.extend(1u32.to_le_bytes());
    header.extend(1u16.to_le_bytes());
    header.extend(&salt);
    header.extend(&nonce);
    header.extend(32u32.to_le_bytes());
    assert_eq!(header.len(), 130);
    let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();
    let mut ciphertext = snapshot.clone();
    let tag = cipher
        .encrypt_in_place_detached(nonce.as_slice().into(), &header, &mut ciphertext)
        .unwrap();
    let mut envelope = header.clone();
    envelope.extend(&ciphertext);
    envelope.extend(tag);
    let mut plain = ciphertext.clone();
    cipher
        .decrypt_in_place_detached(nonce.as_slice().into(), &header, &mut plain, &tag)
        .unwrap();
    assert_eq!(plain, snapshot);
    let mut rejected = 0;
    for i in 0..header.len() {
        let mut bad = header.clone();
        bad[i] ^= 1;
        let mut c = ciphertext.clone();
        assert!(cipher
            .decrypt_in_place_detached(nonce.as_slice().into(), &bad, &mut c, &tag)
            .is_err());
        rejected += 1;
    }
    let mut check_input = b"GLYMIZE-RECOVERY-1\0".to_vec();
    check_input.extend(&ws);
    check_input.extend(&recovery);
    let checksum = Sha256::digest(&check_input);
    println!(
        "{}",
        json!({"passwordUtf8Hex":hex(password),"workspaceHex":hex(&ws),"installHex":hex(&install),"generationHex":hex(&generation),"saltHex":hex(&salt),"deviceHex":hex(&device),"snapshotHex":hex(&snapshot),"recoveryHex":hex(&recovery),"nonceHex":hex(&nonce),"argon2idHex":hex(&kdf),"hkdfInfoHex":hex(&info),"wrappingKeyHex":hex(&key),"aadHex":hex(&header),"ciphertextHex":hex(&ciphertext),"tagHex":hex(&tag),"envelopeSha256":hex(&Sha256::digest(&envelope)),"recoveryChecksumHex":hex(&checksum[..4]),"mutatedAadRejected":rejected})
    );
}
