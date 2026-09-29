[CmdletBinding()]
param(
    [string]$EvidencePath = '',
    [string]$CargoTargetDir = 'C:\glymize-r30-04-b2-observability-target'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') { throw 'R30_04_B2_OBSERVABILITY_REQUIRES_WINDOWS' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'R30_04_B2_OBSERVABILITY_MUST_RUN_NON_ELEVATED'
}

$spikeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $spikeRoot '..\..\..\..')).Path
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path $repoRoot '.tmp\r30-04-b2-remediation\stronghold-observability.json'
}
$evidenceRoot = Split-Path -Parent $EvidencePath
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
if (Test-Path -LiteralPath $EvidencePath) {
    Remove-Item -LiteralPath $EvidencePath -Force
}

$registrySource = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE '.cargo\registry\src') -Directory |
    ForEach-Object { Join-Path $_.FullName 'stronghold-runtime-2.0.1' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'src\boxed.rs') } |
    Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($registrySource)) {
    throw 'PINNED_STRONGHOLD_RUNTIME_2_0_1_SOURCE_MISSING'
}

$expectedBoxedSha256 = 'EECDA5A2F6219CB21D69ECC2DC0CD28C9B572B9FB57166F08C2D217F728C6DB3'
$expectedManifestSha256 = '5017FD48F57E7DF93CB282C325DD16F266A56FEC850C09AEA6C44CF894239AF3'
$actualBoxedSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $registrySource 'src\boxed.rs')).Hash
$actualManifestSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $registrySource 'Cargo.toml')).Hash
if ($actualBoxedSha256 -ne $expectedBoxedSha256) { throw 'STRONGHOLD_BOXED_SOURCE_HASH_MISMATCH' }
if ($actualManifestSha256 -ne $expectedManifestSha256) { throw 'STRONGHOLD_MANIFEST_HASH_MISMATCH' }

$scratchRoot = Join-Path $repoRoot '.tmp\r30-04-b2-remediation\stronghold-runtime-2.0.1-patched'
if (Test-Path -LiteralPath $scratchRoot) {
    $resolvedScratch = (Resolve-Path -LiteralPath $scratchRoot).Path
    $resolvedTempParent = (Resolve-Path -LiteralPath (Join-Path $repoRoot '.tmp\r30-04-b2-remediation')).Path
    if (-not $resolvedScratch.StartsWith($resolvedTempParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'REFUSING_TO_REMOVE_UNEXPECTED_SCRATCH_PATH'
    }
    Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
}
Copy-Item -LiteralPath $registrySource -Destination $scratchRoot -Recurse

$patchPath = Join-Path $spikeRoot 'patches\stronghold-runtime-2.0.1-observable-mlock.patch'
$scratchRelative = $scratchRoot.Substring($repoRoot.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
& git.exe -C $repoRoot apply --unidiff-zero "--directory=$scratchRelative" --check $patchPath
if ($LASTEXITCODE -ne 0) { throw 'STRONGHOLD_OBSERVABILITY_PATCH_CHECK_FAILED' }
& git.exe -C $repoRoot apply --unidiff-zero "--directory=$scratchRelative" $patchPath
if ($LASTEXITCODE -ne 0) { throw 'STRONGHOLD_OBSERVABILITY_PATCH_FAILED' }
if (-not (Select-String -LiteralPath (Join-Path $scratchRoot 'src\boxed.rs') -SimpleMatch 'glymize_injected_native_failures_are_observable_and_cleanup' -Quiet)) {
    throw 'STRONGHOLD_OBSERVABILITY_PATCH_MARKER_MISSING'
}

$env:CARGO_TARGET_DIR = $CargoTargetDir
$started = [Diagnostics.Stopwatch]::StartNew()
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    $testOutput = @(& cargo.exe test --manifest-path (Join-Path $scratchRoot 'Cargo.toml') boxed::test::glymize_injected_native_failures_are_observable_and_cleanup -- --exact --nocapture 2>&1)
} finally {
    $ErrorActionPreference = $previousErrorActionPreference
}
$exitCode = $LASTEXITCODE
$started.Stop()
$testOutput | ForEach-Object { Write-Host $_ }
$testText = $testOutput -join "`n"
if ($exitCode -eq 0 -and $testText -notmatch 'test result: ok\. 1 passed; 0 failed') {
    $exitCode = 97
}

$evidence = [ordered]@{
    schema = 'glymize.r30-04-b2.stronghold-observability.v1'
    accepted = $exitCode -eq 0
    classification = 'test-only-instrumented-dependency'
    dependency = 'stronghold-runtime=2.0.1'
    sourceHashes = [ordered]@{
        boxedRsSha256 = $actualBoxedSha256
        cargoTomlSha256 = $actualManifestSha256
    }
    injectedFailures = @('allocation', 'sodium_mlock-nonzero', 'memory-protection')
    expectedObservations = @('all-panics-visible', 'mlock-zero-before-free', 'single-cleanup-per-partial-allocation')
    executedTests = if ($testText -match 'test result: ok\. 1 passed; 0 failed') { 1 } else { 0 }
    exitCode = $exitCode
    elapsedMs = $started.ElapsedMilliseconds
    nonElevated = $true
    productionSelection = $false
    limitations = @(
        'The dependency is copied and patched only in a temporary directory.',
        'This test proves the bounded injected path, not every operating-system failure mode.',
        'The patch still reports failure by panic and is not an accepted product API.'
    )
}
[IO.File]::WriteAllText($EvidencePath, ($evidence | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
if ($exitCode -ne 0) { throw "STRONGHOLD_OBSERVABILITY_TEST_FAILED:${exitCode}" }
Write-Host "R30_04_B2_STRONGHOLD_OBSERVABILITY_ACCEPTED: $EvidencePath"
