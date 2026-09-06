param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is not available in PATH.'
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is required to download the private shared snapshot. Install/authenticate gh, then rerun.'
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw 'Run this script from inside the GLYMIZE repository.'
}
Set-Location $repoRoot

$repoSlug = (& gh repo view --json nameWithOwner --jq '.nameWithOwner').Trim()
if ($LASTEXITCODE -ne 0 -or -not $repoSlug) {
    throw 'Unable to resolve the authenticated GitHub repository.'
}

$tag = 'codebase-memory-latest'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("glymize-cbm-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    Write-Host "Downloading shared Codebase Memory snapshot from $repoSlug release $tag..." -ForegroundColor Cyan
    & gh release download $tag --repo $repoSlug --pattern 'codebase-memory-snapshot.tar.gz' --pattern 'codebase-memory-snapshot.sha256' --pattern 'snapshot-source.json' --dir $tempRoot --clobber
    if ($LASTEXITCODE -ne 0) { throw 'Failed to download the shared Codebase Memory snapshot.' }

    $archive = Join-Path $tempRoot 'codebase-memory-snapshot.tar.gz'
    $checksumFile = Join-Path $tempRoot 'codebase-memory-snapshot.sha256'
    $sourceFile = Join-Path $tempRoot 'snapshot-source.json'

    if (-not (Test-Path $archive)) { throw 'Snapshot archive is missing.' }
    if (-not (Test-Path $checksumFile)) { throw 'Snapshot checksum is missing.' }
    if (-not (Test-Path $sourceFile)) { throw 'Snapshot provenance file is missing.' }

    $expectedLine = (Get-Content $checksumFile -Raw).Trim()
    $expectedHash = ($expectedLine -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedHash -ne $actualHash) {
        throw "Snapshot checksum mismatch. Expected $expectedHash, got $actualHash."
    }

    $extractDir = Join-Path $tempRoot 'extract'
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    & tar -xzf $archive -C $extractDir
    if ($LASTEXITCODE -ne 0) { throw 'Failed to extract snapshot archive.' }

    $snapshotDir = Join-Path $extractDir '.codebase-memory'
    if (-not (Test-Path (Join-Path $snapshotDir 'graph.db.zst'))) { throw 'Shared graph.db.zst is missing from the archive.' }
    if (-not (Test-Path (Join-Path $snapshotDir 'artifact.json'))) { throw 'Shared artifact.json is missing from the archive.' }

    $targetDir = Join-Path $repoRoot '.codebase-memory'
    if (Test-Path $targetDir) {
        Remove-Item -LiteralPath $targetDir -Recurse -Force
    }
    Copy-Item -LiteralPath $snapshotDir -Destination $targetDir -Recurse -Force

    $source = Get-Content $sourceFile -Raw | ConvertFrom-Json
    Write-Host "Shared snapshot source SHA: $($source.source_sha)" -ForegroundColor Green
    Write-Host "Codebase Memory version:   $($source.codebase_memory_version)" -ForegroundColor Green
    Write-Host "Installed at:              $targetDir" -ForegroundColor Green
    Write-Host 'Run scripts/codebase-memory-gate.ps1 -Phase pre -RoadmapReviewed before the next task.'
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
