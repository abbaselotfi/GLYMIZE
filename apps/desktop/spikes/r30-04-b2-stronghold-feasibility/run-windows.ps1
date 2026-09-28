[CmdletBinding()]
param(
    [string]$CargoTargetDir = 'C:\glymize-r30-04-b2-stronghold-target',
    [string]$EvidencePath = '',
    [string]$PerlHome = '',
    [ValidateRange(5, 60)]
    [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($localeName in @('LC_ALL', 'LC_CTYPE', 'LANG')) {
    if ([Environment]::GetEnvironmentVariable($localeName, 'Process') -eq 'C.UTF-8') {
        [Environment]::SetEnvironmentVariable($localeName, $null, 'Process')
    }
}
if ($env:OS -ne 'Windows_NT') { throw 'R30_04_B2_STRONGHOLD_PROBE_REQUIRES_WINDOWS' }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'R30_04_B2_STRONGHOLD_PROBE_MUST_RUN_NON_ELEVATED'
}

$spikeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Join-Path $spikeRoot 'Cargo.toml'
$repoRoot = (Resolve-Path (Join-Path $spikeRoot '..\..\..\..')).Path
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path $repoRoot '.tmp\r30-04-b2-stronghold\feasibility.json'
}
$evidenceRoot = Split-Path -Parent $EvidencePath
$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$allocationRoot = Join-Path $evidenceRoot "allocation-$runId"
New-Item -ItemType Directory -Force -Path $allocationRoot | Out-Null

$defaultPortablePerl = 'C:\glymize-toolchains\strawberry-perl-5.34.3.1'
if ([string]::IsNullOrWhiteSpace($PerlHome) -and (Test-Path -LiteralPath $defaultPortablePerl)) {
    $PerlHome = $defaultPortablePerl
}
if ([string]::IsNullOrWhiteSpace($PerlHome)) {
    throw 'A complete Perl distribution is required to build vendored OpenSSL.'
}
$perlBin = (Resolve-Path (Join-Path $PerlHome 'perl\bin')).Path
$perlExe = Join-Path $perlBin 'perl.exe'
if (-not (Test-Path -LiteralPath $perlExe)) { throw "Portable Perl was not found under $PerlHome" }
& $perlExe -MLocale::Maketext::Simple -MFile::Spec -MWin32 -e 'exit 0'
if ($LASTEXITCODE -ne 0) { throw 'Perl is missing required modules.' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'vswhere.exe is missing.' }
$installationPath = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($installationPath)) { throw 'Visual Studio C++ x64 Build Tools are required.' }
$env:PATH = "$(Split-Path -Parent $vswhere);$env:PATH"
$devCommand = Join-Path $installationPath 'Common7\Tools\VsDevCmd.bat'
$environmentLines = & cmd.exe /s /c "`"$devCommand`" -arch=x64 -host_arch=x64 >nul && set"
if ($LASTEXITCODE -ne 0) { throw 'Visual Studio developer environment initialization failed.' }
foreach ($line in $environmentLines) {
    $separator = $line.IndexOf('=')
    if ($separator -gt 0) {
        [Environment]::SetEnvironmentVariable($line.Substring(0, $separator), $line.Substring($separator + 1), 'Process')
    }
}
$env:PATH = "$perlBin;$env:PATH"
$env:CARGO_TARGET_DIR = $CargoTargetDir

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
Invoke-CargoStep @('run', '--release', '--locked', '--manifest-path', $manifest, '--', '--evidence', $EvidencePath)

$binary = Join-Path $CargoTargetDir 'release\glymize-r30-04-b2-stronghold-feasibility.exe'
if (-not (Test-Path -LiteralPath $binary)) { throw 'R30_04_B2_STRONGHOLD_BINARY_MISSING' }
$allocationResults = @()
foreach ($bytes in @(32, 1048576, 16777216)) {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $binary
    $startInfo.Arguments = "--allocation-probe-bytes $bytes"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "STRONGHOLD_ALLOCATION_CHILD_START_FAILED:$bytes" }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $completed) {
        $process.Kill()
    }
    $process.WaitForExit()
    $stdout = [string]$stdoutTask.Result
    $stderr = [string]$stderrTask.Result
    if ($null -eq $stdout) { $stdout = '' }
    if ($null -eq $stderr) { $stderr = '' }
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        try { $parsed = $stdout | ConvertFrom-Json } catch { $parsed = $null }
    }
    $allocationResults += [ordered]@{
        requestedBytes = $bytes
        completedBeforeTimeout = $completed
        exitCode = if ($process.HasExited) { [int]$process.ExitCode } else { $null }
        result = $parsed
        stderrClass = if ($stderr -match 'memory|alloc|lock') { 'memory-or-lock-error' } elseif ([string]::IsNullOrWhiteSpace($stderr)) { 'none' } else { 'other' }
        stderrBytes = [Text.Encoding]::UTF8.GetByteCount($stderr)
    }
}

$allocationEvidence = [ordered]@{
    schema = 'glymize.r30-04-b2.stronghold-allocation-probe.v1'
    accepted = $false
    classification = 'feasibility-evidence-only'
    timeoutSecondsPerChild = $TimeoutSeconds
    maximumRequestedBytes = 16777216
    nonElevated = $true
    results = $allocationResults
    limitation = 'bounded observations do not prove all allocation-failure or memory-release paths'
}
$allocationEvidencePath = Join-Path $evidenceRoot 'allocation.json'
$json = $allocationEvidence | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText($allocationEvidencePath, $json, [Text.UTF8Encoding]::new($false))

Write-Host "R30_04_B2_STRONGHOLD_FEASIBILITY_COMPLETED: $EvidencePath"
Write-Host "R30_04_B2_STRONGHOLD_ALLOCATION_COMPLETED: $allocationEvidencePath"
