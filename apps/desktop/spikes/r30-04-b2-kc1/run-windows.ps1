[CmdletBinding()]
param(
    [string]$CargoTargetDir = 'C:\glymize-r30-04-b2-kc1-target',
    [string]$PerlHome = 'C:\glymize-toolchains\strawberry-perl-5.34.3.1',
    [string]$ExistingOpenSslDir = ''
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'R30_04_B2_KC1_REQUIRES_WINDOWS' }
foreach ($localeName in @('LC_ALL', 'LC_CTYPE', 'LANG')) {
    if ([Environment]::GetEnvironmentVariable($localeName, 'Process') -eq 'C.UTF-8') {
        [Environment]::SetEnvironmentVariable($localeName, $null, 'Process')
    }
}

$spikeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Join-Path $spikeRoot 'Cargo.toml'
$perlBin = (Resolve-Path (Join-Path $PerlHome 'perl\bin')).Path
if (-not (Test-Path -LiteralPath (Join-Path $perlBin 'perl.exe'))) {
    throw 'A complete portable Perl distribution is required for vendored OpenSSL.'
}
$env:PATH = "$perlBin;$env:PATH"
& perl.exe -MLocale::Maketext::Simple -MFile::Spec -MWin32 -e 'exit 0'
if ($LASTEXITCODE -ne 0) { throw 'Portable Perl core modules are unavailable.' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'VS Build Tools discovery is unavailable.' }
$env:PATH = "$(Split-Path -Parent $vswhere);$env:PATH"
$installationPath = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($installationPath)) { throw 'VS C++ x64 Build Tools are required.' }
$devCommand = Join-Path $installationPath 'Common7\Tools\VsDevCmd.bat'
$environmentLines = & cmd.exe /s /c "`"$devCommand`" -arch=x64 -host_arch=x64 >nul && set"
if ($LASTEXITCODE -ne 0) { throw 'VS developer environment initialization failed.' }
foreach ($line in $environmentLines) {
    $separator = $line.IndexOf('=')
    if ($separator -gt 0) {
        [Environment]::SetEnvironmentVariable($line.Substring(0, $separator), $line.Substring($separator + 1), 'Process')
    }
}
$env:PATH = "$perlBin;$env:PATH"
& perl.exe -MLocale::Maketext::Simple -MFile::Spec -MWin32 -e 'exit 0'
if ($LASTEXITCODE -ne 0) { throw 'Portable Perl became unavailable after VS setup.' }
if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) { throw 'Cargo is unavailable.' }

$env:CARGO_TARGET_DIR = $CargoTargetDir
if (-not [string]::IsNullOrWhiteSpace($ExistingOpenSslDir)) {
    $resolvedOpenSsl = (Resolve-Path -LiteralPath $ExistingOpenSslDir).Path
    if (-not (Test-Path -LiteralPath (Join-Path $resolvedOpenSsl 'include\openssl\opensslv.h')) -or
        -not (Test-Path -LiteralPath (Join-Path $resolvedOpenSsl 'lib\libcrypto.lib'))) {
        throw 'Existing OpenSSL artifact is incomplete.'
    }
    $env:OPENSSL_NO_VENDOR = '1'
    $env:OPENSSL_DIR = $resolvedOpenSsl
    $env:OPENSSL_STATIC = '1'
}
& cargo.exe fmt --manifest-path $manifest -- --check
if ($LASTEXITCODE -ne 0) { throw 'KC1_FORMAT_FAILED' }
& cargo.exe test --manifest-path $manifest --locked --offline
if ($LASTEXITCODE -ne 0) { throw 'KC1_TEST_FAILED' }
& cargo.exe clippy --manifest-path $manifest --locked --offline --all-targets -- -D warnings
if ($LASTEXITCODE -ne 0) { throw 'KC1_CLIPPY_FAILED' }
Write-Output 'R30_04_B2_KC1_FORMAT_TEST_CLIPPY_PASS'
