#!/usr/bin/env bash
#
# Kubeara control panel — remove the Docker Compose stack.
# Usage:
#   curl -fsSL https://get.kubeara.dev/uninstall.sh | bash
#   curl -fsSL https://kubeara.dev/control-panel/uninstall.sh | bash
#
# Environment:
#   KUBEARA_INSTALL_DIR        Same directory used by install.sh
#   KUBEARA_REMOVE_VOLUMES=1   Also delete Postgres data (docker compose down -v)
#   KUBEARA_TRACKING_URL       Override installation tracking endpoint
#
# Lifecycle tracking:
#   Reports UNINSTALL with the last successfully tracked version from .version.
#   Clears .installation-id and .version afterward so the next install.sh run
#   is a fresh INSTALL with a new installation UUID.

set -euo pipefail

readonly LOG_PREFIX="[kubeara-uninstall]"
readonly COMPOSE_FILE="docker-compose.control-panel.yml"
readonly ENV_FILE=".env.control-panel"
readonly INSTALLATION_ID_FILE=".installation-id"
readonly INSTALLATION_VERSION_FILE=".version"
readonly DEFAULT_TRACKING_URL="https://api.kubeara.dev/api/public/installations/events"

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

read_installation_id() {
  local id_file="${KUBEARA_INSTALL_DIR}/${INSTALLATION_ID_FILE}"
  if [[ ! -f "${id_file}" ]]; then
    return 0
  fi
  tr -d '[:space:]' <"${id_file}" || true
}

read_installation_version() {
  local version_file="${KUBEARA_INSTALL_DIR}/${INSTALLATION_VERSION_FILE}"
  if [[ ! -f "${version_file}" ]]; then
    return 0
  fi
  tr -d '[:space:]' <"${version_file}" || true
}

# Fallback when .version is missing: image tag from env, else channel, else unknown.
resolve_uninstall_version() {
  local version image tag
  version="$(read_installation_version || true)"
  if [[ -n "${version}" ]]; then
    printf '%s\n' "${version}"
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

  printf '%s\n' "${KUBEARA_CHANNEL:-unknown}"
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

json_append_string_field() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    return 0
  fi
  printf ',"%s":"%s"' "${key}" "$(json_escape "${value}")"
}

resolve_tracking_url() {
  printf '%s\n' "${KUBEARA_TRACKING_URL:-${DEFAULT_TRACKING_URL}}"
}

# Best-effort UNINSTALL report. Does not fail the uninstaller.
track_uninstall_event() {
  local installation_id="$1"
  local version="$2"
  local tracking_url payload
  local os_name os_version architecture docker_version compose_version
  local http_code response_file

  if [[ -z "${installation_id}" || -z "${version}" ]]; then
    warn "Skipping UNINSTALL tracking (missing installation id or version)."
    return 0
  fi

  tracking_url="$(resolve_tracking_url)"
  os_name="$(get_os_info || true)"
  os_version="$(get_os_version || true)"
  architecture="$(get_architecture || true)"
  docker_version="$(get_docker_version || true)"
  compose_version="$(get_compose_version || true)"

  payload="$(
    printf '{"installationId":"%s","eventType":"UNINSTALL","version":"%s","previousVersion":null,"userAgent":"%s"' \
      "$(json_escape "${installation_id}")" \
      "$(json_escape "${version}")" \
      "$(json_escape "kubeara-uninstall.sh")"
    json_append_string_field "os" "${os_name}"
    json_append_string_field "osVersion" "${os_version}"
    json_append_string_field "architecture" "${architecture}"
    json_append_string_field "dockerVersion" "${docker_version}"
    json_append_string_field "composeVersion" "${compose_version}"
    printf '}'
  )"

  response_file="$(mktemp)"
  info "Reporting UNINSTALL event (version ${version}) to ${tracking_url}…"
  info "Tracking payload: id=${installation_id} version=${version} os=${os_name:-?} arch=${architecture:-?} docker=${docker_version:-?}"
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
    info "Uninstall event recorded (HTTP ${http_code})."
  else
    warn "Could not report uninstall event (HTTP ${http_code}). Continuing uninstall."
    if [[ -s "${response_file}" ]]; then
      warn "Tracking response: $(tr -d '\n' <"${response_file}" | head -c 300)"
    fi
  fi
  rm -f "${response_file}"
}

clear_installation_tracking_state() {
  rm -f \
    "${KUBEARA_INSTALL_DIR}/${INSTALLATION_ID_FILE}" \
    "${KUBEARA_INSTALL_DIR}/${INSTALLATION_VERSION_FILE}"
  info "Cleared ${INSTALLATION_ID_FILE} and ${INSTALLATION_VERSION_FILE} (next install will be a fresh INSTALL)."
}

main() {
  local installation_id=""
  local version=""

  default_install_dir

  if [[ ! -d "${KUBEARA_INSTALL_DIR}" ]]; then
    error "Install directory not found: ${KUBEARA_INSTALL_DIR}"
  fi

  if [[ ! -f "${KUBEARA_INSTALL_DIR}/${COMPOSE_FILE}" ]]; then
    error "Compose file not found in ${KUBEARA_INSTALL_DIR}"
  fi

  if ! command -v docker >/dev/null 2>&1; then
    error "Docker is not installed"
  fi

  cd "${KUBEARA_INSTALL_DIR}"

  # Capture tracking identity before tearing the stack down.
  installation_id="$(read_installation_id || true)"
  version="$(resolve_uninstall_version || true)"

  local down_args=(down)
  if [[ "${KUBEARA_REMOVE_VOLUMES:-}" == "1" ]]; then
    down_args+=( -v )
    info "Stopping stack and removing volumes (database data will be deleted)…"
  else
    info "Stopping stack (data volumes kept). Set KUBEARA_REMOVE_VOLUMES=1 to delete DB data."
  fi

  if [[ -f "${ENV_FILE}" ]]; then
    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "${down_args[@]}"
  else
    docker compose -f "${COMPOSE_FILE}" "${down_args[@]}"
  fi

  track_uninstall_event "${installation_id}" "${version}" || true
  clear_installation_tracking_state

  info "Done. Install files remain in ${KUBEARA_INSTALL_DIR}"
}

main "$@"
