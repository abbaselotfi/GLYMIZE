[CmdletBinding()]
param(
    [string]$CargoTargetDir = 'C:\glymize-r30-04-b2-remediation-target',
    [string]$EvidencePath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') { throw 'R30_04_B2_REMEDIATION_REQUIRES_WINDOWS' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'R30_04_B2_REMEDIATION_MUST_RUN_NON_ELEVATED'
}

$spikeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $spikeRoot '..\..\..\..')).Path
$manifest = Join-Path $spikeRoot 'Cargo.toml'
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path $repoRoot '.tmp\r30-04-b2-remediation\kdf-calibration.json'
}
$evidenceRoot = Split-Path -Parent $EvidencePath
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$env:CARGO_TARGET_DIR = $CargoTargetDir

function Invoke-CargoStep {
    param([Parameter(Mandatory)][string[]]$Arguments)
    & cargo.exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "cargo $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

Invoke-CargoStep @('fmt', '--manifest-path', $manifest, '--', '--check')
Invoke-CargoStep @('test', '--locked', '--manifest-path', $manifest)
Invoke-CargoStep @('clippy', '--locked', '--all-targets', '--manifest-path', $manifest, '--', '-D', 'warnings')
Invoke-CargoStep @('build', '--release', '--locked', '--manifest-path', $manifest)

$binary = Join-Path $CargoTargetDir 'release\glymize-r30-04-b2-remediation.exe'
if (-not (Test-Path -LiteralPath $binary)) { throw 'R30_04_B2_REMEDIATION_BINARY_MISSING' }
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $binary
$startInfo.Arguments = "--evidence `"$EvidencePath`""
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
$stopwatch = [Diagnostics.Stopwatch]::StartNew()
if (-not $process.Start()) { throw 'R30_04_B2_REMEDIATION_PROCESS_START_FAILED' }
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$peakWorkingSetBytes = [int64]0
while (-not $process.WaitForExit(25)) {
    $process.Refresh()
    $peakWorkingSetBytes = [math]::Max($peakWorkingSetBytes, [int64]$process.WorkingSet64)
}
$process.WaitForExit()
$stopwatch.Stop()
$stdout = $stdoutTask.Result
$stderr = $stderrTask.Result
$exitCode = $process.ExitCode
$cpuMs = [math]::Round($process.TotalProcessorTime.TotalMilliseconds, 3)
if ($exitCode -ne 0) { throw "R30_04_B2_REMEDIATION_EXECUTION_FAILED:${exitCode}:$stderr" }

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
$evidence | Add-Member -NotePropertyName hostObservation -NotePropertyValue ([ordered]@{
    nonElevated = $true
    processor = (Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name).Trim()
    logicalProcessors = [Environment]::ProcessorCount
    totalPhysicalMemoryBytes = [int64](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
    wallClockMs = $stopwatch.ElapsedMilliseconds
    processCpuMs = $cpuMs
    peakWorkingSetBytes = $peakWorkingSetBytes
})
$evidence | Add-Member -NotePropertyName stdoutClass -NotePropertyValue $(if ($stdout -match 'ACCEPTED') { 'accepted-marker' } else { 'other' })
$evidence | Add-Member -NotePropertyName stderrBytes -NotePropertyValue ([Text.Encoding]::UTF8.GetByteCount($stderr))
[IO.File]::WriteAllText($EvidencePath, ($evidence | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
Write-Host "R30_04_B2_KDF_CALIBRATION_ACCEPTED: $EvidencePath"
