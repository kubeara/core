#!/usr/bin/env bash

# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/selfhost-e2e}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-selfhost-e2e}"

remote_deploy() {
  local ip=$1

  log "Deploying to ${ip}:${DEPLOY_REMOTE_DIR} (project: ${COMPOSE_PROJECT})"

  ssh_cmd "${ip}" "mkdir -p ${DEPLOY_REMOTE_DIR}"

  scp_to_server "${ip}" "${WORK_DIR}/${COMPOSE_FILE}" "${DEPLOY_REMOTE_DIR}/${COMPOSE_FILE}"
  scp_to_server "${ip}" "${WORK_DIR}/.env" "${DEPLOY_REMOTE_DIR}/.env"

  ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose --env-file .env -f ${COMPOSE_FILE} -p ${COMPOSE_PROJECT} config" \
    >/dev/null

  log "Compose config validation passed"

  ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose --env-file .env -f ${COMPOSE_FILE} -p ${COMPOSE_PROJECT} up -d"

  log "docker compose up -d completed"
}

remote_teardown_compose() {
  local ip=$1

  ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose --env-file .env -f ${COMPOSE_FILE} -p ${COMPOSE_PROJECT} down -v --remove-orphans" \
    >/dev/null 2>&1 || true
}
