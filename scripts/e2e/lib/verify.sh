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

wait_for_service_completed_successfully() {
  local ip=$1
  local service=$2
  local timeout_sec="${3:-${VERIFY_TIMEOUT_SEC}}"
  local elapsed=0
  local status=""
  local exit_code=""

  log "Waiting for service '${service}' to complete successfully..."

  while (( elapsed < timeout_sec )); do
    status="$(ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} ps -a ${service} --format '{{.State}}' 2>/dev/null" || true)"
    if [[ "${status}" == "exited" ]]; then
      exit_code="$(ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} ps -a ${service} --format '{{.ExitCode}}' 2>/dev/null" || true)"
      if [[ "${exit_code}" == "0" ]]; then
        log "Service ${service} completed successfully"
        return 0
      fi

      ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} logs --no-color ${service} 2>&1 | tail -n 40" || true
      die "Service ${service} exited with code ${exit_code:-unknown}"
    fi

    sleep "${VERIFY_POLL_SEC}"
    elapsed=$((elapsed + VERIFY_POLL_SEC))
  done

  die "Service ${service} did not complete within ${timeout_sec}s (last status: ${status:-unknown})"
}

verify_postgresql() {
  local ip=$1

  wait_for_container_running "${ip}" "postgres"

  local container_id
  container_id="$(ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} ps -q postgres")"
  [[ -n "${container_id}" ]] || die "Could not find postgres container id"

  wait_for_health_healthy "${ip}" "${container_id}"

  load_env_into_shell

  local pg_user="${SERVICE_USER_POSTGRES:-${POSTGRES_USER:-postgres}}"
  local pg_db="${POSTGRES_DB:-postgres}"

  ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose --env-file .env -p ${COMPOSE_PROJECT} exec -T postgres pg_isready -U ${pg_user} -d ${pg_db}" \
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

verify_ollama() {
  local ip=$1

  wait_for_container_running "${ip}" "ollama"

  local container_id
  container_id="$(ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} ps -q ollama")"
  [[ -n "${container_id}" ]] || die "Could not find ollama container id"

  wait_for_health_healthy "${ip}" "${container_id}"
  wait_for_service_completed_successfully "${ip}" "ollama-model-init" "${OLLAMA_INIT_TIMEOUT_SEC:-600}"

  load_env_into_shell

  local model="${OLLAMA_MODEL:-llama3.2}"
  if ! ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose --env-file .env -p ${COMPOSE_PROJECT} exec -T ollama sh -lc 'OLLAMA_HOST=127.0.0.1:11434 ollama show \"${model}\" >/dev/null 2>&1'"; then
    ssh_cmd "${ip}" "cd ${DEPLOY_REMOTE_DIR} && docker compose -p ${COMPOSE_PROJECT} logs --no-color ollama-model-init 2>&1 | tail -n 60" || true
    die "Model ${model} not found after init"
  fi

  log "Ollama model pull check passed"
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
    ollama) verify_ollama "${ip}" ;;
    *) verify_generic "${ip}" ;;
  esac
}
