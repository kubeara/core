#!/usr/bin/env bash
#
# Kubeara control panel — self-hosted installer (Docker Compose).
#
# Fully standalone for curl | bash: only requires Docker + Compose + openssl + curl.
# Embeds docker-compose.control-panel.yml and generates .env.control-panel (no git clone).
# Images are pulled from Docker Hub (kubeara/control-panel, kubeara/console, postgres).
#
# Usage:
#   curl -fsSL https://get.kubeara.dev | sh
#   curl -fsSL https://kubeara.dev/control-panel/install.sh | bash
#   ./install.sh   (from a git clone — uses apps/control-panel-app/deploy/ compose files)
#
# Environment:
#   KUBEARA_INSTALL_DIR     Install directory (default: /opt/kubeara/control-panel or ~/.kubeara/control-panel)
#   KUBEARA_INSTALL_BASE    Optional URL to download compose/env instead of embedded defaults
#   KUBEARA_VERSION         Git ref when using KUBEARA_INSTALL_BASE (default: main)
#   KUBEARA_CHANNEL         Docker image tag when KUBEARA_SET_IMAGE_TAGS=1 (default: prod)
#   KUBEARA_SET_IMAGE_TAGS  1 = set all images to KUBEARA_CHANNEL; 0 = keep .env.example tags (local default)
#   KUBEARA_CONSOLE_IMAGE_OVERRIDE  Explicit console image (do not export KUBEARA_CONSOLE_IMAGE — same name as .env key)
#   KUBEARA_CONTROL_PANEL_IMAGE / KUBEARA_AGENT_IMAGE  Override API/agent images
#   KUBEARA_PUBLIC_URL      Public panel URL for remote agents (optional; console API defaults to localhost)
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
Compose source: apps/control-panel-app/deploy/docker-compose.control-panel.yml
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
  local script_dir candidate
  script_dir="$(cd "$(dirname "${script_path}")" && pwd)"
  for candidate in \
    "${script_dir}" \
    "${script_dir}/apps/control-panel-app/deploy"; do
    if [[ -f "${candidate}/${COMPOSE_FILE}" ]]; then
      KUBEARA_INSTALL_SOURCE="local"
      KUBEARA_DEPLOY_DIR="${candidate}"
      return 0
    fi
  done
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

default_local_api_url() {
  echo "http://127.0.0.1:${PORT:-3000}"
}

# Console SPA calls this from the browser — localhost avoids broken NAT/public-IP routing on the same host.
default_vite_api_url() {
  echo "http://localhost:${PORT:-3000}/api"
}

# Remote agents / onboard SSH install; set KUBEARA_PUBLIC_URL when the panel has a public hostname.
default_control_panel_url() {
  if [[ -n "${KUBEARA_PUBLIC_URL:-}" ]]; then
    echo "${KUBEARA_PUBLIC_URL}"
    return 0
  fi
  default_local_api_url
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

# Keep in sync with apps/control-panel-app/deploy/docker-compose.control-panel.yml
write_embedded_compose_file() {
  local dest="$1"
  cat >"${dest}" <<'COMPOSE_EOF'
# Kubeara control panel — pull images from Docker Hub (no source code required).
services:
  postgres:
    image: postgres:16-alpine
    container_name: kubeara-postgres
    environment:
      POSTGRES_USER: ${DB_USERNAME:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: ${DB_DATABASE:-kubeara}
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USERNAME:-postgres}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  migrate:
    profiles: ["migrate"]
    image: ${KUBEARA_CONTROL_PANEL_IMAGE}
    platform: ${DOCKER_PLATFORM:-linux/amd64}
    env_file:
      - .env.control-panel
    environment:
      NODE_ENV: production
      DOCKER_ENV: "true"
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      DB_DATABASE: ${DB_DATABASE:-kubeara}
      ENCRYPTION_SECRET: ${ENCRYPTION_SECRET:?Set ENCRYPTION_SECRET in .env.control-panel}
    volumes:
      - ./.env.control-panel:/app/apps/control-panel-app/.env:ro
    working_dir: /app
    command:
      [
        "sh",
        "-c",
        "node ./node_modules/typeorm/cli.js migration:run -d dist/apps/control-panel-app/config/typeorm.config.js && node dist/apps/control-panel-app/seeders/seed.js",
      ]
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  control-panel-app:
    image: ${KUBEARA_CONTROL_PANEL_IMAGE}
    platform: ${DOCKER_PLATFORM:-linux/amd64}
    container_name: kubeara-control-panel
    ports:
      - "${PORT:-3000}:3000"
    env_file:
      - .env.control-panel
    environment:
      NODE_ENV: production
      DOCKER_ENV: "true"
      PORT: ${PORT:-3000}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      DB_DATABASE: ${DB_DATABASE:-kubeara}
      ENCRYPTION_SECRET: ${ENCRYPTION_SECRET:?Set ENCRYPTION_SECRET in .env.control-panel}
      JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in .env.control-panel}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?Set JWT_REFRESH_SECRET in .env.control-panel}
      JWT_ACCESS_TOKEN_EXPIRES_IN: ${JWT_ACCESS_TOKEN_EXPIRES_IN:-15m}
      JWT_REFRESH_TOKEN_EXPIRES_IN: ${JWT_REFRESH_TOKEN_EXPIRES_IN:-7d}
      CONTROL_PANEL_URL: ${CONTROL_PANEL_URL:-}
      KUBEARA_AGENT_IMAGE: ${KUBEARA_AGENT_IMAGE:-kubeara/agent:latest}
    volumes:
      - ./.env.control-panel:/app/apps/control-panel-app/.env:ro
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  console:
    image: ${KUBEARA_CONSOLE_IMAGE:-kubeara/console:prod}
    platform: ${DOCKER_PLATFORM:-linux/amd64}
    container_name: kubeara-console
    ports:
      - "${CONSOLE_PORT:-8080}:80"
    environment:
      VITE_API_URL: ${VITE_API_URL:-http://localhost:3000/api}
    depends_on:
      control-panel-app:
        condition: service_started
    restart: unless-stopped

volumes:
  postgres_data:
COMPOSE_EOF
}

materialize_deploy_files() {
  local compose_dest="${KUBEARA_INSTALL_DIR}/${COMPOSE_FILE}"

  if [[ "${KUBEARA_INSTALL_SOURCE}" == "local" ]]; then
    cp "${KUBEARA_DEPLOY_DIR}/${COMPOSE_FILE}" "${compose_dest}"
    if [[ -f "${KUBEARA_DEPLOY_DIR}/${ENV_EXAMPLE}" ]]; then
      cp "${KUBEARA_DEPLOY_DIR}/${ENV_EXAMPLE}" "${KUBEARA_INSTALL_DIR}/${ENV_EXAMPLE}"
    fi
    return 0
  fi

  if [[ -n "${KUBEARA_INSTALL_BASE:-}" ]]; then
    info "Downloading compose files from ${KUBEARA_INSTALL_BASE}…"
    fetch_deploy_file "${COMPOSE_FILE}" "${compose_dest}"
    fetch_deploy_file "${ENV_EXAMPLE}" "${KUBEARA_INSTALL_DIR}/${ENV_EXAMPLE}" || true
    return 0
  fi

  info "Writing embedded ${COMPOSE_FILE} (no external download)"
  write_embedded_compose_file "${compose_dest}"
}

write_fresh_env_file() {
  local env_path="$1"
  local secret platform vite_api_url control_panel_url port console_port
  local jwt_access jwt_refresh
  local cp_image console_image agent_image

  secret="$(generate_encryption_secret)"
  platform="${DOCKER_PLATFORM:-$(detect_docker_platform)}"
  port="${PORT:-3000}"
  console_port="${CONSOLE_PORT:-8080}"
  vite_api_url="$(default_vite_api_url)"
  control_panel_url="$(default_control_panel_url)"
  jwt_access="${JWT_SECRET:-$(openssl rand -hex 32)}"
  jwt_refresh="${JWT_REFRESH_SECRET:-$(openssl rand -hex 32)}"
  cp_image="${KUBEARA_CONTROL_PANEL_IMAGE:-kubeara/control-panel:${KUBEARA_CHANNEL}}"
  console_image="${KUBEARA_CONSOLE_IMAGE_OVERRIDE:-kubeara/console:${KUBEARA_CHANNEL}}"
  agent_image="${KUBEARA_AGENT_IMAGE:-kubeara/agent:${KUBEARA_CHANNEL}}"

  cat >"${env_path}" <<EOF
# Generated by kubeara install.sh
KUBEARA_CONTROL_PANEL_IMAGE=${cp_image}
KUBEARA_CONSOLE_IMAGE=${console_image}
KUBEARA_AGENT_IMAGE=${agent_image}
DOCKER_PLATFORM=${platform}
PORT=${port}
CONSOLE_PORT=${console_port}
VITE_API_URL=${vite_api_url}
CONTROL_PANEL_URL=${control_panel_url}
ENCRYPTION_SECRET=${secret}
JWT_SECRET=${jwt_access}
JWT_REFRESH_SECRET=${jwt_refresh}
JWT_ACCESS_TOKEN_EXPIRES_IN=${JWT_ACCESS_TOKEN_EXPIRES_IN:-15m}
JWT_REFRESH_TOKEN_EXPIRES_IN=${JWT_REFRESH_TOKEN_EXPIRES_IN:-7d}
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=kubeara
EOF

  info "Wrote ${env_path}"
  info "Save ENCRYPTION_SECRET — use the same value if you install agents later."
}

create_env_file() {
  local env_path="${KUBEARA_INSTALL_DIR}/${ENV_FILE}"
  local example_path="${KUBEARA_INSTALL_DIR}/${ENV_EXAMPLE}"

  if [[ -f "${env_path}" && "${KUBEARA_FORCE_ENV:-}" != "1" ]]; then
    info "Using existing ${env_path} (secrets and DB settings kept)"
  elif [[ -f "${example_path}" ]]; then
    cp "${example_path}" "${env_path}"

    local secret platform vite_api_url control_panel_url
    secret="$(generate_encryption_secret)"
    platform="${DOCKER_PLATFORM:-$(detect_docker_platform)}"
    vite_api_url="$(default_vite_api_url)"
    control_panel_url="$(default_control_panel_url)"

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
    set_env_var "CONTROL_PANEL_URL" "${control_panel_url}" "${env_path}"
    set_env_var "VITE_API_URL" "${vite_api_url}" "${env_path}"

    info "Wrote ${env_path}"
    info "Save ENCRYPTION_SECRET — use the same value if you install agents later."
  else
    write_fresh_env_file "${env_path}"
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
  local port console_port
  port="$(grep -E '^PORT=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2- || echo 3000)"
  console_port="$(grep -E '^CONSOLE_PORT=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2- || echo 8080)"

  cat <<EOF

${LOG_PREFIX} Kubeara control panel is running.

  Install directory: ${KUBEARA_INSTALL_DIR}
  Control panel API: http://127.0.0.1:${port}
  Console (SPA):     http://127.0.0.1:${console_port}

EOF
}

main() {
  detect_local_deploy_dir || true
  default_install_dir
  require_docker
  prepare_install_dir
  materialize_deploy_files
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
