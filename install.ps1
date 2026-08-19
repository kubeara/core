#Requires -Version 5.1
<#
.SYNOPSIS
  Kubeara control panel — self-hosted installer for Windows (Docker Desktop).

.DESCRIPTION
  Mirrors install.sh for native PowerShell. If Docker Desktop is missing, downloads
  and installs it (UAC). Set KUBEARA_SKIP_DOCKER_INSTALL=1 to skip.

  Install:
    irm https://setup.kubeara.dev/install.ps1 | iex

  Prefer WSL/Git Bash when possible (same Unix one-liner):
    curl -fsSL https://setup.kubeara.dev | bash
#>

$ErrorActionPreference = "Stop"
$LogPrefix = "[kubeara-install]"
$ComposeFile = "docker-compose.control-panel.yml"
$EnvFile = ".env.control-panel"
$DefaultChannel = if ($env:KUBEARA_CHANNEL) { $env:KUBEARA_CHANNEL } else { "prod" }
$InstallScriptUrl = if ($env:KUBEARA_INSTALL_SH_URL) {
  $env:KUBEARA_INSTALL_SH_URL
} else {
  "https://setup.kubeara.dev"
}

function Write-Info([string]$Message) {
  Write-Host "$LogPrefix $Message"
}

function Write-Err([string]$Message) {
  Write-Host "$LogPrefix ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Get-DockerDesktopExe {
  @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Ensure-DockerCliOnPath {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    return $true
  }

  $cliDirs = @(
    "$env:ProgramFiles\Docker\Docker\resources\bin",
    "${env:ProgramFiles(x86)}\Docker\Docker\resources\bin"
  )
  foreach ($dir in $cliDirs) {
    if (Test-Path (Join-Path $dir "docker.exe")) {
      $env:Path = "$dir;$env:Path"
      if (Get-Command docker -ErrorAction SilentlyContinue) {
        return $true
      }
    }
  }
  return $false
}

function Test-DockerReady {
  try {
    docker info 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-VirtualizationStatus {
  $firmware = $null
  $hypervisor = $null
  try {
    $hypervisor = [bool](Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).HypervisorPresent
  } catch { }
  try {
    $firmware = [bool]((Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1).VirtualizationFirmwareEnabled)
  } catch { }
  [pscustomobject]@{
    FirmwareEnabled   = $firmware
    HypervisorPresent = $hypervisor
  }
}

function Test-WslReady {
  $wslCmd = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if (-not $wslCmd) {
    return $false
  }

  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = (& wsl.exe --status 2>&1 | Out-String)
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous

  if ($output -match "is not installed|was not installed|not supported with your current machine") {
    return $false
  }
  if ($code -eq 0) {
    return $true
  }
  if ($output -match "no installed distributions") {
    return $true
  }
  return $false
}

function Install-WslAndHypervisorFeatures {
  if ($env:KUBEARA_SKIP_DOCKER_INSTALL -eq "1") {
    Write-Err @"
WSL / Windows hypervisor is not ready. Docker Desktop needs WSL2.
  In an elevated PowerShell: wsl --install --no-distribution
  Then reboot and re-run this installer.
"@
  }

  $log = Join-Path $env:TEMP "kubeara-wsl-install.log"
  $scriptFile = Join-Path $env:TEMP "kubeara-wsl-install.ps1"
  @"
`$ErrorActionPreference = "Continue"
Start-Transcript -Path "$log" -Force
Write-Host "Kubeara: enabling WSL2 / Virtual Machine Platform..."
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
bcdedit /set hypervisorlaunchtype auto | Out-Null
Write-Host "Kubeara: installing WSL (no Linux distro)..."
wsl.exe --install --no-distribution --web-download
`$code = `$LASTEXITCODE
Write-Host "Kubeara: wsl --install exit `$code"
try { wsl.exe --update | Out-Null } catch {}
Stop-Transcript
exit `$code
"@ | Set-Content -Path $scriptFile -Encoding UTF8

  Write-Info "Installing/enabling WSL2. Approve the UAC prompt."
  Write-Info "The admin PowerShell window closes by itself when finished (that is normal)."
  Write-Info "Log: $log"

  $proc = Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $scriptFile
  )

  if ($null -eq $proc) {
    Write-Err @"
UAC was cancelled or the elevated PowerShell did not start.
  Approve the prompt, or run in an elevated PowerShell:
    wsl --install --no-distribution
  Log (if any): $log
"@
  }

  if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) {
    Write-Err @"
WSL install failed (exit $($proc.ExitCode)).
  Open $log
  Or run in an elevated PowerShell: wsl --install --no-distribution
"@
  }
}

function Ensure-WindowsVirtStack {
  $st = Get-VirtualizationStatus
  # WMI VirtualizationFirmwareEnabled is often false even when Task Manager
  # shows Enabled (especially before Hyper-V/WSL is running). Do not abort on it.
  if ($st.FirmwareEnabled -eq $false) {
    Write-Info "WMI did not report firmware virtualization (Task Manager can still show Enabled). Continuing with WSL setup."
  }

  if ((Test-WslReady) -and ($st.HypervisorPresent -eq $true)) {
    return
  }

  Write-Info "Windows hypervisor/WSL is not fully running yet. Enabling WSL2..."
  Install-WslAndHypervisorFeatures

  $st = Get-VirtualizationStatus
  if ($st.HypervisorPresent -eq $true -and (Test-WslReady)) {
    Write-Info "WSL / hypervisor looks ready."
    return
  }

  Write-Err @"
WSL features were enabled, but the Windows hypervisor is not running yet.
  This is normal. Reboot Windows, then:
    1. Open Docker Desktop and wait until it says Running
    2. Confirm: docker ps
    3. Re-run this installer

  The admin window that opened and closed was the WSL setup script finishing.
  Details: $env:TEMP\kubeara-wsl-install.log
"@
}

function Wait-DockerReady([int]$Seconds = 120) {
  Write-Info "Waiting for Docker Desktop (up to $Seconds seconds)…"
  for ($i = 1; $i -le $Seconds; $i++) {
    if (Test-DockerReady) {
      Write-Info "Docker is ready."
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Get-DockerDesktopInstallerUrl {
  $arch = $env:PROCESSOR_ARCHITECTURE
  if ($env:PROCESSOR_ARCHITEW6432) {
    $arch = $env:PROCESSOR_ARCHITEW6432
  }
  if ($arch -eq "ARM64") {
    return "https://desktop.docker.com/win/main/arm64/Docker%20Desktop%20Installer.exe"
  }
  return "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
}

function Install-DockerDesktop {
  if ($env:KUBEARA_SKIP_DOCKER_INSTALL -eq "1") {
    Write-Err @"
Docker Desktop is not installed.
  Install from https://docs.docker.com/desktop/setup/install/windows-install/
  Or unset KUBEARA_SKIP_DOCKER_INSTALL to let this installer download Docker Desktop.
"@
  }

  $url = Get-DockerDesktopInstallerUrl
  $installer = Join-Path $env:TEMP "DockerDesktopInstaller.exe"
  Write-Info "Docker Desktop is not installed. Downloading the official installer…"
  $ProgressPreference = "SilentlyContinue"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $installer
  } catch {
    Write-Err @"
Could not download Docker Desktop.
  Install manually: https://docs.docker.com/desktop/setup/install/windows-install/
  $($_.Exception.Message)
"@
  }

  Write-Info "Installing Docker Desktop (UAC prompt may appear; accepts Docker's license)…"
  $installArgs = @("install", "--quiet", "--accept-license", "--backend=wsl-2")
  $proc = Start-Process -FilePath $installer -ArgumentList $installArgs -Wait -PassThru -Verb RunAs
  if ($proc.ExitCode -ne 0) {
    Write-Err @"
Docker Desktop installer failed (exit $($proc.ExitCode)).
  Install manually: https://docs.docker.com/desktop/setup/install/windows-install/
  WSL2 is required; a reboot may be needed after the first install.
"@
  }

  Write-Info "Docker Desktop installed. Starting it…"
}

function Start-DockerDesktopApp {
  $dockerDesktop = Get-DockerDesktopExe
  if (-not $dockerDesktop) {
    Write-Err @"
Docker Desktop was installed but Docker Desktop.exe was not found.
  Reboot Windows, then re-run this installer.
"@
  }
  Start-Process -FilePath $dockerDesktop | Out-Null
}

function Require-Docker {
  if (-not (Ensure-DockerCliOnPath) -and -not (Get-DockerDesktopExe)) {
    Install-DockerDesktop
  }

  if (-not (Ensure-DockerCliOnPath)) {
    Write-Err @"
Docker CLI is not on PATH.
  Close this terminal, open a new PowerShell window, then re-run the installer.
  If Docker Desktop was just installed, reboot Windows first (WSL2).
"@
  }

  if (Test-DockerReady) {
    return
  }

  Ensure-WindowsVirtStack

  Write-Info "Starting Docker Desktop…"
  Start-DockerDesktopApp

  $waitSeconds = 180
  if (-not (Wait-DockerReady $waitSeconds)) {
    Write-Err @"
Docker Desktop did not become ready in time.
  Open Docker Desktop, wait until it says Running, reboot if this was a first install, then re-run.
"@
  }
}

function Get-InstallDir {
  if ($env:KUBEARA_INSTALL_DIR) {
    return $env:KUBEARA_INSTALL_DIR
  }
  return (Join-Path $env:USERPROFILE ".kubeara\control-panel")
}

# Git Bash can run install.sh against Docker Desktop. WSL bash cannot — it is a
# Linux environment with its own docker socket (sudo / docker group), not Desktop.
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

function Invoke-UnixInstallerIfAvailable {
  if (-not (Test-IsGitBash)) {
    $bash = Get-Command bash -ErrorAction SilentlyContinue
    if ($bash) {
      Write-Info "Skipping WSL/Linux bash; using Docker Desktop from PowerShell."
    }
    return $false
  }

  Write-Info "Git Bash detected - delegating to install.sh for a consistent install..."
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
  docker compose -f $ComposeFile --env-file $EnvFile --profile migrate run -T --rm migrate
}

Write-Info "Kubeara control panel install finished in $installDir"
Write-Info "Open the console URL from your .env (typically http://127.0.0.1:8080)."
