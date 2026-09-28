# R30-04-B2 Stronghold feasibility probe

This isolated Windows-native crate tests a private `UseSecret` operation that applies a synthetic 32-byte secret to a native SQLCipher handle in raw-key form. The procedure returns only success/failure. It is not linked to Tauri, exposes no renderer IPC, contains no patient data and does not select or activate a production custody protocol.

The probe intentionally documents the native copy boundary: clearing Stronghold prevents keying a new handle, but cannot revoke key material already copied into an open SQLCipher connection. Production design must close statements and database handles before clearing or locking custody.

Run the bounded Windows harness from the repository root:

```powershell
& apps/desktop/spikes/r30-04-b2-stronghold-feasibility/run-windows.ps1 `
  -PerlHome C:\glymize-toolchains\strawberry-perl-5.34.3.1
```

The runner uses only synthetic constants, executes allocation children with fixed sizes and timeouts, and writes generated evidence under `.tmp/`. A successful allocation and `Stronghold::clear` call is not evidence that an operating-system page lock succeeded: the locked `stronghold-runtime 2.0.1` implementation calls `sodium_mlock` without surfacing its return value. This packet is feasibility evidence only; password KDF, recovery, rotation, rewrap, replacement-device behavior, memory policy and final dependency selection remain for the Astra High protocol checkpoint.
