[CmdletBinding()]
param(
  [ValidateSet('AuditHost', 'AuditRuntime', 'Preflight', 'Install', 'PostReboot', 'UninstallReinstall', 'Finalize')]
  [string]$Phase = 'AuditHost',
  [string]$KitRoot = $PSScriptRoot,
  [string]$EvidenceRoot = (Join-Path $PSScriptRoot 'evidence'),
  [string]$ExpectedKitManifestSha256 = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:CdpCommandId = 0
$WebView2ClientId = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$ExpectedUrl = 'https://tauri.localhost/offline/index.html'
$ApplicationName = 'GLYMIZE Reference'
$ApplicationExecutable = 'glymize-reference.exe'
$RequiredPhases = @('Preflight', 'Install', 'PostReboot', 'UninstallReinstall')

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function New-Gate([string]$Name, [bool]$Passed, $Expected, $Observed, [bool]$Blocking = $true) {
  return [pscustomobject]@{
    name = $Name
    passed = $Passed
    blocking = $Blocking
    expected = $Expected
    observed = $Observed
  }
}

function Get-IsElevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-BootTimeUtc {
  return (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
}

function Get-HostSnapshot {
  $os = Get-CimInstance Win32_OperatingSystem
  return [pscustomobject]@{
    computerName = $env:COMPUTERNAME
    userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    isElevated = [bool](Get-IsElevated)
    caption = $os.Caption
    version = $os.Version
    buildNumber = [int]$os.BuildNumber
    architecture = $os.OSArchitecture
    bootTimeUtc = Get-BootTimeUtc
    powershell = $PSVersionTable.PSVersion.ToString()
  }
}

function Get-WebView2Registrations {
  $paths = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$WebView2ClientId",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$WebView2ClientId",
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$WebView2ClientId"
  )
  $rows = @()
  foreach ($path in $paths) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $value = Get-ItemProperty -LiteralPath $path -Name pv -ErrorAction SilentlyContinue
    $version = if ($null -eq $value) { '' } else { [string]$value.pv }
    if ($version -and $version -ne '0.0.0.0') {
      $rows += [pscustomobject]@{ path = $path; version = $version }
    }
  }
  return @($rows)
}

function Get-ToolchainFindings {
  $names = @('git', 'node', 'npm', 'pnpm', 'rustc', 'cargo', 'cl', 'msbuild')
  $rows = @()
  foreach ($name in $names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) {
      $rows += [pscustomobject]@{ name = $name; path = [string]$command.Source; source = 'PATH' }
    }
  }
  $knownPaths = @(
    (Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'),
    (Join-Path $env:ProgramFiles 'Git\cmd\git.exe')
  )
  foreach ($path in $knownPaths) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      $rows += [pscustomobject]@{ name = [IO.Path]::GetFileNameWithoutExtension($path); path = $path; source = 'known-path' }
    }
  }
  return @($rows | Sort-Object path -Unique)
}

function Test-DnsBlocked([string]$HostName) {
  try {
    [void][Net.Dns]::GetHostAddresses($HostName)
    return $false
  } catch {
    return $true
  }
}

function Test-TcpBlocked([string]$HostName, [int]$Port = 443, [int]$TimeoutMs = 2500) {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $true }
    try {
      $client.EndConnect($async)
      return -not $client.Connected
    } catch {
      return $true
    }
  } catch {
    return $true
  } finally {
    $client.Dispose()
  }
}

function Get-BlackoutSnapshot {
  $targets = @('github.com', 'api.cloudflare.com')
  $rows = foreach ($target in $targets) {
    [pscustomobject]@{
      host = $target
      dnsBlocked = [bool](Test-DnsBlocked $target)
      tcp443Blocked = [bool](Test-TcpBlocked $target)
    }
  }
  return [pscustomobject]@{
    targets = @($rows)
    passed = [bool](@($rows | Where-Object { -not $_.dnsBlocked -or -not $_.tcp443Blocked }).Count -eq 0)
  }
}

function Get-AppState {
  $uninstallRoots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
  )
  $registration = $null
  foreach ($root in $uninstallRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    foreach ($key in Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue) {
      $item = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction SilentlyContinue
      if ($null -eq $item) { continue }
      $displayName = $item.PSObject.Properties['DisplayName']
      if ($null -ne $displayName -and [string]$displayName.Value -eq $ApplicationName) {
        $registration = $item
        break
      }
    }
    if ($null -ne $registration) { break }
  }
  $installRoot = Join-Path $env:LOCALAPPDATA $ApplicationName
  $installLocation = if ($null -eq $registration) { $null } else { $registration.PSObject.Properties['InstallLocation'] }
  if ($null -ne $installLocation -and [string]$installLocation.Value) {
    $installRoot = ([string]$installLocation.Value).Trim('"')
  }
  $displayVersion = if ($null -eq $registration) { $null } else { $registration.PSObject.Properties['DisplayVersion'] }
  $executable = Join-Path $installRoot $ApplicationExecutable
  $uninstaller = Join-Path $installRoot 'uninstall.exe'
  return [pscustomobject]@{
    registered = [bool]($null -ne $registration)
    version = if ($null -eq $displayVersion) { $null } else { [string]$displayVersion.Value }
    installRoot = $installRoot
    executable = $executable
    executablePresent = [bool](Test-Path -LiteralPath $executable)
    uninstaller = $uninstaller
    uninstallerPresent = [bool](Test-Path -LiteralPath $uninstaller)
  }
}

function Wait-ForCondition([scriptblock]$Condition, [int]$TimeoutSeconds, [string]$FailureCode) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 500
  }
  throw $FailureCode
}

function Get-FreeTcpPort {
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function Send-CdpText($Socket, [string]$Text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
  $segment = [ArraySegment[byte]]::new($bytes)
  $Socket.SendAsync($segment, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Receive-CdpText($Socket) {
  $stream = New-Object IO.MemoryStream
  $buffer = New-Object byte[] 65536
  $cancellation = New-Object Threading.CancellationTokenSource
  $cancellation.CancelAfter(15000)
  try {
    do {
      $segment = [ArraySegment[byte]]::new($buffer)
      $result = $Socket.ReceiveAsync($segment, $cancellation.Token).GetAwaiter().GetResult()
      if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'CLEAN_MACHINE_CDP_CLOSED' }
      $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    return [Text.Encoding]::UTF8.GetString($stream.ToArray())
  } finally {
    $cancellation.Dispose()
    $stream.Dispose()
  }
}

function Invoke-CdpCommand($Socket, [string]$Method, $Parameters = $null) {
  $script:CdpCommandId += 1
  $id = $script:CdpCommandId
  $request = [ordered]@{ id = $id; method = $Method }
  if ($null -ne $Parameters) { $request.params = $Parameters }
  [void](Send-CdpText $Socket ($request | ConvertTo-Json -Depth 12 -Compress))
  while ($true) {
    $message = Receive-CdpText $Socket | ConvertFrom-Json
    if ($null -eq $message.PSObject.Properties['id'] -or [int]$message.id -ne $id) { continue }
    if ($null -ne $message.PSObject.Properties['error']) {
      throw "CLEAN_MACHINE_CDP_ERROR:${Method}:$($message.error.message)"
    }
    return $message.result
  }
}

function Get-ProcessTreeIds([int]$RootId) {
  $rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
  $ids = New-Object 'System.Collections.Generic.HashSet[int]'
  [void]$ids.Add($RootId)
  do {
    $changed = $false
    foreach ($row in $rows) {
      if ($ids.Contains([int]$row.ParentProcessId) -and -not $ids.Contains([int]$row.ProcessId)) {
        [void]$ids.Add([int]$row.ProcessId)
        $changed = $true
      }
    }
  } while ($changed)
  return @($ids)
}

function Get-ExternalConnections([int[]]$ProcessIds) {
  $connections = @()
  if ($null -eq (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    throw 'CLEAN_MACHINE_TCP_EVIDENCE_UNAVAILABLE'
  }
  foreach ($connection in Get-NetTCPConnection -State Established -ErrorAction Stop) {
    if ($ProcessIds -notcontains [int]$connection.OwningProcess) { continue }
    $remote = [string]$connection.RemoteAddress
    if ($remote -eq '::1' -or $remote -eq '::' -or $remote -eq '0.0.0.0' -or $remote.StartsWith('127.')) { continue }
    $connections += [pscustomobject]@{
      processId = [int]$connection.OwningProcess
      remoteAddress = $remote
      remotePort = [int]$connection.RemotePort
    }
  }
  return @($connections)
}

function Invoke-RuntimeProbe([string]$Executable) {
  $port = Get-FreeTcpPort
  $previousArguments = [Environment]::GetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'Process')
  $arguments = "--remote-debugging-port=$port --proxy-server=127.0.0.1:9 --proxy-bypass-list=<-loopback>"
  [Environment]::SetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', $arguments, 'Process')
  $process = $null
  $socket = $null
  $startedAt = [DateTime]::UtcNow
  try {
    $process = Start-Process -FilePath $Executable -PassThru
    $endpoint = "http://127.0.0.1:$port"
    Wait-ForCondition {
      try { $null -ne (Invoke-RestMethod -UseBasicParsing -Uri "$endpoint/json/version" -TimeoutSec 2) } catch { $false }
    } 45 'CLEAN_MACHINE_CDP_TIMEOUT'
    $cdpReadyMs = [int]([DateTime]::UtcNow - $startedAt).TotalMilliseconds
    $target = $null
    Wait-ForCondition {
      try {
        $targets = @(Invoke-RestMethod -UseBasicParsing -Uri "$endpoint/json/list" -TimeoutSec 2)
        $script:SelectedTarget = $targets | Where-Object { [string]$_.url -eq $ExpectedUrl } | Select-Object -First 1
        $null -ne $script:SelectedTarget
      } catch { $false }
    } 45 'CLEAN_MACHINE_REFERENCE_TARGET_TIMEOUT'
    $target = $script:SelectedTarget
    $socket = New-Object Net.WebSockets.ClientWebSocket
    [void]$socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    [void](Invoke-CdpCommand $socket 'Runtime.enable')
    [void](Invoke-CdpCommand $socket 'Page.enable')
    $expression = @'
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (read, code) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const value = read();
      if (value) return value;
      await sleep(100);
    }
    throw new Error(code);
  };
  const input = await waitFor(() => document.querySelector('input[type="search"]'), 'SEARCH_INPUT_TIMEOUT');
  performance.clearResourceTimings();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'metformin');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await waitFor(() => document.querySelectorAll('article').length, 'SEARCH_RESULTS_TIMEOUT');
  const violations = [];
  const record = (event) => violations.push({ blockedURI: event.blockedURI, directive: event.effectiveDirective });
  document.addEventListener('securitypolicyviolation', record);
  let externalFetchRejected = false;
  try { await fetch('https://example.com/native-policy-probe', { mode: 'no-cors' }); } catch { externalFetchRejected = true; }
  await sleep(100);
  document.removeEventListener('securitypolicyviolation', record);
  const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
  const externalResources = resources.filter((value) => new URL(value, location.href).origin !== 'https://tauri.localhost');
  const local = Object.fromEntries(Object.entries(localStorage));
  const session = Object.fromEntries(Object.entries(sessionStorage));
  return {
    profile: 'installed-native-reference',
    url: location.href,
    title: document.title,
    results: document.querySelectorAll('article').length,
    externalResources,
    local,
    session,
    workers: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    externalFetchRejected,
    violations,
    globalTauri: typeof window.__TAURI__,
    newWindowDenied: window.open('https://tauri.localhost/offline/index.html', '_blank') === null,
  };
})()
'@
    $evaluation = Invoke-CdpCommand $socket 'Runtime.evaluate' @{
      expression = $expression
      awaitPromise = $true
      returnByValue = $true
    }
    if ($null -ne $evaluation.PSObject.Properties['exceptionDetails']) { throw 'CLEAN_MACHINE_RUNTIME_EVALUATION_FAILED' }
    if ($null -eq $evaluation.PSObject.Properties['result']) {
      throw "CLEAN_MACHINE_RUNTIME_RESULT_MISSING:$($evaluation | ConvertTo-Json -Depth 12 -Compress)"
    }
    $value = $evaluation.result.value
    [void](Invoke-CdpCommand $socket 'Page.navigate' @{ url = 'https://tauri.localhost/admin/' })
    Start-Sleep -Milliseconds 750
    $locationResult = Invoke-CdpCommand $socket 'Runtime.evaluate' @{ expression = 'location.href'; returnByValue = $true }
    if ($null -eq $locationResult.PSObject.Properties['result']) {
      throw "CLEAN_MACHINE_LOCATION_RESULT_MISSING:$($locationResult | ConvertTo-Json -Depth 12 -Compress)"
    }
    $locationAfterDeniedNavigation = [string]$locationResult.result.value
    $processIds = @(Get-ProcessTreeIds $process.Id)
    $externalConnections = @(Get-ExternalConnections $processIds)
    $localProperties = @($value.local.PSObject.Properties)
    $sessionProperties = @($value.session.PSObject.Properties)
    $languageKeysOnly = @($localProperties | Where-Object { [string]$_.Name -ne 'glymize-ui-language' }).Count -eq 0
    $queryPersisted = @($localProperties | Where-Object { [string]$_.Value -eq 'metformin' }).Count -gt 0
    $passed = (
      [string]$value.profile -eq 'installed-native-reference' -and
      [string]$value.url -eq $ExpectedUrl -and
      [int]$value.results -eq 30 -and
      @($value.externalResources).Count -eq 0 -and
      $languageKeysOnly -and -not $queryPersisted -and
      $sessionProperties.Count -eq 0 -and
      [int]$value.workers -eq 0 -and
      [bool]$value.externalFetchRejected -and
      @($value.violations | Where-Object { [string]$_.directive -eq 'connect-src' }).Count -gt 0 -and
      [string]$value.globalTauri -eq 'undefined' -and
      [bool]$value.newWindowDenied -and
      $locationAfterDeniedNavigation -eq $ExpectedUrl -and
      $externalConnections.Count -eq 0
    )
    return [pscustomobject]@{
      passed = [bool]$passed
      cdpReadyMs = $cdpReadyMs
      result = $value
      locationAfterDeniedNavigation = $locationAfterDeniedNavigation
      processIds = $processIds
      externalConnections = $externalConnections
    }
  } finally {
    if ($null -ne $socket) {
      try { $socket.Dispose() } catch {}
    }
    if ($null -ne $process) {
      try {
        $ids = @(Get-ProcessTreeIds $process.Id) | Sort-Object -Descending
        foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
      } catch {}
    }
    [Environment]::SetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', $previousArguments, 'Process')
  }
}

function Read-KitManifest {
  $manifestPath = Join-Path $KitRoot 'kit-manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'CLEAN_MACHINE_KIT_MANIFEST_MISSING' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ([int]$manifest.schemaVersion -ne 1 -or [string]$manifest.packet -ne 'R30-03-C2') { throw 'CLEAN_MACHINE_KIT_SCHEMA_REJECTED' }
  if ([bool]$manifest.sourceDirty) { throw 'CLEAN_MACHINE_DIRTY_SOURCE_REJECTED' }
  foreach ($name in @([string]$manifest.installer.fileName, [string]$manifest.acceptanceScript.fileName)) {
    if ([IO.Path]::GetFileName($name) -ne $name -or $name.Contains('/') -or $name.Contains('\')) { throw 'CLEAN_MACHINE_KIT_PATH_REJECTED' }
  }
  $installerPath = Join-Path $KitRoot ([string]$manifest.installer.fileName)
  $scriptPath = Join-Path $KitRoot ([string]$manifest.acceptanceScript.fileName)
  if (-not (Test-Path -LiteralPath $installerPath) -or -not (Test-Path -LiteralPath $scriptPath)) { throw 'CLEAN_MACHINE_KIT_FILE_MISSING' }
  return [pscustomobject]@{
    manifest = $manifest
    manifestPath = $manifestPath
    manifestSha256 = Get-Sha256 $manifestPath
    installerPath = $installerPath
    scriptPath = $scriptPath
    installerHashMatches = (Get-Sha256 $installerPath) -eq ([string]$manifest.installer.sha256).ToUpperInvariant()
    scriptHashMatches = (Get-Sha256 $scriptPath) -eq ([string]$manifest.acceptanceScript.sha256).ToUpperInvariant()
  }
}

function Get-LatestPhaseReport([string]$RequiredPhase) {
  if (-not (Test-Path -LiteralPath $EvidenceRoot)) { return $null }
  $file = Get-ChildItem -LiteralPath $EvidenceRoot -Filter "*-$($RequiredPhase.ToLowerInvariant()).json" -File |
    Sort-Object Name -Descending | Select-Object -First 1
  if ($null -eq $file) { return $null }
  return Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
}

function New-BaseGates($Kit, $HostSnapshot) {
  $isAudit = $Phase.StartsWith('Audit', [StringComparison]::Ordinal)
  $manifestAnchorMatches = $ExpectedKitManifestSha256 -match '^[0-9A-Fa-f]{64}$' -and
    $Kit.manifestSha256 -eq $ExpectedKitManifestSha256.ToUpperInvariant()
  return @(
    (New-Gate 'externally-pinned-kit-manifest' ($isAudit -or $manifestAnchorMatches) 'caller supplies the published kit-manifest SHA-256' $(if ($ExpectedKitManifestSha256) { $ExpectedKitManifestSha256.ToUpperInvariant() } else { 'not supplied; audit-only' })),
    (New-Gate 'kit-installer-sha256' ([bool]$Kit.installerHashMatches) $Kit.manifest.installer.sha256 (Get-Sha256 $Kit.installerPath)),
    (New-Gate 'kit-script-sha256' ([bool]$Kit.scriptHashMatches) $Kit.manifest.acceptanceScript.sha256 (Get-Sha256 $Kit.scriptPath)),
    (New-Gate 'windows-11-x64' ($HostSnapshot.buildNumber -ge 22000 -and $HostSnapshot.architecture -match '64') 'Windows 11 x64 build >= 22000' "$($HostSnapshot.caption) $($HostSnapshot.version) $($HostSnapshot.architecture)"),
    (New-Gate 'non-elevated-token' (-not $HostSnapshot.isElevated) $false $HostSnapshot.isElevated)
  )
}

function Invoke-Preflight($Kit, $HostSnapshot) {
  $webView = @(Get-WebView2Registrations)
  $tools = @(Get-ToolchainFindings)
  $blackout = Get-BlackoutSnapshot
  $app = Get-AppState
  $gates = @(New-BaseGates $Kit $HostSnapshot)
  $gates += New-Gate 'developer-toolchains-absent' ($tools.Count -eq 0) 'no Git/Node/pnpm/Rust/Cargo/MSVC/MSBuild' $tools
  $gates += New-Gate 'network-blackout-before-install' ([bool]$blackout.passed) 'DNS and TCP/443 blocked for GitHub and Cloudflare' $blackout.targets
  $gates += New-Gate 'application-initially-absent' (-not $app.registered -and -not $app.executablePresent) 'not installed' $app
  $webViewInitialState = if ($webView.Count -eq 0) { 'absent' } else { 'preinstalled' }
  return [pscustomobject]@{ gates = $gates; observations = [pscustomobject]@{ webView2InitialState = $webViewInitialState; webView2 = $webView; toolchains = $tools; blackout = $blackout; app = $app } }
}

function Invoke-AuditRuntime($Kit, $HostSnapshot) {
  $app = Get-AppState
  $gates = @(New-BaseGates $Kit $HostSnapshot)
  $gates += New-Gate 'application-available-for-audit' ($app.registered -and $app.executablePresent) 'installed candidate available' $app
  if ($app.executablePresent) {
    $runtime = Invoke-RuntimeProbe $app.executable
    $gates += New-Gate 'installed-runtime-reference-policy' ([bool]$runtime.passed) 'local reference passes UI, CSP, navigation, state and process-egress checks' $runtime
  } else {
    $runtime = $null
    $gates += New-Gate 'installed-runtime-reference-policy' $false 'installed candidate required' 'application executable absent'
  }
  return [pscustomobject]@{ gates = $gates; observations = [pscustomobject]@{ app = $app; runtime = $runtime } }
}

function Assert-PriorPhase([string]$PriorPhase, [string]$ManifestSha256) {
  $prior = Get-LatestPhaseReport $PriorPhase
  if ($null -eq $prior -or -not [bool]$prior.passed -or [string]$prior.kitManifestSha256 -ne $ManifestSha256) {
    throw "CLEAN_MACHINE_PRIOR_PHASE_REQUIRED:$PriorPhase"
  }
  return $prior
}

function Install-Candidate($Kit) {
  $process = Start-Process -FilePath $Kit.installerPath -ArgumentList '/S' -PassThru -Wait
  Wait-ForCondition { (Get-AppState).executablePresent } 180 'CLEAN_MACHINE_INSTALL_TIMEOUT'
  return [int]$process.ExitCode
}

function Invoke-Install($Kit, $HostSnapshot) {
  $preflight = Assert-PriorPhase 'Preflight' $Kit.manifestSha256
  $initialWebView = @($preflight.observations.webView2)
  $blackoutBefore = Get-BlackoutSnapshot
  $exitCode = Install-Candidate $Kit
  $app = Get-AppState
  $webView = @(Get-WebView2Registrations)
  $runtime = Invoke-RuntimeProbe $app.executable
  $blackoutAfter = Get-BlackoutSnapshot
  $gates = @(New-BaseGates $Kit $HostSnapshot)
  $gates += New-Gate 'installer-exit' ($exitCode -eq 0) 0 $exitCode
  $gates += New-Gate 'current-user-application-installed' ($app.registered -and $app.executablePresent -and $app.installRoot.StartsWith($env:LOCALAPPDATA, [StringComparison]::OrdinalIgnoreCase)) 'registered executable under LOCALAPPDATA' $app
  $webViewExpected = if ($initialWebView.Count -eq 0) { 'installer provisions an official pv registration while offline' } else { 'preinstalled official pv registration remains available while offline' }
  $gates += New-Gate 'webview2-available-offline-after-install' ($webView.Count -gt 0) $webViewExpected $webView
  $gates += New-Gate 'network-blackout-during-install' ($blackoutBefore.passed -and $blackoutAfter.passed) 'blackout before and after install' @($blackoutBefore, $blackoutAfter)
  $gates += New-Gate 'installed-runtime-reference-policy' ([bool]$runtime.passed) 'local reference passes UI, CSP, navigation, state and process-egress checks' $runtime
  $webViewProvisioningPath = if ($initialWebView.Count -eq 0) { 'installer-provisioned' } else { 'preinstalled' }
  return [pscustomobject]@{ gates = $gates; observations = [pscustomobject]@{ exitCode = $exitCode; app = $app; webView2Initial = $initialWebView; webView2ProvisioningPath = $webViewProvisioningPath; webView2 = $webView; runtime = $runtime; blackoutBefore = $blackoutBefore; blackoutAfter = $blackoutAfter } }
}

function Invoke-PostReboot($Kit, $HostSnapshot) {
  $install = Assert-PriorPhase 'Install' $Kit.manifestSha256
  $blackout = Get-BlackoutSnapshot
  $app = Get-AppState
  $runtime = Invoke-RuntimeProbe $app.executable
  $gates = @(New-BaseGates $Kit $HostSnapshot)
  $gates += New-Gate 'reboot-observed' ([string]$install.host.bootTimeUtc -ne [string]$HostSnapshot.bootTimeUtc) 'boot time differs from Install phase' @($install.host.bootTimeUtc, $HostSnapshot.bootTimeUtc)
  $gates += New-Gate 'network-blackout-after-reboot' ([bool]$blackout.passed) 'DNS and TCP/443 blocked' $blackout.targets
  $gates += New-Gate 'application-survives-reboot' ($app.registered -and $app.executablePresent) 'installed and registered' $app
  $gates += New-Gate 'post-reboot-runtime-reference-policy' ([bool]$runtime.passed) 'runtime probe passes' $runtime
  return [pscustomobject]@{ gates = $gates; observations = [pscustomobject]@{ app = $app; runtime = $runtime; blackout = $blackout } }
}

function Invoke-UninstallReinstall($Kit, $HostSnapshot) {
  [void](Assert-PriorPhase 'PostReboot' $Kit.manifestSha256)
  $before = Get-AppState
  if (-not $before.uninstallerPresent) { throw 'CLEAN_MACHINE_UNINSTALLER_MISSING' }
  $uninstallProcess = Start-Process -FilePath $before.uninstaller -ArgumentList '/S' -PassThru -Wait
  Wait-ForCondition { -not (Get-AppState).executablePresent } 120 'CLEAN_MACHINE_UNINSTALL_TIMEOUT'
  $removed = Get-AppState
  $installExitCode = Install-Candidate $Kit
  $after = Get-AppState
  $runtime = Invoke-RuntimeProbe $after.executable
  $blackout = Get-BlackoutSnapshot
  $gates = @(New-BaseGates $Kit $HostSnapshot)
  $gates += New-Gate 'silent-uninstall-exit' ([int]$uninstallProcess.ExitCode -eq 0) 0 ([int]$uninstallProcess.ExitCode)
  $gates += New-Gate 'application-removed-before-reinstall' (-not $removed.registered -and -not $removed.executablePresent) 'registration and executable absent' $removed
  $gates += New-Gate 'silent-reinstall-exit' ($installExitCode -eq 0) 0 $installExitCode
  $gates += New-Gate 'application-restored' ($after.registered -and $after.executablePresent) 'registered executable present' $after
  $gates += New-Gate 'network-blackout-through-reinstall' ([bool]$blackout.passed) 'DNS and TCP/443 blocked' $blackout.targets
  $gates += New-Gate 'reinstalled-runtime-reference-policy' ([bool]$runtime.passed) 'runtime probe passes' $runtime
  return [pscustomobject]@{ gates = $gates; observations = [pscustomobject]@{ before = $before; removed = $removed; after = $after; runtime = $runtime; blackout = $blackout } }
}

function Invoke-Finalize($Kit, $HostSnapshot) {
  $phaseRows = @()
  foreach ($required in $RequiredPhases) {
    $report = Get-LatestPhaseReport $required
    $phaseRows += [pscustomobject]@{
      phase = $required
      present = [bool]($null -ne $report)
      passed = [bool]($null -ne $report -and [bool]$report.passed)
      sameKit = [bool]($null -ne $report -and [string]$report.kitManifestSha256 -eq $Kit.manifestSha256)
      evidencePath = if ($null -eq $report) { $null } else { [string]$report.evidencePath }
    }
  }
  $blackout = Get-BlackoutSnapshot
  $gates = @(New-BaseGates $Kit $HostSnapshot)
  $gates += New-Gate 'required-phases-complete' (@($phaseRows | Where-Object { -not $_.present -or -not $_.passed -or -not $_.sameKit }).Count -eq 0) 'all four phases pass for the same kit' $phaseRows
  $gates += New-Gate 'network-blackout-at-finalization' ([bool]$blackout.passed) 'DNS and TCP/443 blocked' $blackout.targets
  return [pscustomobject]@{ gates = $gates; observations = [pscustomobject]@{ phases = $phaseRows; blackout = $blackout } }
}

function Write-Evidence($Report) {
  New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null
  $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
  $path = Join-Path $EvidenceRoot "$stamp-$($Report.phase.ToLowerInvariant()).json"
  $Report | Add-Member -NotePropertyName evidencePath -NotePropertyValue $path
  $temporary = "$path.tmp"
  $Report | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $path
  return $path
}

$hostSnapshot = Get-HostSnapshot
$kit = $null
$phaseResult = $null
$fatal = $null
try {
  $kit = Read-KitManifest
  switch ($Phase) {
    'AuditHost' { $phaseResult = Invoke-Preflight $kit $hostSnapshot }
    'AuditRuntime' { $phaseResult = Invoke-AuditRuntime $kit $hostSnapshot }
    'Preflight' { $phaseResult = Invoke-Preflight $kit $hostSnapshot }
    'Install' { $phaseResult = Invoke-Install $kit $hostSnapshot }
    'PostReboot' { $phaseResult = Invoke-PostReboot $kit $hostSnapshot }
    'UninstallReinstall' { $phaseResult = Invoke-UninstallReinstall $kit $hostSnapshot }
    'Finalize' { $phaseResult = Invoke-Finalize $kit $hostSnapshot }
  }
} catch {
  $fatal = "$($_.Exception.Message) | $($_.ScriptStackTrace)"
  $phaseResult = [pscustomobject]@{
    gates = @((New-Gate 'phase-execution' $false 'phase completes without exception' $fatal))
    observations = [pscustomobject]@{}
  }
}

$gates = @($phaseResult.gates)
$passed = [bool](@($gates | Where-Object { $_.blocking -and -not $_.passed }).Count -eq 0)
$report = [pscustomobject]@{
  schemaVersion = 1
  packet = 'R30-03-C2'
  phase = $Phase
  generatedAtUtc = [DateTime]::UtcNow.ToString('o')
  kitManifestSha256 = if ($null -eq $kit) { $null } else { $kit.manifestSha256 }
  sourceRevision = if ($null -eq $kit) { $null } else { [string]$kit.manifest.sourceRevision }
  referenceManifestVersion = if ($null -eq $kit) { $null } else { [string]$kit.manifest.referenceManifestVersion }
  host = $hostSnapshot
  gates = $gates
  observations = $phaseResult.observations
  passed = $passed
  accepted = [bool]($Phase -eq 'Finalize' -and $passed)
  fatal = $fatal
}
$evidencePath = Write-Evidence $report
$summary = [ordered]@{
  phase = $Phase
  passed = $passed
  accepted = $report.accepted
  evidencePath = $evidencePath
  blockingFailures = @($gates | Where-Object { $_.blocking -and -not $_.passed } | ForEach-Object { $_.name })
}
$summary | ConvertTo-Json -Depth 6 -Compress | Write-Output
if (-not $Phase.StartsWith('Audit', [StringComparison]::Ordinal) -and -not $passed) {
  Write-Error 'CLEAN_MACHINE_ACCEPTANCE_INCOMPLETE'
  exit 1
}
