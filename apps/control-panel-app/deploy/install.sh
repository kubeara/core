#!/usr/bin/env bash
#
# Kubeara control panel — self-hosted installer (Docker Compose).
# Usage:
#   curl -fsSL https://kubeara.dev/control-panel/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/kubeara/core/main/apps/control-panel-app/deploy/install.sh | bash
#
# Environment:
#   KUBEARA_INSTALL_DIR     Install directory (default: /opt/kubeara/control-panel or ~/.kubeara/control-panel)
#   KUBEARA_INSTALL_BASE    Base URL for compose + env example (default: GitHub raw for KUBEARA_VERSION)
#   KUBEARA_VERSION         Git ref for remote files (default: main)
#   KUBEARA_CHANNEL         Docker image tag when KUBEARA_SET_IMAGE_TAGS=1 (default: prod)
#   KUBEARA_SET_IMAGE_TAGS  1 = set all images to KUBEARA_CHANNEL; 0 = keep .env.example tags (local default)
#   KUBEARA_CONSOLE_IMAGE_OVERRIDE  Explicit console image (do not export KUBEARA_CONSOLE_IMAGE — same name as .env key)
#   KUBEARA_CONTROL_PANEL_IMAGE / KUBEARA_AGENT_IMAGE  Override API/agent images
#   KUBEARA_PUBLIC_URL      Public control panel URL (default: auto-detect)
#   ENCRYPTION_SECRET       Pre-set secret (default: auto-generate)
#   SKIP_MIGRATE=1          Skip database migrations + seed
#   KUBEARA_FORCE_ENV=1     Regenerate .env.control-panel from example

set -euo pipefail

readonly LOG_PREFIX="[kubeara-install]"
readonly COMPOSE_FILE="docker-compose.control-panel.yml"
readonly ENV_FILE=".env.control-panel"
readonly ENV_EXAMPLE=".env.control-panel.example"
KUBEARA_REPO="${KUBEARA_REPO:-kubeara/core}"
KUBEARA_VERSION="${KUBEARA_VERSION:-main}"
KUBEARA_CHANNEL="${KUBEARA_CHANNEL:-prod}"
KUBEARA_INSTALL_SOURCE="remote"
KUBEARA_DEPLOY_DIR=""

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
Kubeara control panel installer

Environment variables:
  KUBEARA_INSTALL_DIR      Target directory for compose files and .env
  KUBEARA_INSTALL_BASE     URL prefix for remote compose/env files
  KUBEARA_VERSION            Git ref when downloading from GitHub (default: main)
  KUBEARA_CHANNEL            Image tag: prod, dev, etc. (default: prod)
  KUBEARA_PUBLIC_URL         e.g. http://203.0.113.10:3000 or https://panel.example.com
  ENCRYPTION_SECRET          Skip auto-generation if set
  SKIP_MIGRATE=1             Do not run migrations/seed
  KUBEARA_FORCE_ENV=1        Overwrite .env.control-panel

Docs: https://github.com/${KUBEARA_REPO}/blob/${KUBEARA_VERSION}/apps/control-panel-app/deploy/README.md
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

detect_local_deploy_dir() {
  local script_path="${BASH_SOURCE[0]:-}"
  if [[ -z "${script_path}" || "${script_path}" == "bash" || ! -f "${script_path}" ]]; then
    return 1
  fi
  local deploy_dir
  deploy_dir="$(cd "$(dirname "${script_path}")" && pwd)"
  if [[ -f "${deploy_dir}/${COMPOSE_FILE}" ]]; then
    KUBEARA_INSTALL_SOURCE="local"
    KUBEARA_DEPLOY_DIR="${deploy_dir}"
    return 0
  fi
  return 1
}

default_install_dir() {
  if [[ -n "${KUBEARA_INSTALL_DIR:-}" ]]; then
    return 0
  fi
  if [[ "$(id -u)" -eq 0 ]]; then
    KUBEARA_INSTALL_DIR="/opt/kubeara/control-panel"
  else
    KUBEARA_INSTALL_DIR="${HOME}/.kubeara/control-panel"
  fi
}

detect_docker_platform() {
  case "$(uname -m)" in
    aarch64 | arm64) echo "linux/arm64" ;;
    *) echo "linux/amd64" ;;
  esac
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    error "Docker is not installed. Install Docker Engine, then re-run this script.
  https://docs.docker.com/engine/install/"
  fi
  if ! docker info >/dev/null 2>&1; then
    error "Docker daemon is not running or you lack permission. Try: sudo usermod -aG docker \$USER"
  fi
  if ! docker compose version >/dev/null 2>&1; then
    error "Docker Compose v2 plugin is required (docker compose). See https://docs.docker.com/compose/install/"
  fi
}

fetch_deploy_file() {
  local name="$1"
  local dest="$2"
  if [[ "${KUBEARA_INSTALL_SOURCE}" == "local" ]]; then
    cp "${KUBEARA_DEPLOY_DIR}/${name}" "${dest}"
  else
    local base="${KUBEARA_INSTALL_BASE:-https://raw.githubusercontent.com/${KUBEARA_REPO}/${KUBEARA_VERSION}/apps/control-panel-app/deploy}"
    curl -fsSL "${base}/${name}" -o "${dest}"
  fi
}

set_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp="${file}.tmp.$$"
  if grep -q "^${key}=" "${file}" 2>/dev/null; then
    awk -v k="${key}" -v v="${value}" '
      BEGIN { FS=OFS="=" }
      $1 == k { print k "=" v; next }
      { print }
    ' "${file}" > "${tmp}"
    mv "${tmp}" "${file}"
  else
    echo "${key}=${value}" >> "${file}"
  fi
}

detect_public_url() {
  if [[ -n "${KUBEARA_PUBLIC_URL:-}" ]]; then
    echo "${KUBEARA_PUBLIC_URL}"
    return 0
  fi

  local port="${PORT:-3000}"
  local host=""

  if command -v curl >/dev/null 2>&1; then
    host="$(curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  fi
  if [[ -z "${host}" ]]; then
    host="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  if [[ -z "${host}" ]]; then
    host="127.0.0.1"
    warn "Could not detect public IP; using ${host}. Set KUBEARA_PUBLIC_URL for remote access."
  fi

  echo "http://${host}:${port}"
}

generate_encryption_secret() {
  if [[ -n "${ENCRYPTION_SECRET:-}" ]]; then
    echo "${ENCRYPTION_SECRET}"
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  error "openssl is required to generate ENCRYPTION_SECRET (or set ENCRYPTION_SECRET yourself)"
}

# Ensures .env uses kubeara/console:${KUBEARA_CHANNEL} (default prod). Does not read KUBEARA_CONSOLE_IMAGE
# from the shell — same name as the .env key; exporting it breaks installs after "source .env.control-panel".
apply_console_image() {
  local env_path="$1"
  local image tmp
  image="${KUBEARA_CONSOLE_IMAGE_OVERRIDE:-kubeara/console:${KUBEARA_CHANNEL}}"

  if [[ -n "${KUBEARA_CONSOLE_IMAGE_OVERRIDE:-}" ]]; then
    info "Console image override: ${image}"
  fi

  tmp="${env_path}.tmp.$$"
  grep -vE '^[[:space:]]*KUBEARA_CONSOLE_IMAGE=' "${env_path}" > "${tmp}"
  echo "KUBEARA_CONSOLE_IMAGE=${image}" >> "${tmp}"
  mv "${tmp}" "${env_path}"
}

prepare_install_dir() {
  mkdir -p "${KUBEARA_INSTALL_DIR}"
  cd "${KUBEARA_INSTALL_DIR}"
}

download_compose_files() {
  fetch_deploy_file "${COMPOSE_FILE}" "${KUBEARA_INSTALL_DIR}/${COMPOSE_FILE}"
  fetch_deploy_file "${ENV_EXAMPLE}" "${KUBEARA_INSTALL_DIR}/${ENV_EXAMPLE}"
}

create_env_file() {
  local env_path="${KUBEARA_INSTALL_DIR}/${ENV_FILE}"
  local env_is_new=0

  if [[ -f "${env_path}" && "${KUBEARA_FORCE_ENV:-}" != "1" ]]; then
    info "Using existing ${env_path} (secrets and DB settings kept)"
  else
    env_is_new=1
    cp "${KUBEARA_INSTALL_DIR}/${ENV_EXAMPLE}" "${env_path}"

    local secret platform public_url
    secret="$(generate_encryption_secret)"
    platform="${DOCKER_PLATFORM:-$(detect_docker_platform)}"
    public_url="$(detect_public_url)"

    # Remote installs default to Hub channel tags (prod) for API/agent.
    local set_image_tags="${KUBEARA_SET_IMAGE_TAGS:-}"
    if [[ -z "${set_image_tags}" ]]; then
      if [[ "${KUBEARA_INSTALL_SOURCE}" == "remote" ]]; then
        set_image_tags="1"
      else
        set_image_tags="0"
      fi
    fi

    if [[ -n "${KUBEARA_CONTROL_PANEL_IMAGE:-}" ]]; then
      set_env_var "KUBEARA_CONTROL_PANEL_IMAGE" "${KUBEARA_CONTROL_PANEL_IMAGE}" "${env_path}"
    elif [[ "${set_image_tags}" == "1" ]]; then
      set_env_var "KUBEARA_CONTROL_PANEL_IMAGE" "kubeara/control-panel:${KUBEARA_CHANNEL}" "${env_path}"
    fi

    if [[ -n "${KUBEARA_AGENT_IMAGE:-}" ]]; then
      set_env_var "KUBEARA_AGENT_IMAGE" "${KUBEARA_AGENT_IMAGE}" "${env_path}"
    elif [[ "${set_image_tags}" == "1" ]]; then
      set_env_var "KUBEARA_AGENT_IMAGE" "kubeara/agent:${KUBEARA_CHANNEL}" "${env_path}"
    fi

    set_env_var "DOCKER_PLATFORM" "${platform}" "${env_path}"
    set_env_var "ENCRYPTION_SECRET" "${secret}" "${env_path}"
    set_env_var "CONTROL_PANEL_URL" "${public_url}" "${env_path}"
    set_env_var "VITE_API_URL" "${public_url}" "${env_path}"

    info "Wrote ${env_path}"
    if [[ "${env_is_new}" -eq 1 ]]; then
      info "Save ENCRYPTION_SECRET — use the same value if you install agents later."
    fi
  fi

  apply_console_image "${env_path}"
  ensure_jwt_config "${env_path}"
}

ensure_jwt_config() {
  local env_path="$1"
  local current

  current="$(grep -E '^[[:space:]]*JWT_SECRET=' "${env_path}" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  if [[ -z "${current}" || "${current}" == change-me-jwt-secret ]]; then
    set_env_var "JWT_SECRET" "${JWT_SECRET:-$(openssl rand -hex 32)}" "${env_path}"
  fi

  current="$(grep -E '^[[:space:]]*JWT_REFRESH_SECRET=' "${env_path}" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  if [[ -z "${current}" || "${current}" == change-me-jwt-refresh-secret ]]; then
    set_env_var "JWT_REFRESH_SECRET" "${JWT_REFRESH_SECRET:-$(openssl rand -hex 32)}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*JWT_ACCESS_TOKEN_EXPIRES_IN=' "${env_path}"; then
    set_env_var "JWT_ACCESS_TOKEN_EXPIRES_IN" "${JWT_ACCESS_TOKEN_EXPIRES_IN:-15m}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*JWT_REFRESH_TOKEN_EXPIRES_IN=' "${env_path}"; then
    set_env_var "JWT_REFRESH_TOKEN_EXPIRES_IN" "${JWT_REFRESH_TOKEN_EXPIRES_IN:-7d}" "${env_path}"
  fi
}

compose() {
  docker compose -f "${KUBEARA_INSTALL_DIR}/${COMPOSE_FILE}" --env-file "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" "$@"
}

run_migrate() {
  if [[ "${SKIP_MIGRATE:-}" == "1" ]]; then
    info "Skipping migrations (SKIP_MIGRATE=1)"
    return 0
  fi
  info "Running database migrations and seeding templates…"
  compose --profile migrate run --rm migrate
}

wait_for_control_panel() {
  local port="${PORT:-3000}"
  local i
  info "Waiting for control panel on port ${port}…"
  for i in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${port}/api/health" -o /dev/null 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  warn "Control panel did not respond on http://127.0.0.1:${port}/api/health within 2 minutes. Check: docker compose -f ${COMPOSE_FILE} logs"
}

print_success() {
  # shellcheck source=/dev/null
  local port console_port public_url
  port="$(grep -E '^PORT=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2- || echo 3000)"
  console_port="$(grep -E '^CONSOLE_PORT=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2- || echo 8080)"
  public_url="$(grep -E '^CONTROL_PANEL_URL=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2- || echo "http://127.0.0.1:${port}")"

  cat <<EOF

${LOG_PREFIX} Kubeara control panel is running.

  Install directory: ${KUBEARA_INSTALL_DIR}
  Control panel API: http://127.0.0.1:${port}
  Console (SPA):     http://127.0.0.1:${console_port}
  Public API URL:    ${public_url}

Next steps:
  1. Open the console URL in your browser.
  2. Register / sign in and add a server from the dashboard.
  3. For remote agents, ensure CONTROL_PANEL_URL in .env.control-panel is reachable from target hosts.

Manage stack:
  cd ${KUBEARA_INSTALL_DIR}
  docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} ps
  docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} logs -f

Uninstall:
  curl -fsSL https://kubeara.dev/control-panel/uninstall.sh | bash

EOF
}

main() {
  detect_local_deploy_dir || true
  default_install_dir
  require_docker
  prepare_install_dir
  download_compose_files
  create_env_file

  info "Console image: $(grep -E '^KUBEARA_CONSOLE_IMAGE=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2-)"
  info "Control panel image: $(grep -E '^KUBEARA_CONTROL_PANEL_IMAGE=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2- || echo "(compose default)")"
  info "Pulling images…"
  compose pull

  info "Starting services…"
  compose up -d

  run_migrate
  wait_for_control_panel
  print_success
}

main "$@"
