[CmdletBinding()]
param(
    [string]$CargoTargetDir = 'C:\glymize-r30-04-b1-target',
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

if ($env:OS -ne 'Windows_NT') {
    throw 'R30_04_B2_MEMORY_PROBE_REQUIRES_WINDOWS'
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($elevated) {
    throw 'R30_04_B2_MEMORY_PROBE_MUST_RUN_NON_ELEVATED'
}

$spikeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Join-Path $spikeRoot 'Cargo.toml'
$repoRoot = (Resolve-Path (Join-Path $spikeRoot '..\..\..\..')).Path
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path $repoRoot '.tmp\r30-04-b2-memory\evidence.json'
}
$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$workRoot = Join-Path (Split-Path -Parent $EvidencePath) "children-$runId"
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

$perlBin = ''
$perlExe = ''
$defaultPortablePerl = 'C:\glymize-toolchains\strawberry-perl-5.34.3.1'
if ([string]::IsNullOrWhiteSpace($PerlHome) -and (Test-Path -LiteralPath $defaultPortablePerl)) {
    $PerlHome = $defaultPortablePerl
}
if (-not [string]::IsNullOrWhiteSpace($PerlHome)) {
    $perlBin = (Resolve-Path (Join-Path $PerlHome 'perl\bin')).Path
    $perlExe = Join-Path $perlBin 'perl.exe'
    if (-not (Test-Path -LiteralPath $perlExe)) {
        throw "Portable Perl was not found under $PerlHome"
    }
} elseif (-not (Get-Command perl.exe -ErrorAction SilentlyContinue)) {
    $gitPerl = 'C:\Program Files\Git\usr\bin\perl.exe'
    if (-not (Test-Path -LiteralPath $gitPerl)) {
        throw 'A complete Perl distribution is required to build vendored OpenSSL.'
    }
    $perlBin = Split-Path -Parent $gitPerl
    $perlExe = $gitPerl
} else {
    $perlExe = (Get-Command perl.exe).Source
}
& $perlExe -MLocale::Maketext::Simple -MFile::Spec -MWin32 -e 'exit 0'
if ($LASTEXITCODE -ne 0) {
    throw 'Perl is missing modules required by the vendored OpenSSL build.'
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
    throw 'Visual Studio Build Tools discovery failed: vswhere.exe is missing.'
}
$installationPath = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($installationPath)) {
    throw 'Visual Studio C++ x64 Build Tools are required.'
}
$devCommand = Join-Path $installationPath 'Common7\Tools\VsDevCmd.bat'
$env:PATH = "$(Split-Path -Parent $vswhere);$env:PATH"
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
if ($perlBin) {
    $env:PATH = "$perlBin;$env:PATH"
}
& perl.exe -MLocale::Maketext::Simple -MFile::Spec -MWin32 -e 'exit 0'
if ($LASTEXITCODE -ne 0) {
    throw 'Perl became unavailable after Visual Studio environment initialization.'
}

$env:CARGO_TARGET_DIR = $CargoTargetDir
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$buildOutput = @(& cargo.exe build --release --locked --manifest-path $manifest --bin r30_04_b2_memory_probe 2>&1)
$buildExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($buildExitCode -ne 0) {
    $buildOutput | Write-Host
    throw "cargo build failed with exit code $buildExitCode"
}
Write-Host 'R30_04_B2_MEMORY_PROBE_BUILD_PASSED'
$binary = Join-Path $CargoTargetDir 'release\r30_04_b2_memory_probe.exe'
if (-not (Test-Path -LiteralPath $binary)) {
    throw 'R30_04_B2_MEMORY_PROBE_BINARY_MISSING'
}

$results = @()
foreach ($mode in @('off-none', 'on-none', 'on-stderr', 'on-file')) {
    $stdoutPath = Join-Path $workRoot "$mode.stdout.json"
    $stderrPath = Join-Path $workRoot "$mode.stderr.log"
    $started = [DateTimeOffset]::UtcNow
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $binary
    $startInfo.Arguments = "--mode $mode --work-root `"$workRoot`""
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "R30_04_B2_MEMORY_PROBE_START_FAILED:$mode"
    }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $completed) {
        $process.Kill()
        $process.WaitForExit()
    } else {
        $process.WaitForExit()
    }
    $exitCode = if ($process.HasExited) { [int]$process.ExitCode } else { $null }
    $ended = [DateTimeOffset]::UtcNow
    $stdout = [string]$stdoutTask.Result
    $stderr = [string]$stderrTask.Result
    if ($null -eq $stdout) { $stdout = '' }
    if ($null -eq $stderr) { $stderr = '' }
    [IO.File]::WriteAllText($stdoutPath, $stdout, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($stderrPath, $stderr, [Text.UTF8Encoding]::new($false))
    $sqlcipherLog = Join-Path $workRoot "$mode.sqlcipher.log"
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        try { $parsed = $stdout | ConvertFrom-Json } catch { $parsed = $null }
    }
    $childPassed = $false
    if ($null -ne $parsed -and $parsed.PSObject.Properties.Name -contains 'passed') {
        $childPassed = [bool]$parsed.passed
    }
    $results += [ordered]@{
        mode = $mode
        completedBeforeTimeout = $completed
        exitCode = $exitCode
        passed = $completed -and $exitCode -eq 0 -and $childPassed
        elapsedMs = [math]::Round(($ended - $started).TotalMilliseconds, 3)
        child = $parsed
        stderrClass = if (($stderr -match 'overflowed its stack|stack overflow') -and ($stderr -match 'VirtualLock')) { 'stack-overflow-after-virtual-lock-warning' } elseif ($stderr -match 'overflowed its stack|stack overflow') { 'stack-overflow' } elseif ($stderr -match 'VirtualLock') { 'virtual-lock-warning' } elseif ([string]::IsNullOrWhiteSpace($stderr)) { 'none' } else { 'other' }
        stderrBytes = [Text.Encoding]::UTF8.GetByteCount($stderr)
        sqlcipherLogBytes = if (Test-Path -LiteralPath $sqlcipherLog) { (Get-Item -LiteralPath $sqlcipherLog).Length } else { 0 }
    }
}

$evidence = [ordered]@{
    schema = 'glymize.r30-04-b2.sqlcipher-memory-probe.v1'
    accepted = $false
    classification = 'feasibility-evidence-only'
    platform = [ordered]@{
        os = [Environment]::OSVersion.VersionString
        architecture = $env:PROCESSOR_ARCHITECTURE
        nonElevated = -not $elevated
    }
    bounds = [ordered]@{
        childTimeoutSeconds = $TimeoutSeconds
        allocationCount = 8
        bytesPerAllocation = 2097152
        maxSyntheticBlobBytesPerChild = 16777216
        modes = 4
    }
    results = $results
    conclusions = [ordered]@{
        productionMemoryPolicyAccepted = $false
        warningSuppressionAuthorized = $false
        workingSetExpansionAuthorized = $false
        administrativeExecutionAuthorized = $false
    }
    scope = [ordered]@{
        syntheticDataOnly = $true
        runtimeActivation = $false
        tauriLinked = $false
        patientData = $false
    }
}

$evidenceDirectory = Split-Path -Parent $EvidencePath
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$json = $evidence | ConvertTo-Json -Depth 12
[IO.File]::WriteAllText($EvidencePath, $json, [Text.UTF8Encoding]::new($false))
Write-Host "R30_04_B2_MEMORY_PROBE_COMPLETED: $EvidencePath"
