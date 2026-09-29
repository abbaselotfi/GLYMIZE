"""Public KC1 design vectors; no PHI/OS custody and no file writes.

Requires the already-installed cryptography==48.0.0 for an independent
OpenSSL-backed Argon2/HKDF computation. Does not install dependencies.
"""
import hashlib
import json
import pathlib
import struct
import subprocess

import cryptography
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def verify():
    root = pathlib.Path(__file__).resolve().parent
    vector = json.loads((root / "vector.json").read_text(encoding="utf-8"))
    result = subprocess.run(
        ["cargo", "run", "--release", "--locked", "--manifest-path", str(root / "Cargo.toml")],
        check=True, capture_output=True, text=True, timeout=180,
    )
    assert json.loads(result.stdout) == vector, "Rust fixture drift"
    assert cryptography.__version__ == "48.0.0", "Revalidate independent verifier version"
    raw = lambda key: bytes.fromhex(vector[key])
    kdf = Argon2id(salt=raw("saltHex"), length=32, iterations=3, lanes=4, memory_cost=65536)
    argon = kdf.derive(raw("passwordUtf8Hex"))
    assert argon == raw("argon2idHex")
    info = b"GLYMIZE-KC1\x00\x01" + raw("workspaceHex") + struct.pack("<I", 1) + raw("generationHex")
    assert info == raw("hkdfInfoHex")
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=raw("workspaceHex"), info=info).derive(argon + raw("deviceHex"))
    assert key == raw("wrappingKeyHex")
    header = struct.pack(
        "<8sHBB16s16s16s16sIIH16s24sI", b"GLYKC001", 1, 1, 0,
        raw("workspaceHex"), raw("installHex"), raw("generationHex"), raw("generationHex"),
        1, 1, 1, raw("saltHex"), raw("nonceHex"), 32,
    )
    assert len(header) == 130 and header == raw("aadHex")
    assert hashlib.sha256(header + raw("ciphertextHex") + raw("tagHex")).hexdigest() == vector["envelopeSha256"]
    checksum = hashlib.sha256(b"GLYMIZE-RECOVERY-1\x00" + raw("workspaceHex") + raw("recoveryHex")).digest()[:4]
    assert checksum == raw("recoveryChecksumHex")
    assert vector["mutatedAadRejected"] == 130
    print("PASS: Rust exact fixture/130 AAD mutations; independent Argon2id/HKDF/header/hash/checksum. AEAD cross-library interoperability remains pending.")


if __name__ == "__main__":
    verify()
