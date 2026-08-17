#Requires -Version 5.1
<#
.SYNOPSIS
  Kubeara control panel — uninstall for Windows (Docker Desktop).

.DESCRIPTION
  Uninstall:
    irm https://get.kubeara.dev/uninstall.ps1 | iex

  Prefer WSL/Git Bash when possible:
    curl -fsSL https://get.kubeara.dev/uninstall.sh | bash
#>

$ErrorActionPreference = "Stop"
$LogPrefix = "[kubeara-uninstall]"
$ComposeFile = "docker-compose.control-panel.yml"
$EnvFile = ".env.control-panel"
$UninstallScriptUrl = if ($env:KUBEARA_UNINSTALL_SH_URL) {
  $env:KUBEARA_UNINSTALL_SH_URL
} else {
  "https://get.kubeara.dev/uninstall.sh"
}

function Write-Info([string]$Message) {
  Write-Host "$LogPrefix $Message"
}

function Write-Err([string]$Message) {
  Write-Host "$LogPrefix ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Test-DockerReady {
  try {
    docker info 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-InstallDir {
  if ($env:KUBEARA_INSTALL_DIR) {
    return $env:KUBEARA_INSTALL_DIR
  }
  return (Join-Path $env:USERPROFILE ".kubeara\control-panel")
}

function Test-IsGitBash {
  $bash = Get-Command bash -ErrorAction SilentlyContinue
  if (-not $bash) {
    return $false
  }
  $src = [string]$bash.Source
  if ($src -match '\\(System32|Sysnative)\\bash\.exe$') {
    return $false
  }
  $uname = ""
  try {
    $uname = (& bash -c "uname -s" 2>$null | Select-Object -First 1)
  } catch {
    return $false
  }
  return [string]$uname -match "MINGW|MSYS|CYGWIN"
}

if (Test-IsGitBash) {
  Write-Info "Git Bash detected - delegating to uninstall.sh..."
  & bash -c "curl -fsSL '$UninstallScriptUrl' | bash"
  if ($LASTEXITCODE -ne 0) {
    Write-Err "uninstall.sh failed (exit $LASTEXITCODE)"
  }
  exit 0
}

$bash = Get-Command bash -ErrorAction SilentlyContinue
if ($bash) {
  Write-Info "Skipping WSL/Linux bash; uninstalling with Docker Desktop from PowerShell."
}

if (-not (Test-DockerReady)) {
  Write-Err "Docker is not running. Start Docker Desktop, then re-run uninstall."
}

$installDir = Get-InstallDir
if (-not (Test-Path $installDir)) {
  Write-Err "Install directory not found: $installDir"
}

$composePath = Join-Path $installDir $ComposeFile
if (-not (Test-Path $composePath)) {
  Write-Err "Compose file not found in $installDir"
}

Set-Location $installDir
Write-Info "Removing containers, networks, volumes, and service images…"

$envPath = Join-Path $installDir $EnvFile
if (Test-Path $envPath) {
  docker compose -f $ComposeFile --env-file $EnvFile down --volumes --rmi all --remove-orphans
} else {
  docker compose -f $ComposeFile down --volumes --rmi all --remove-orphans
}

if ($LASTEXITCODE -ne 0) {
  Write-Err "docker compose down failed"
}

Set-Location $env:USERPROFILE
Remove-Item -Recurse -Force $installDir
$parent = Split-Path $installDir -Parent
if ($parent -and ((Split-Path $parent -Leaf) -eq ".kubeara")) {
  try {
    if ((Get-ChildItem $parent -Force | Measure-Object).Count -eq 0) {
      Remove-Item -Force $parent
    }
  } catch {
    # ignore non-empty / in-use parent
  }
}

Write-Info "Kubeara was completely removed."
