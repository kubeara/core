#!/usr/bin/env bash

# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

HCLOUD_LOCATION="${HCLOUD_LOCATION:-nbg1}"
HCLOUD_SERVER_TYPE="${HCLOUD_SERVER_TYPE:-cx22}"
HCLOUD_IMAGE="${HCLOUD_IMAGE:-ubuntu-22.04}"
SSH_WAIT_TIMEOUT_SEC="${SSH_WAIT_TIMEOUT_SEC:-300}"

hetzner_create_server() {
  local server_name=$1

  require_cmd hcloud
  require_env HCLOUD_TOKEN
  require_env HCLOUD_SSH_KEY

  export HCLOUD_TOKEN

  log "Creating Hetzner server: ${server_name} (${HCLOUD_SERVER_TYPE}, ${HCLOUD_IMAGE}, ${HCLOUD_LOCATION})"

  hcloud server create \
    --name "${server_name}" \
    --type "${HCLOUD_SERVER_TYPE}" \
    --image "${HCLOUD_IMAGE}" \
    --location "${HCLOUD_LOCATION}" \
    --ssh-key "${HCLOUD_SSH_KEY}" \
    --label "purpose=selfhost-e2e" \
    >/dev/null

  SERVER_IP="$(hcloud server ip "${server_name}")"
  [[ -n "${SERVER_IP}" ]] || die "Failed to resolve server IP for ${server_name}"

  log "Server created: ${server_name} @ ${SERVER_IP}"
}

hetzner_wait_for_ssh() {
  local ip=$1
  local elapsed=0

  log "Waiting for SSH on ${ip} (timeout ${SSH_WAIT_TIMEOUT_SEC}s)..."

  while (( elapsed < SSH_WAIT_TIMEOUT_SEC )); do
    if ssh_cmd "${ip}" 'echo ok' >/dev/null 2>&1; then
      log "SSH is ready"
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done

  die "Timed out waiting for SSH on ${ip}"
}

hetzner_delete_server() {
  local server_name=$1

  if [[ "${SKIP_DESTROY:-false}" == "true" ]]; then
    log "SKIP_DESTROY=true — leaving server ${server_name} running"
    return 0
  fi

  if ! command -v hcloud >/dev/null 2>&1; then
    log "hcloud not found; cannot delete server ${server_name}"
    return 0
  fi

  if [[ -z "${HCLOUD_TOKEN:-}" ]]; then
    log "HCLOUD_TOKEN not set; cannot delete server ${server_name}"
    return 0
  fi

  export HCLOUD_TOKEN

  if hcloud server describe "${server_name}" >/dev/null 2>&1; then
    log "Deleting Hetzner server: ${server_name}"
    hcloud server delete "${server_name}" >/dev/null || true
  fi
}
