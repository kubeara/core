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
  - Supported Linux: Debian/Ubuntu (apt), Alpine (apk) on real VMs.
  - Minimal Docker SSH test containers often cannot run dockerd; use a real VPS for E2E tests
    or run the test container with --privileged or -v /var/run/docker.sock:/var/run/docker.sock.
EOF
}

is_likely_container() {
    if [[ -f /.dockerenv ]]; then
        return 0
    fi
    if [[ -f /run/.containerenv ]]; then
        return 0
    fi
    if grep -Eq '(docker|containerd|kubepods|podman)' /proc/1/cgroup 2>/dev/null; then
        return 0
    fi
    return 1
}

host_docker_socket_present() {
    [[ -S /var/run/docker.sock ]]
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

docker_daemon_reachable() {
    if docker ps >/dev/null 2>&1; then
        return 0
    fi
    if command -v sg >/dev/null 2>&1 && sg docker -c "docker ps >/dev/null 2>&1" 2>/dev/null; then
        return 0
    fi
    if [[ ${#SUDO[@]} -gt 0 ]]; then
        run_privileged docker ps >/dev/null 2>&1 && return 0
    fi
    return 1
}

docker_compose_available() {
    if docker_daemon_reachable && docker compose version >/dev/null 2>&1; then
        return 0
    fi
    if [[ ${#SUDO[@]} -gt 0 ]] && run_privileged docker compose version >/dev/null 2>&1; then
        return 0
    fi
    if command -v sg >/dev/null 2>&1 && sg docker -c "docker compose version >/dev/null 2>&1" 2>/dev/null; then
        return 0
    fi
    if require_command docker-compose; then
        return 0
    fi
    return 1
}

start_docker_daemon_once() {
    if require_command rc-service; then
        if require_command rc-update; then
            run_privileged rc-update add docker default 2>/dev/null || true
        fi
        run_privileged rc-service docker start 2>/dev/null || true
        return 0
    fi

    if require_command service; then
        run_privileged service docker start 2>/dev/null || true
        return 0
    fi

    if require_command systemctl; then
        run_privileged systemctl enable docker 2>/dev/null || true
        run_privileged systemctl start docker 2>/dev/null || true
        return 0
    fi

    return 1
}

container_agent_install_hint() {
    cat <<EOF
This host looks like a container without a working local Docker daemon.
Automated agent install targets real SSH servers (VPS/bare metal), not minimal SSH-only containers.

For local SSH-in-Docker tests, either:
  - Use a real Linux VM, or
  - Run the test container with: --privileged, or
  - Mount the host socket: -v /var/run/docker.sock:/var/run/docker.sock

Production targets (Debian/Ubuntu/Alpine VPS) use systemd, OpenRC, or service and work as intended.
EOF
}

ensure_docker_daemon_running() {
    info "Ensuring Docker daemon is running..."

    if is_likely_container; then
        info "Detected container environment (/.dockerenv or cgroup)."
        if host_docker_socket_present; then
            info "Host Docker socket mounted at /var/run/docker.sock."
        fi
    fi

    if docker_daemon_reachable; then
        info "Docker daemon already reachable."
        return 0
    fi

    start_docker_daemon_once

    if ! docker_daemon_reachable && require_command apk && ! require_command rc-service; then
        if is_likely_container; then
            warn "Skipping openrc install inside minimal container (not a typical production layout)."
        else
            warn "No rc-service on this host — installing openrc for Docker service control..."
            run_privileged apk add --no-cache openrc
            start_docker_daemon_once
        fi
    fi

    if ! docker_daemon_reachable && require_command dockerd; then
        if is_likely_container; then
            warn "Attempting dockerd in container (may require --privileged on the test container)..."
        else
            warn "Starting dockerd directly..."
        fi
        run_privileged sh -c 'dockerd >/var/log/dockerd.log 2>&1 &' || true
        sleep 2
    fi

    local attempt=0
    while [[ "${attempt}" -lt 30 ]]; do
        if docker_daemon_reachable; then
            info "Docker daemon is reachable."
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    warn "Docker daemon did not become reachable."
    if is_likely_container; then
        error "$(container_agent_install_hint)"
    fi
    warn "On production VPS: ensure Docker is installed and the service manager can start it."
    return 1
}

log_check_docker_compose() {
    info "Checking docker compose..."

    if ! docker_compose_available; then
        if ! docker_daemon_reachable; then
            warn "  Docker daemon not reachable (try: sudo service docker start, or sudo dockerd &)"
        else
            warn "  MISSING: docker compose"
        fi
        return 1
    fi

    if docker compose version >/dev/null 2>&1; then
        info "  OK: docker compose ($(docker compose version 2>/dev/null))"
    elif [[ ${#SUDO[@]} -gt 0 ]] && run_privileged docker compose version >/dev/null 2>&1; then
        info "  OK: docker compose via sudo ($(run_privileged docker compose version 2>/dev/null))"
    elif require_command docker-compose; then
        info "  OK: docker-compose (legacy) ($(docker-compose --version 2>/dev/null))"
        warn "  Consider migrating to Docker Compose v2 plugin ('docker compose')."
    else
        info "  OK: docker compose (via sg docker)"
    fi
    return 0
}

# Tools the agent stack needs (Homebrew is only an install helper on macOS, not a runtime requirement).
agent_core_prerequisites_met() {
    require_command node || return 1
    require_command npm || return 1
    require_command docker || return 1
    docker_compose_available || return 1
    docker_daemon_reachable || return 1
    return 0
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

detect_linux_variant() {
    if [[ -f /etc/alpine-release ]] || grep -qi '^ID=alpine' /etc/os-release 2>/dev/null; then
        echo "alpine"
        return
    fi
    if require_command apt-get; then
        echo "debian"
        return
    fi
    echo "unknown"
}

# SSH-in-Docker lab images are not the same as customer VPS hosts.
is_inside_docker_container() {
    [[ -f /.dockerenv ]] && return 0
    grep -qaE 'docker|containerd' /proc/1/cgroup 2>/dev/null && return 0
    return 1
}

warn_if_ssh_lab_container() {
    if ! is_inside_docker_container; then
        return 0
    fi
    warn "Host appears to be a Docker container (/.dockerenv or cgroup)."
    warn "This is OK for SSH tests; nested Docker for the agent usually needs a real VM,"
    warn "or a privileged container / host docker.sock — not typical customer servers."
    return 0
}

# Empty when UID 0; otherwise "sudo -n" (non-interactive only — required for SSH automation).
SUDO=()

passwordless_sudo_help_message() {
    cat <<EOF
Passwordless sudo is required for automated agent install over SSH.
Options:
  1) Connect as root, or
  2) On the server (as root): echo '$(whoami) ALL=(ALL) NOPASSWD:ALL' | tee /etc/sudoers.d/$(whoami)
Then retry onboard.
EOF
}

init_elevation() {
    SUDO=()
    if [[ "$(id -u)" -eq 0 ]]; then
        info "Running package installs as root."
        return 0
    fi

    if ! require_command sudo; then
        error "sudo is required for package installation when not running as root."
    fi

    if ! sudo -n true 2>/dev/null; then
        error "$(passwordless_sudo_help_message)"
    fi

    SUDO=(sudo -n)
    info "Using passwordless sudo for package installs."
}

run_privileged() {
    if [[ ${#SUDO[@]} -eq 0 ]]; then
        "$@"
    else
        "${SUDO[@]}" "$@"
    fi
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
    if agent_core_prerequisites_met; then
        info "macOS: node, docker, and docker compose already available — skipping Homebrew."
        return 0
    fi

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

add_user_to_docker_group() {
    if id -nG "${USER}" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
        info "User ${USER} is already in the docker group."
        return
    fi
    info "Adding ${USER} to the docker group..."
    if require_command usermod; then
        run_privileged usermod -aG docker "${USER}"
    elif require_command addgroup; then
        run_privileged addgroup "${USER}" docker 2>/dev/null || run_privileged adduser "${USER}" docker
    fi
    warn "If 'docker' still fails in this SSH session, reconnect or run 'newgrp docker'."
}

install_on_debian() {
    init_elevation

    if ! require_command apt-get; then
        error "apt-get not found (expected Debian/Ubuntu)."
    fi

    info "Updating apt package index..."
    run_privileged apt-get update -y

    if ! require_command curl; then
        warn "curl is missing — installing..."
        info "Installing curl..."
        run_privileged apt-get install -y curl
    else
        info "curl already installed — skipping install."
    fi

    if ! require_command socat; then
        warn "socat is missing — installing (needed for the stable tunnel proxy)..."
        run_privileged apt-get install -y socat
    else
        info "socat already installed — skipping install."
    fi

    if ! require_command node; then
        warn "node is missing — installing Node.js LTS..."
        info "Installing Node.js LTS and npm..."
        if [[ ${#SUDO[@]} -eq 0 ]]; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
        else
            curl -fsSL https://deb.nodesource.com/setup_lts.x | "${SUDO[@]}" -E bash -
        fi
        run_privileged apt-get install -y nodejs
    else
        info "node already installed — skipping install."
    fi

    if ! require_command docker; then
        warn "docker is missing — installing Docker Engine..."
        info "Installing Docker Engine and Docker Compose plugin..."
        run_privileged apt-get install -y ca-certificates gnupg
        run_privileged install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | run_privileged gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        run_privileged chmod a+r /etc/apt/keyrings/docker.gpg
        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" |
            run_privileged tee /etc/apt/sources.list.d/docker.list >/dev/null
        run_privileged apt-get update -y
        run_privileged apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        run_privileged systemctl enable docker
        run_privileged systemctl start docker
        add_user_to_docker_group
    else
        info "docker already installed — skipping package install."
    fi

    ensure_docker_daemon_running
    add_user_to_docker_group
}

install_on_alpine() {
    init_elevation

    if ! require_command apk; then
        error "apk not found (expected Alpine Linux)."
    fi

    info "Alpine package installs (apk)..."

    run_privileged apk update

    if ! require_command curl; then
        warn "curl is missing — installing..."
        run_privileged apk add --no-cache curl
    else
        info "curl already installed — skipping install."
    fi

    if ! require_command socat; then
        warn "socat is missing — installing (needed for the stable tunnel proxy)..."
        run_privileged apk add --no-cache socat
    else
        info "socat already installed — skipping install."
    fi

    if ! require_command node || ! require_command npm; then
        warn "node/npm missing — installing..."
        run_privileged apk add --no-cache nodejs npm
    else
        info "node/npm already installed — skipping install."
    fi

    if ! require_command docker; then
        warn "docker is missing — installing..."
        info "Installing Docker Engine and Compose plugin (Alpine packages)..."
        run_privileged apk add --no-cache docker docker-cli-compose
        add_user_to_docker_group
    else
        info "docker already installed — skipping package install."
        if ! docker_compose_available; then
            warn "docker compose missing — installing plugin..."
            run_privileged apk add --no-cache docker-cli-compose
        fi
    fi

    ensure_docker_daemon_running
    add_user_to_docker_group
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
    elif ! docker_daemon_reachable; then
        warn "  docker CLI present but daemon not reachable after start attempt"
        missing=1
    fi
    if ! log_check_docker_compose; then
        missing=1
    fi

    if [[ "${missing}" -eq 1 ]]; then
        warn_if_ssh_lab_container
        if is_inside_docker_container; then
            error "Prerequisites missing. SSH-in-Docker test hosts often cannot run dockerd — use a real VPS for agent install, or onboard with installAgent:false."
        fi
        error "One or more prerequisites are missing. Supported: Debian/Ubuntu VPS (systemd) or Alpine VPS (OpenRC). Needs passwordless sudo or root."
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
    if [[ "${os_name}" == "linux" ]]; then
        info "Detected Linux variant: $(detect_linux_variant)"
    fi
    warn_if_ssh_lab_container

    run_prerequisite_checks

    if [[ "${CHECK_ONLY}" == true ]]; then
        info "Check-only mode — skipping installation."
        verify_prerequisites
        return
    fi

    info "Starting install phase for missing prerequisites (if any)..."

    if agent_core_prerequisites_met; then
        info "Required agent prerequisites already satisfied — skipping install phase."
        verify_prerequisites
        return
    fi

    case "${os_name}" in
        macos) install_on_macos ;;
        linux)
            case "$(detect_linux_variant)" in
                alpine) install_on_alpine ;;
                debian) install_on_debian ;;
                *)
                    error "Unsupported Linux. Supported: Debian/Ubuntu (apt), Alpine (apk)."
                    ;;
            esac
            ;;
        *) error "Unsupported OS. Supported: macOS, Debian/Ubuntu, Alpine Linux." ;;
    esac

    verify_prerequisites
}

main "$@"
