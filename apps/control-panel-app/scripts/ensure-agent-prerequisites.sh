#!/usr/bin/env bash

set -euo pipefail

LOG_PREFIX="[agent-prereq]"
CHECK_ONLY=false

info() {
    echo "${LOG_PREFIX} $*"
}

warn() {
    echo "${LOG_PREFIX} WARNING: $*" >&2
}

error() {
    echo "${LOG_PREFIX} ERROR: $*" >&2
    exit 1
}

usage() {
    cat <<EOF
Usage: $(basename "$0") [--check-only]

Ensures Docker, Docker Compose, Node.js, and npm are available for agent deployment.

Options:
  --check-only   Verify tools only; do not install (no sudo/password required)

Notes:
  - Do NOT run "sudo npm run prereq:agent". The script uses sudo internally on Linux
    only when package installation is needed.
  - On a fresh Linux server, installing missing packages will prompt for your user password.
EOF
}

require_command() {
    local command_name="$1"
    if ! command -v "${command_name}" >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

get_command_version() {
    local command_name="$1"
    case "${command_name}" in
        node) node --version 2>/dev/null ;;
        npm) npm --version 2>/dev/null ;;
        docker) docker --version 2>/dev/null | head -n 1 ;;
        curl) curl --version 2>/dev/null | head -n 1 ;;
        brew) brew --version 2>/dev/null | head -n 1 ;;
        docker-compose) docker-compose --version 2>/dev/null ;;
        docker-compose-plugin)
            if docker compose version >/dev/null 2>&1; then
                docker compose version 2>/dev/null
            else
                echo ""
            fi
            ;;
        *) "${command_name}" --version 2>/dev/null | head -n 1 ;;
    esac
}

log_check() {
    local label="$1"
    local command_name="$2"
    local version

    info "Checking ${label}..."

    if require_command "${command_name}"; then
        version="$(get_command_version "${command_name}")"
        if [[ -n "${version}" ]]; then
            info "  OK: ${label} (${version})"
        else
            info "  OK: ${label} (installed)"
        fi
        return 0
    fi

    warn "  MISSING: ${label}"
    return 1
}

log_check_docker_compose() {
    info "Checking docker compose..."

    if docker compose version >/dev/null 2>&1; then
        info "  OK: docker compose ($(docker compose version 2>/dev/null))"
        return 0
    fi

    if require_command docker-compose; then
        info "  OK: docker-compose (legacy) ($(docker-compose --version 2>/dev/null))"
        warn "  Consider migrating to Docker Compose v2 plugin ('docker compose')."
        return 0
    fi

    warn "  MISSING: docker compose"
    return 1
}

run_prerequisite_checks() {
    info "Running prerequisite checks..."
    log_check "curl" curl || true
    log_check "node" node || true
    log_check "npm" npm || true
    log_check "docker" docker || true
    log_check_docker_compose || true
    if [[ "$(detect_os)" == "macos" ]]; then
        log_check "homebrew" brew || true
    fi
    info "Prerequisite check pass complete."
}

detect_os() {
    case "$(uname -s)" in
        Darwin) echo "macos" ;;
        Linux) echo "linux" ;;
        *) echo "unsupported" ;;
    esac
}

install_homebrew_if_missing() {
    if require_command brew; then
        return
    fi

    info "Homebrew not found. Installing Homebrew (may prompt for password)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    if [[ -x /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
}

install_on_macos() {
    install_homebrew_if_missing

    if ! require_command node; then
        warn "node is missing — installing via Homebrew..."
        info "Installing Node.js (includes npm) via Homebrew..."
        brew install node
    else
        info "node already installed — skipping install."
    fi

    if ! require_command docker; then
        warn "docker is missing — installing Docker Desktop..."
        warn "You must open Docker Desktop once after install."
        info "Installing Docker Desktop cask..."
        brew install --cask docker
    else
        info "docker already installed — skipping install."
    fi
}

install_on_linux() {
    if ! require_command sudo; then
        error "sudo is required for Linux package installation."
    fi

    if ! require_command apt-get; then
        error "This script currently supports Debian/Ubuntu Linux (apt-get)."
    fi

    info "Linux package installs use sudo — you may be prompted for your user password."

    info "Updating apt package index..."
    sudo apt-get update -y

    if ! require_command curl; then
        warn "curl is missing — installing..."
        info "Installing curl..."
        sudo apt-get install -y curl
    else
        info "curl already installed — skipping install."
    fi

    if ! require_command node; then
        warn "node is missing — installing Node.js LTS..."
        info "Installing Node.js LTS and npm..."
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        info "node already installed — skipping install."
    fi

    if ! require_command docker; then
        warn "docker is missing — installing Docker Engine..."
        info "Installing Docker Engine and Docker Compose plugin..."
        sudo apt-get install -y ca-certificates gnupg
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" |
            sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
        sudo apt-get update -y
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        sudo systemctl enable docker
        sudo systemctl start docker
    else
        info "docker already installed — skipping install."
    fi
}

verify_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
        return
    fi

    if require_command docker-compose; then
        warn "'docker compose' plugin not found, but legacy 'docker-compose' exists."
        warn "Consider migrating to Docker Compose v2 plugin."
        return
    fi

    error "Docker Compose is not available. Install Docker Compose v2 plugin."
}

verify_prerequisites() {
    local missing=0

    info "Verifying final prerequisite state..."

    if ! log_check "node" node; then
        missing=1
    fi
    if ! log_check "npm" npm; then
        missing=1
    fi
    if ! log_check "docker" docker; then
        missing=1
    fi
    if ! log_check_docker_compose; then
        missing=1
    fi

    if [[ "${missing}" -eq 1 ]]; then
        error "One or more prerequisites are missing. Re-run without --check-only to install."
    fi

    info "All required prerequisites are available."
}

parse_args() {
    for arg in "$@"; do
        case "${arg}" in
            --check-only) CHECK_ONLY=true ;;
            -h | --help) usage; exit 0 ;;
            *) error "Unknown argument: ${arg}. Use --help for usage." ;;
        esac
    done
}

main() {
    parse_args "$@"

    local os_name
    os_name="$(detect_os)"

    info "Detected OS: ${os_name}"

    run_prerequisite_checks

    if [[ "${CHECK_ONLY}" == true ]]; then
        info "Check-only mode — skipping installation."
        verify_prerequisites
        return
    fi

    info "Starting install phase for missing prerequisites (if any)..."

    case "${os_name}" in
        macos) install_on_macos ;;
        linux) install_on_linux ;;
        *) error "Unsupported OS. Supported: macOS, Debian/Ubuntu Linux." ;;
    esac

    verify_prerequisites
}

main "$@"
