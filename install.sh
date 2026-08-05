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
#   KUBEARA_TRACKING_URL    Override installation tracking endpoint
#                           Default: https://api.kubeara.dev/api/public/installations/events
#
# Installation lifecycle tracking (POST …/api/public/installations/events):
#   INSTALL   — no .installation-id yet (or id exists but .version never saved)
#   UPGRADE   — .installation-id exists and .version differs from the version
#               in the repository's package.json
#   (skip)    — same version already reported in .version
#   UNINSTALL — handled by uninstall.sh; clears .installation-id + .version
#
# Version files (under KUBEARA_INSTALL_DIR):
#   .installation-id  Stable UUID for this host install (kept across upgrades)
#   .version          Last version successfully reported (INSTALL or UPGRADE)
#
#   ENCRYPTION_SECRET         Pre-set secret (default: auto-generate)
#   SKIP_MIGRATE=1            Skip database migrations + seed
#   KUBEARA_FORCE_ENV=1       Regenerate .env.control-panel from example

set -euo pipefail

readonly LOG_PREFIX="[kubeara-install]"
readonly COMPOSE_FILE="docker-compose.control-panel.yml"
readonly ENV_FILE=".env.control-panel"
readonly ENV_EXAMPLE=".env.control-panel.example"
readonly INSTALLATION_ID_FILE=".installation-id"
readonly INSTALLATION_VERSION_FILE=".version"
readonly DEFAULT_TRACKING_URL="https://api.kubeara.dev/api/public/installations/events"
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
      # Self-hosted compose Postgres has no TLS. Default development so current
      # Hub images (which enable SSL when NODE_ENV=production) can connect.
      NODE_ENV: ${NODE_ENV:-development}
      DOCKER_ENV: "true"
      DB_HOST: ${DB_HOST:-postgres}
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      DB_DATABASE: ${DB_DATABASE:-kubeara}
      DB_SSL: ${DB_SSL:-false}
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
      NODE_ENV: ${NODE_ENV:-development}
      DOCKER_ENV: "true"
      PORT: ${PORT:-3000}
      DB_HOST: ${DB_HOST:-postgres}
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      DB_DATABASE: ${DB_DATABASE:-kubeara}
      DB_SSL: ${DB_SSL:-false}
      ENCRYPTION_SECRET: ${ENCRYPTION_SECRET:?Set ENCRYPTION_SECRET in .env.control-panel}
      JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in .env.control-panel}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?Set JWT_REFRESH_SECRET in .env.control-panel}
      ACCESS_TOKEN_COOKIE_NAME: ${ACCESS_TOKEN_COOKIE_NAME:-kubeara_access_token}
      REFRESH_TOKEN_COOKIE_NAME: ${REFRESH_TOKEN_COOKIE_NAME:-kubeara_refresh_token}
      ACCESS_TOKEN_EXPIRES_IN: ${ACCESS_TOKEN_EXPIRES_IN:-15m}
      REFRESH_TOKEN_EXPIRES_IN: ${REFRESH_TOKEN_EXPIRES_IN:-7d}
      COOKIE_DOMAIN: ${COOKIE_DOMAIN:-}
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
      COOKIE_SAME_SITE: ${COOKIE_SAME_SITE:-lax}
      CONTROL_PANEL_URL: ${CONTROL_PANEL_URL:-http://localhost:3000}
      KUBEARA_AGENT_IMAGE: ${KUBEARA_AGENT_IMAGE:-kubeara/agent:prod}
      GRAFANA_CLOUD_LOKI_URL: ${GRAFANA_CLOUD_LOKI_URL:-}
      GRAFANA_CLOUD_LOKI_USER: ${GRAFANA_CLOUD_LOKI_USER:-}
      GRAFANA_CLOUD_LOKI_API_KEY: ${GRAFANA_CLOUD_LOKI_API_KEY:-}
      KUBEARA_ENV: ${KUBEARA_ENV:-}
      KUBEARA_HOST_LABEL: ${KUBEARA_HOST_LABEL:-control-panel}
      LOG_LEVEL: ${LOG_LEVEL:-info}
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
  local cors_origins

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
  cors_origins="${CORS_ALLOWED_ORIGINS:-http://localhost:${port},http://localhost:${console_port},http://127.0.0.1:${port},http://127.0.0.1:${console_port}}"

  cat >"${env_path}" <<EOF
# Generated by kubeara install.sh — core self-hosted configuration.
# Compose Postgres has no TLS; older Hub images enable SSL when NODE_ENV=production.
NODE_ENV=${NODE_ENV:-development}

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

ACCESS_TOKEN_COOKIE_NAME=${ACCESS_TOKEN_COOKIE_NAME:-kubeara_access_token}
REFRESH_TOKEN_COOKIE_NAME=${REFRESH_TOKEN_COOKIE_NAME:-kubeara_refresh_token}
ACCESS_TOKEN_EXPIRES_IN=${ACCESS_TOKEN_EXPIRES_IN:-15m}
REFRESH_TOKEN_EXPIRES_IN=${REFRESH_TOKEN_EXPIRES_IN:-7d}
COOKIE_DOMAIN=${COOKIE_DOMAIN:-}
COOKIE_SECURE=${COOKIE_SECURE:-false}
COOKIE_SAME_SITE=${COOKIE_SAME_SITE:-lax}

OTP_EXPIRES_IN=${OTP_EXPIRES_IN:-2m}
OTP_RESEND_MAX_ATTEMPTS=${OTP_RESEND_MAX_ATTEMPTS:-3}
OTP_RESEND_WINDOW_MINUTES=${OTP_RESEND_WINDOW_MINUTES:-2}

PUBLIC_API_ALLOWED_ORIGINS=${PUBLIC_API_ALLOWED_ORIGINS:-${cors_origins}}
CORS_ALLOWED_ORIGINS=${cors_origins}

DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=kubeara
DB_SSL=false

# Optional email (leave empty). Present so older control-panel images that still
# call getOrThrow('BREVO_*') can boot; new images treat empty as disabled.
BREVO_API_KEY=
BREVO_FROM_EMAIL=
BREVO_FROM_NAME=Kubeara
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
  ensure_core_env_config "${env_path}"
}

# Backfill core auth/cookie/CORS defaults required for self-hosted startup.
# Does not enable optional integrations (Stripe, Zoho, Brevo, Loki).
ensure_core_env_config() {
  local env_path="$1"
  local current
  local port console_port cors_origins

  port="$(grep -E '^[[:space:]]*PORT=' "${env_path}" 2>/dev/null | head -n1 | cut -d= -f2- || echo 3000)"
  console_port="$(grep -E '^[[:space:]]*CONSOLE_PORT=' "${env_path}" 2>/dev/null | head -n1 | cut -d= -f2- || echo 8080)"
  cors_origins="http://localhost:${port},http://localhost:${console_port},http://127.0.0.1:${port},http://127.0.0.1:${console_port}"

  current="$(grep -E '^[[:space:]]*JWT_SECRET=' "${env_path}" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  if [[ -z "${current}" || "${current}" == change-me-jwt-secret ]]; then
    set_env_var "JWT_SECRET" "${JWT_SECRET:-$(openssl rand -hex 32)}" "${env_path}"
  fi

  current="$(grep -E '^[[:space:]]*JWT_REFRESH_SECRET=' "${env_path}" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  if [[ -z "${current}" || "${current}" == change-me-jwt-refresh-secret ]]; then
    set_env_var "JWT_REFRESH_SECRET" "${JWT_REFRESH_SECRET:-$(openssl rand -hex 32)}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*ACCESS_TOKEN_EXPIRES_IN=' "${env_path}"; then
    set_env_var "ACCESS_TOKEN_EXPIRES_IN" "${ACCESS_TOKEN_EXPIRES_IN:-15m}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*REFRESH_TOKEN_EXPIRES_IN=' "${env_path}"; then
    set_env_var "REFRESH_TOKEN_EXPIRES_IN" "${REFRESH_TOKEN_EXPIRES_IN:-7d}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*ACCESS_TOKEN_COOKIE_NAME=' "${env_path}"; then
    set_env_var "ACCESS_TOKEN_COOKIE_NAME" \
      "${ACCESS_TOKEN_COOKIE_NAME:-kubeara_access_token}" \
      "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*REFRESH_TOKEN_COOKIE_NAME=' "${env_path}"; then
    set_env_var "REFRESH_TOKEN_COOKIE_NAME" \
      "${REFRESH_TOKEN_COOKIE_NAME:-kubeara_refresh_token}" \
      "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*COOKIE_DOMAIN=' "${env_path}"; then
    set_env_var "COOKIE_DOMAIN" "${COOKIE_DOMAIN:-}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*COOKIE_SECURE=' "${env_path}"; then
    set_env_var "COOKIE_SECURE" "${COOKIE_SECURE:-false}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*COOKIE_SAME_SITE=' "${env_path}"; then
    set_env_var "COOKIE_SAME_SITE" "${COOKIE_SAME_SITE:-lax}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*NODE_ENV=' "${env_path}"; then
    set_env_var "NODE_ENV" "${NODE_ENV:-development}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*OTP_EXPIRES_IN=' "${env_path}"; then
    set_env_var "OTP_EXPIRES_IN" "${OTP_EXPIRES_IN:-2m}" "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*PUBLIC_API_ALLOWED_ORIGINS=' "${env_path}"; then
    set_env_var "PUBLIC_API_ALLOWED_ORIGINS" \
      "${PUBLIC_API_ALLOWED_ORIGINS:-${cors_origins}}" \
      "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*CORS_ALLOWED_ORIGINS=' "${env_path}"; then
    set_env_var "CORS_ALLOWED_ORIGINS" \
      "${CORS_ALLOWED_ORIGINS:-${cors_origins}}" \
      "${env_path}"
  fi

  if ! grep -qE '^[[:space:]]*DB_SSL=' "${env_path}"; then
    set_env_var "DB_SSL" "${DB_SSL:-false}" "${env_path}"
  fi

  # Older published images call getOrThrow('BREVO_*') at startup. Ensure the keys
  # exist (even empty) so self-host boots until those images are replaced.
  if ! grep -qE '^[[:space:]]*BREVO_API_KEY=' "${env_path}"; then
    set_env_var "BREVO_API_KEY" "${BREVO_API_KEY:-}" "${env_path}"
  fi
  if ! grep -qE '^[[:space:]]*BREVO_FROM_EMAIL=' "${env_path}"; then
    set_env_var "BREVO_FROM_EMAIL" "${BREVO_FROM_EMAIL:-}" "${env_path}"
  fi
  if ! grep -qE '^[[:space:]]*BREVO_FROM_NAME=' "${env_path}"; then
    set_env_var "BREVO_FROM_NAME" "${BREVO_FROM_NAME:-Kubeara}" "${env_path}"
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

# --- Installation tracking (best-effort; never fails the installer) ---

generate_uuid() {
  local hex
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    # RFC 4122 version-4 UUID from 16 random bytes.
    hex="$(openssl rand -hex 16)"
    printf '%s-%s-4%s-%s%s-%s\n' \
      "${hex:0:8}" \
      "${hex:8:4}" \
      "${hex:13:3}" \
      "$(printf '%x' "$((0x${hex:16:1} & 0x3 | 0x8))")" \
      "${hex:17:3}" \
      "${hex:20:12}"
    return 0
  fi
  return 1
}

get_or_create_installation_id() {
  local id_file="${KUBEARA_INSTALL_DIR}/${INSTALLATION_ID_FILE}"
  local id

  if [[ -f "${id_file}" ]]; then
    id="$(tr -d '[:space:]' <"${id_file}" || true)"
    if [[ -n "${id}" ]]; then
      printf '%s\n' "${id}"
      return 0
    fi
  fi

  if ! id="$(generate_uuid)"; then
    warn "Could not generate installation ID."
    return 1
  fi
  printf '%s\n' "${id}" >"${id_file}"
  printf '%s\n' "${id}"
}

get_previous_version() {
  local version_file="${KUBEARA_INSTALL_DIR}/${INSTALLATION_VERSION_FILE}"
  if [[ ! -f "${version_file}" ]]; then
    return 0
  fi
  tr -d '[:space:]' <"${version_file}" || true
}

# Resolve the Release Please-managed version from the public repository.
# If GitHub is unavailable, fall back to the configured image tag/channel.
get_current_version() {
  local package_url repository_version last_reported_version image tag

  package_url="https://raw.githubusercontent.com/${KUBEARA_REPO}/${KUBEARA_VERSION}/package.json"
  repository_version="$(
    curl -fsSL \
      --connect-timeout 5 \
      --max-time 10 \
      "${package_url}" 2>/dev/null |
      sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*$/\1/p' |
      head -n1 || true
  )"
  if [[ -n "${repository_version}" ]]; then
    printf '%s\n' "${repository_version}"
    return 0
  fi

  # Avoid a false UPGRADE (for example, 0.0.15 → prod) during a temporary
  # GitHub outage. A fresh offline install still falls back to the image tag.
  last_reported_version="$(get_previous_version || true)"
  if [[ -n "${last_reported_version}" ]]; then
    printf '%s\n' "${last_reported_version}"
    return 0
  fi

  image="$(grep -E '^[[:space:]]*KUBEARA_CONTROL_PANEL_IMAGE=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  if [[ -n "${image}" && "${image}" == *:* ]]; then
    tag="${image##*:}"
    tag="${tag%%@*}"
    if [[ -n "${tag}" ]]; then
      printf '%s\n' "${tag}"
      return 0
    fi
  fi

  printf '%s\n' "${KUBEARA_CHANNEL:-prod}"
}

# Prints INSTALL, UPGRADE, or empty (skip — same version already reported).
# had_installation_id: 1 if .installation-id already existed before this run.
# previous_version comes from .version, which is written only after a successful
# tracking POST — so a failed report is retried on the next installer run.
detect_installation_event() {
  local current_version="$1"
  local previous_version="$2"
  local had_installation_id="$3"

  if [[ "${had_installation_id}" != "1" ]]; then
    printf '%s\n' "INSTALL"
    return 0
  fi

  # Never successfully reported (no .version) — retry as INSTALL.
  if [[ -z "${previous_version}" ]]; then
    printf '%s\n' "INSTALL"
    return 0
  fi

  if [[ "${previous_version}" == "${current_version}" ]]; then
    printf '%s\n' ""
    return 0
  fi

  printf '%s\n' "UPGRADE"
}

get_os_info() {
  local name=""
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    name="$(. /etc/os-release && printf '%s' "${NAME:-${ID:-}}")"
  fi
  printf '%s\n' "${name}"
}

get_os_version() {
  local version=""
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    version="$(. /etc/os-release && printf '%s' "${VERSION_ID:-}")"
  fi
  printf '%s\n' "${version}"
}

get_architecture() {
  case "$(uname -m 2>/dev/null || true)" in
    x86_64 | amd64) printf '%s\n' "amd64" ;;
    aarch64 | arm64) printf '%s\n' "arm64" ;;
    *) uname -m 2>/dev/null || true ;;
  esac
}

get_docker_version() {
  docker version --format '{{.Server.Version}}' 2>/dev/null || true
}

# Handles both "5.1.4" (--short) and "Docker Compose version v5.1.4".
get_compose_version() {
  local raw
  raw="$(docker compose version --short 2>/dev/null || docker compose version 2>/dev/null || true)"
  raw="$(printf '%s' "${raw}" | head -n1 | sed -E 's/^[^0-9]*v?([0-9]+(\.[0-9]+)*).*$/\1/' || true)"
  printf '%s\n' "${raw}"
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/'"$(printf '\t')"'/\\t/g' | tr -d '\n\r'
}

# Append ,"key":"value" when value is non-empty; no-op otherwise.
json_append_string_field() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    return 0
  fi
  printf ',"%s":"%s"' "${key}" "$(json_escape "${value}")"
}

save_installation_version() {
  local version="$1"
  local version_file="${KUBEARA_INSTALL_DIR}/${INSTALLATION_VERSION_FILE}"
  printf '%s\n' "${version}" >"${version_file}"
}

# Posts to DEFAULT_TRACKING_URL unless KUBEARA_TRACKING_URL is set.
resolve_tracking_url() {
  printf '%s\n' "${KUBEARA_TRACKING_URL:-${DEFAULT_TRACKING_URL}}"
}

track_installation_event() {
  local installation_id="$1"
  local event_type="$2"
  local version="$3"
  local previous_version="${4:-}"
  local tracking_url payload previous_json
  local os_name os_version architecture docker_version compose_version
  local http_code response_file

  if [[ -z "${installation_id}" || -z "${event_type}" || -z "${version}" ]]; then
    return 0
  fi

  tracking_url="$(resolve_tracking_url)"

  os_name="$(get_os_info || true)"
  os_version="$(get_os_version || true)"
  architecture="$(get_architecture || true)"
  docker_version="$(get_docker_version || true)"
  compose_version="$(get_compose_version || true)"

  if [[ "${event_type}" == "UPGRADE" ]]; then
    if [[ -z "${previous_version}" ]]; then
      previous_version="unknown"
    fi
    previous_json="\"$(json_escape "${previous_version}")\""
  else
    previous_json="null"
  fi

  payload="$(
    printf '{"installationId":"%s","eventType":"%s","version":"%s","previousVersion":%s,"userAgent":"%s"' \
      "$(json_escape "${installation_id}")" \
      "$(json_escape "${event_type}")" \
      "$(json_escape "${version}")" \
      "${previous_json}" \
      "$(json_escape "kubeara-install.sh")"
    json_append_string_field "os" "${os_name}"
    json_append_string_field "osVersion" "${os_version}"
    json_append_string_field "architecture" "${architecture}"
    json_append_string_field "dockerVersion" "${docker_version}"
    json_append_string_field "composeVersion" "${compose_version}"
    printf '}'
  )"

  response_file="$(mktemp)"
  info "Reporting ${event_type} event to ${tracking_url}…"
  if [[ "${event_type}" == "UPGRADE" ]]; then
    info "Tracking payload: id=${installation_id} ${previous_version} → ${version} os=${os_name:-?} arch=${architecture:-?} docker=${docker_version:-?}"
  else
    info "Tracking payload: id=${installation_id} version=${version} os=${os_name:-?} arch=${architecture:-?} docker=${docker_version:-?}"
  fi
  http_code="$(
    curl -sS \
      --connect-timeout 10 \
      --max-time 30 \
      -X POST \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "${payload}" \
      -o "${response_file}" \
      -w '%{http_code}' \
      "${tracking_url}" \
      2>/dev/null || printf '000'
  )"

  if [[ "${http_code}" =~ ^2 ]]; then
    info "Installation event recorded (HTTP ${http_code})."
    rm -f "${response_file}"
    return 0
  fi

  warn "Could not report installation event (HTTP ${http_code}). Will retry on next install."
  if [[ -s "${response_file}" ]]; then
    warn "Tracking response: $(tr -d '\n' <"${response_file}" | head -c 300)"
  fi
  rm -f "${response_file}"
  return 1
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
  local had_installation_id=0
  local installation_id=""
  local previous_version=""
  local current_version=""
  local event_type=""

  detect_local_deploy_dir || true
  default_install_dir
  require_docker
  prepare_install_dir
  materialize_deploy_files
  create_env_file

  if [[ -f "${KUBEARA_INSTALL_DIR}/${INSTALLATION_ID_FILE}" ]]; then
    had_installation_id=1
  fi
  installation_id="$(get_or_create_installation_id || true)"
  previous_version="$(get_previous_version || true)"
  current_version="$(get_current_version || true)"
  if [[ -n "${installation_id}" && -n "${current_version}" ]]; then
    event_type="$(detect_installation_event "${current_version}" "${previous_version}" "${had_installation_id}" || true)"
  fi

  if [[ "${event_type}" == "INSTALL" ]]; then
    info "Lifecycle: INSTALL (version ${current_version})"
  elif [[ "${event_type}" == "UPGRADE" ]]; then
    info "Lifecycle: UPGRADE (${previous_version:-unknown} → ${current_version})"
  elif [[ -n "${current_version}" ]]; then
    info "Lifecycle: no event (already on ${current_version})"
  fi

  info "Console image: $(grep -E '^KUBEARA_CONSOLE_IMAGE=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2-)"
  info "Control panel image: $(grep -E '^KUBEARA_CONTROL_PANEL_IMAGE=' "${KUBEARA_INSTALL_DIR}/${ENV_FILE}" | cut -d= -f2- || echo "(compose default)")"
  info "Pulling images…"
  compose pull

  info "Starting services…"
  compose up -d

  run_migrate
  wait_for_control_panel

  if [[ -n "${event_type}" && -n "${installation_id}" && -n "${current_version}" ]]; then
    if track_installation_event \
      "${installation_id}" \
      "${event_type}" \
      "${current_version}" \
      "${previous_version}"; then
      save_installation_version "${current_version}" || true
    else
      warn "Installation tracking failed; it will be retried on the next installer run."
    fi
  elif [[ -n "${installation_id}" && -n "${current_version}" ]]; then
    info "Skipping installation tracking (already reported version ${current_version})."
  else
    warn "Skipping installation tracking (missing installation id or version)."
  fi

  print_success
}

main "$@"
