#Requires -Version 5.1
<#
.SYNOPSIS
  Kubeara control panel — self-hosted installer for Windows (Docker Desktop).

.DESCRIPTION
  Mirrors install.sh for native PowerShell. Requires Docker Desktop running.

  Install:
    irm https://get.kubeara.dev/install.ps1 | iex

  Prefer WSL/Git Bash when possible (same Unix one-liner):
    curl -fsSL https://get.kubeara.dev | bash
#>

$ErrorActionPreference = "Stop"
$LogPrefix = "[kubeara-install]"
$ComposeFile = "docker-compose.control-panel.yml"
$EnvFile = ".env.control-panel"
$DefaultChannel = if ($env:KUBEARA_CHANNEL) { $env:KUBEARA_CHANNEL } else { "prod" }
$InstallScriptUrl = if ($env:KUBEARA_INSTALL_SH_URL) {
  $env:KUBEARA_INSTALL_SH_URL
} else {
  "https://raw.githubusercontent.com/kubeara/core/main/install.sh"
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

function Require-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err @"
Docker Desktop is not installed.
  Install from https://docs.docker.com/desktop/setup/install/windows-install/
  Start Docker Desktop, then re-run:
    irm https://get.kubeara.dev/install.ps1 | iex
"@
  }

  if (Test-DockerReady) {
    return
  }

  Write-Info "Docker Desktop is installed but not running. Attempting to start it…"
  $dockerDesktop = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  if ($dockerDesktop) {
    Start-Process -FilePath $dockerDesktop | Out-Null
  } else {
    Write-Err "Could not find Docker Desktop. Start it manually, then re-run this installer."
  }

  Write-Info "Waiting for Docker Desktop (up to 2 minutes)…"
  for ($i = 1; $i -le 120; $i++) {
    if (Test-DockerReady) {
      Write-Info "Docker is ready."
      return
    }
    Start-Sleep -Seconds 1
  }

  Write-Err "Docker Desktop did not become ready. Open it, wait until Running, then re-run."
}

function Get-InstallDir {
  if ($env:KUBEARA_INSTALL_DIR) {
    return $env:KUBEARA_INSTALL_DIR
  }
  return (Join-Path $env:USERPROFILE ".kubeara\control-panel")
}

# Prefer the shared bash installer when bash is available (Git Bash / WSL).
function Invoke-UnixInstallerIfAvailable {
  $bash = Get-Command bash -ErrorAction SilentlyContinue
  if (-not $bash) {
    return $false
  }

  Write-Info "bash detected — delegating to install.sh for a consistent install…"
  $env:KUBEARA_CHANNEL = $DefaultChannel
  & bash -c "curl -fsSL '$InstallScriptUrl' | bash"
  if ($LASTEXITCODE -ne 0) {
    Write-Err "install.sh failed (exit $LASTEXITCODE)"
  }
  return $true
}

Require-Docker

if (Invoke-UnixInstallerIfAvailable) {
  exit 0
}

# Fallback: minimal compose-only path without bash (download compose from GitHub raw).
$installDir = Get-InstallDir
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Set-Location $installDir

$repo = if ($env:KUBEARA_REPO) { $env:KUBEARA_REPO } else { "kubeara/core" }
$ref = if ($env:KUBEARA_VERSION) { $env:KUBEARA_VERSION } else { "main" }
$base = "https://raw.githubusercontent.com/$repo/$ref/apps/control-panel-app/deploy"

Write-Info "Downloading compose files into $installDir …"
Invoke-WebRequest -UseBasicParsing -Uri "$base/docker-compose.control-panel.yml" -OutFile (Join-Path $installDir $ComposeFile)
$examplePath = Join-Path $installDir ".env.control-panel.example"
Invoke-WebRequest -UseBasicParsing -Uri "$base/.env.control-panel.example" -OutFile $examplePath

$envPath = Join-Path $installDir $EnvFile
if (-not (Test-Path $envPath) -or $env:KUBEARA_FORCE_ENV -eq "1") {
  Copy-Item $examplePath $envPath -Force
  Write-Info "Created $EnvFile (review secrets as needed)."
}

Write-Info "Pulling images…"
docker compose -f $ComposeFile --env-file $EnvFile pull
if ($LASTEXITCODE -ne 0) { Write-Err "docker compose pull failed" }

Write-Info "Starting services…"
docker compose -f $ComposeFile --env-file $EnvFile up -d
if ($LASTEXITCODE -ne 0) { Write-Err "docker compose up failed" }

if ($env:SKIP_MIGRATE -ne "1") {
  Write-Info "Running migrations…"
  docker compose -f $ComposeFile --env-file $EnvFile --profile migrate run --rm migrate
}

Write-Info "Kubeara control panel install finished in $installDir"
Write-Info "Open the console URL from your .env (typically http://127.0.0.1:8080)."
