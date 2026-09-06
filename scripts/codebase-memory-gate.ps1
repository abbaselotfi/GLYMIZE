param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('pre', 'post')]
    [string]$Phase,

    [switch]$RoadmapReviewed,
    [switch]$GraphRelevant
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $output = & git @Args
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE"
    }
    return $output
}

function Resolve-CbmExecutable {
    $command = Get-Command codebase-memory-mcp -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    if ($env:LOCALAPPDATA) {
        $defaultInstall = Join-Path $env:LOCALAPPDATA 'Programs\codebase-memory-mcp\codebase-memory-mcp.exe'
        if (Test-Path -LiteralPath $defaultInstall -PathType Leaf) {
            Write-Host "codebase-memory-mcp was not in PATH; using installed binary: $defaultInstall" -ForegroundColor Yellow
            return $defaultInstall
        }
    }

    throw 'codebase-memory-mcp is not available in PATH and was not found in the standard Windows install location under %LOCALAPPDATA%\Programs\codebase-memory-mcp.'
}

if (-not $RoadmapReviewed) {
    throw 'Roadmap review is mandatory. Read the applicable GLYMIZE Roadmap(s), then rerun with -RoadmapReviewed.'
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is not available in PATH.'
}

$cbm = Resolve-CbmExecutable

$repoRoot = (Invoke-Git rev-parse --show-toplevel | Select-Object -First 1).Trim()
Set-Location $repoRoot

Write-Host "GLYMIZE ROADMAP + GRAPH GATE [$Phase]" -ForegroundColor Cyan
Write-Host "Repository: $repoRoot"
Write-Host "CBM binary: $cbm"

Invoke-Git fetch origin main | Out-Null
$originMain = (Invoke-Git rev-parse origin/main | Select-Object -First 1).Trim()
$head = (Invoke-Git rev-parse HEAD | Select-Object -First 1).Trim()
$mergeBase = (Invoke-Git merge-base HEAD origin/main | Select-Object -First 1).Trim()

Write-Host "HEAD:        $head"
Write-Host "origin/main: $originMain"

if ($mergeBase -ne $originMain) {
    throw 'Current branch does not contain the latest origin/main. Sync/rebase/merge main before starting or completing an independent task.'
}

if ($Phase -eq 'pre') {
    $dirty = @(Invoke-Git status --porcelain)
    if ($dirty.Count -gt 0) {
        throw 'PRE-TASK gate requires a clean worktree for a new independent task. Finish/stash the existing task first.'
    }
}

function Get-CbmProject {
    # CBM 0.10.8 list_projects already emits a JSON object; it does not support --format.
    $lines = @(& $cbm cli list_projects)
    if ($LASTEXITCODE -ne 0) {
        throw 'Codebase Memory list_projects failed.'
    }
    $jsonLine = $lines | Where-Object { ([string]$_).TrimStart().StartsWith('{') } | Select-Object -Last 1
    if (-not $jsonLine) {
        throw 'Codebase Memory list_projects did not return a JSON object.'
    }
    $parsed = ([string]$jsonLine) | ConvertFrom-Json
    $rootNormalized = $repoRoot.Replace('\', '/')
    return @($parsed.projects | Where-Object { ([string]$_.root_path).Replace('\', '/') -eq $rootNormalized }) | Select-Object -First 1
}

$project = Get-CbmProject
if (-not $project) {
    Write-Host 'No local graph found for this checkout; creating a full persistent index...' -ForegroundColor Yellow
    & $cbm cli --progress index_repository --repo-path $repoRoot --mode full --persistence true
    if ($LASTEXITCODE -ne 0) { throw 'Initial Codebase Memory index failed.' }
    $project = Get-CbmProject
    if (-not $project) { throw 'Codebase Memory project was not discoverable after indexing.' }
}

$projectName = [string]$project.name
Write-Host "CBM project: $projectName"

Write-Host 'Capturing changes BEFORE refresh...' -ForegroundColor Cyan
& $cbm cli detect_changes --project $projectName
if ($LASTEXITCODE -ne 0) { throw 'Codebase Memory detect_changes failed.' }

Write-Host 'Current index status:' -ForegroundColor Cyan
& $cbm cli index_status --project $projectName
if ($LASTEXITCODE -ne 0) { throw 'Codebase Memory index_status failed.' }

$shouldRefresh = ($Phase -eq 'pre') -or $GraphRelevant
if ($shouldRefresh) {
    Write-Host 'Refreshing persistent graph from the final/current source state...' -ForegroundColor Cyan
    & $cbm cli --progress index_repository --repo-path $repoRoot --mode full --persistence true
    if ($LASTEXITCODE -ne 0) { throw 'Codebase Memory refresh failed.' }

    $project = Get-CbmProject
    if (-not $project) { throw 'Codebase Memory project disappeared after refresh.' }
    $projectName = [string]$project.name

    Write-Host 'Post-refresh index status:' -ForegroundColor Cyan
    & $cbm cli index_status --project $projectName
    if ($LASTEXITCODE -ne 0) { throw 'Post-refresh Codebase Memory index_status failed.' }
}

if (-not (Test-Path (Join-Path $repoRoot '.codebase-memory\graph.db.zst'))) {
    throw 'Persistent graph artifact .codebase-memory/graph.db.zst is missing.'
}
if (-not (Test-Path (Join-Path $repoRoot '.codebase-memory\artifact.json'))) {
    throw 'Persistent graph artifact metadata .codebase-memory/artifact.json is missing.'
}

Write-Host ''
Write-Host "ROADMAP + GRAPH GATE [$Phase]: PASS" -ForegroundColor Green
if ($Phase -eq 'post') {
    Write-Host 'Before opening/merging the PR, confirm the PR contains checked Roadmap review and Graph gate declarations.'
}
