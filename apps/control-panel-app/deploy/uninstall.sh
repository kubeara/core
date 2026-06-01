#!/usr/bin/env bash
#
# Kubeara control panel — remove the Docker Compose stack.
# Usage:
#   curl -fsSL https://kubeara.dev/control-panel/uninstall.sh | bash
#
# Environment:
#   KUBEARA_INSTALL_DIR   Same directory used by install.sh
#   KUBEARA_REMOVE_VOLUMES=1   Also delete Postgres data (docker compose down -v)

set -euo pipefail

readonly LOG_PREFIX="[kubeara-uninstall]"
readonly COMPOSE_FILE="docker-compose.control-panel.yml"
readonly ENV_FILE=".env.control-panel"

info() {
  echo "${LOG_PREFIX} $*"
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

main() {
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

  info "Done. Install files remain in ${KUBEARA_INSTALL_DIR}"
}

main "$@"
