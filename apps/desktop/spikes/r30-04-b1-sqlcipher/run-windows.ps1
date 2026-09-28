[CmdletBinding()]
param(
    [string]$CargoTargetDir = 'C:\glymize-r30-04-b1-target',
    [string]$EvidencePath = '',
    [string]$PerlHome = ''
)

$ErrorActionPreference = 'Stop'

foreach ($localeName in @('LC_ALL', 'LC_CTYPE', 'LANG')) {
    if ([Environment]::GetEnvironmentVariable($localeName, 'Process') -eq 'C.UTF-8') {
        [Environment]::SetEnvironmentVariable($localeName, $null, 'Process')
    }
}

if ($env:OS -ne 'Windows_NT') {
    throw 'R30_04_B1_REQUIRES_WINDOWS'
}

$spikeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Join-Path $spikeRoot 'Cargo.toml'
$repoRoot = (Resolve-Path (Join-Path $spikeRoot '..\..\..\..')).Path

if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path $repoRoot '.tmp\r30-04-b1\release-evidence.json'
}

if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
    throw 'Cargo is required and was not found on PATH.'
}

$perlBin = ''
if (-not [string]::IsNullOrWhiteSpace($PerlHome)) {
    $perlBin = (Resolve-Path (Join-Path $PerlHome 'perl\bin')).Path
    if (-not (Test-Path -LiteralPath (Join-Path $perlBin 'perl.exe'))) {
        throw "Portable Perl was not found under $PerlHome"
    }
    $env:PATH = "$perlBin;$env:PATH"
}

& perl.exe -MFile::Spec -e 'exit 0'
if ($LASTEXITCODE -ne 0) {
    throw 'A full Perl distribution with core modules is required to build vendored OpenSSL.'
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
    throw 'Visual Studio Build Tools discovery failed: vswhere.exe is missing.'
}

$env:PATH = "$(Split-Path -Parent $vswhere);$env:PATH"
$installationPath = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($installationPath)) {
    throw 'Visual Studio C++ x64 Build Tools are required.'
}

$devCommand = Join-Path $installationPath 'Common7\Tools\VsDevCmd.bat'
$environmentLines = & cmd.exe /s /c "`"$devCommand`" -arch=x64 -host_arch=x64 >nul && set"
if ($LASTEXITCODE -ne 0) {
    throw 'Visual Studio developer environment initialization failed.'
}
foreach ($line in $environmentLines) {
    $separator = $line.IndexOf('=')
    if ($separator -gt 0) {
        [Environment]::SetEnvironmentVariable($line.Substring(0, $separator), $line.Substring($separator + 1), 'Process')
    }
}
if (-not [string]::IsNullOrWhiteSpace($perlBin)) {
    $env:PATH = "$perlBin;$env:PATH"
}
& perl.exe -MFile::Spec -e 'exit 0'
if ($LASTEXITCODE -ne 0) {
    throw 'Perl became unavailable after Visual Studio environment initialization.'
}

$env:CARGO_TARGET_DIR = $CargoTargetDir
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidencePath) | Out-Null

function Invoke-CargoStep {
    param([Parameter(Mandatory)][string[]]$Arguments)
    & cargo.exe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "cargo $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

Invoke-CargoStep @('fmt', '--manifest-path', $manifest, '--', '--check')
Invoke-CargoStep @('test', '--locked', '--manifest-path', $manifest)
Invoke-CargoStep @('clippy', '--locked', '--all-targets', '--manifest-path', $manifest, '--', '-D', 'warnings')
Invoke-CargoStep @('run', '--release', '--locked', '--manifest-path', $manifest, '--bin', 'glymize-r30-04-b1-sqlcipher-spike', '--', '--evidence', $EvidencePath)

Write-Host "R30_04_B1_WINDOWS_RUN_ACCEPTED: $EvidencePath"
