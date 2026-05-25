#!/usr/bin/env bash

# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

VERIFY_TIMEOUT_SEC="${VERIFY_TIMEOUT_SEC:-180}"
VERIFY_POLL_SEC="${VERIFY_POLL_SEC:-5}"

wait_for_container_running() {
  local ip=$1
  local service=$2
  local elapsed=0
  local status=""

  log "Waiting for service '${service}' to be running..."

  while (( elapsed < VERIFY_TIMEOUT_SEC )); do
    status="$(ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} ps --status running --services 2>/dev/null" || true)"
    if echo "${status}" | grep -qx "${service}"; then
      log "Service ${service} is running"
      return 0
    fi
    sleep "${VERIFY_POLL_SEC}"
    elapsed=$((elapsed + VERIFY_POLL_SEC))
  done

  die "Service ${service} did not reach running state within ${VERIFY_TIMEOUT_SEC}s"
}

wait_for_health_healthy() {
  local ip=$1
  local container_id=$2
  local elapsed=0
  local health=""

  log "Waiting for container healthcheck to be healthy..."

  while (( elapsed < VERIFY_TIMEOUT_SEC )); do
    health="$(ssh_cmd "${ip}" "docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ${container_id}" 2>/dev/null || echo unknown)"
    if [[ "${health}" == "healthy" ]]; then
      log "Container health status: healthy"
      return 0
    fi
    if [[ "${health}" == "unhealthy" ]]; then
      ssh_cmd "${ip}" "docker logs ${container_id} 2>&1 | tail -n 40" || true
      die "Container became unhealthy"
    fi
    sleep "${VERIFY_POLL_SEC}"
    elapsed=$((elapsed + VERIFY_POLL_SEC))
  done

  die "Container did not become healthy within ${VERIFY_TIMEOUT_SEC}s (last status: ${health})"
}

verify_postgresql() {
  local ip=$1

  wait_for_container_running "${ip}" "postgres"

  local container_id
  container_id="$(ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} ps -q postgres")"
  [[ -n "${container_id}" ]] || die "Could not find postgres container id"

  wait_for_health_healthy "${ip}" "${container_id}"

  load_env_into_shell

  ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose --env-file .env -p ${COMPOSE_PROJECT} exec -T postgres pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}" \
    >/dev/null

  log "PostgreSQL pg_isready check passed"
}

verify_redis() {
  local ip=$1

  wait_for_container_running "${ip}" "redis"

  ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose --env-file .env -p ${COMPOSE_PROJECT} exec -T redis redis-cli ping" \
    | grep -qx 'PONG' || die "Redis PING did not return PONG"

  log "Redis PING check passed"
}

verify_generic() {
  local ip=$1
  local service
  local services
  local container_id
  local health

  services="$(ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} config --services")"
  [[ -n "${services}" ]] || die "No services found in compose project"

  while IFS= read -r service; do
    [[ -n "${service}" ]] || continue
    wait_for_container_running "${ip}" "${service}"

    container_id="$(ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} ps -q ${service}")"
    [[ -n "${container_id}" ]] || die "Could not find container for service: ${service}"

    health="$(ssh_cmd "${ip}" "docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ${container_id}" 2>/dev/null || echo none)"
    if [[ "${health}" != "none" ]]; then
      wait_for_health_healthy "${ip}" "${container_id}"
    fi
  done <<< "${services}"

  log "Generic verify passed for all compose services"
}

verify_service() {
  local ip=$1
  local slug=$2

  case "${slug}" in
    postgresql) verify_postgresql "${ip}" ;;
    redis) verify_redis "${ip}" ;;
    *) verify_generic "${ip}" ;;
  esac
}
