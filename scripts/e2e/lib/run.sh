#!/usr/bin/env bash

# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
# shellcheck source=hetzner.sh
source "$(dirname "${BASH_SOURCE[0]}")/hetzner.sh"
# shellcheck source=bootstrap.sh
source "$(dirname "${BASH_SOURCE[0]}")/bootstrap.sh"
# shellcheck source=templates.sh
source "$(dirname "${BASH_SOURCE[0]}")/templates.sh"
# shellcheck source=deploy.sh
source "$(dirname "${BASH_SOURCE[0]}")/deploy.sh"
# shellcheck source=verify.sh
source "$(dirname "${BASH_SOURCE[0]}")/verify.sh"

e2e_require_prereqs() {
  require_cmd hcloud
  require_cmd jq
  require_cmd ssh
  require_cmd scp
  require_cmd npm
}

e2e_setup_ssh_key() {
  if [[ -n "${SSH_PRIVATE_KEY:-}" ]]; then
    [[ -f "${SSH_PRIVATE_KEY}" ]] || die "SSH private key not found: ${SSH_PRIVATE_KEY}"
    return
  fi

  if [[ -f "${HOME}/.ssh/id_ed25519" ]]; then
    SSH_PRIVATE_KEY="${HOME}/.ssh/id_ed25519"
  elif [[ -f "${HOME}/.ssh/id_rsa" ]]; then
    SSH_PRIVATE_KEY="${HOME}/.ssh/id_rsa"
  else
    die "Set SSH_PRIVATE_KEY to the private key registered in Hetzner (HCLOUD_SSH_KEY)"
  fi
}

E2E_CLEANED_UP=false

e2e_cleanup_template_run() {
  if [[ "${E2E_CLEANED_UP}" == "true" ]]; then
    return 0
  fi
  E2E_CLEANED_UP=true

  if [[ -n "${SERVER_IP:-}" ]]; then
    log "Running remote compose teardown..."
    remote_teardown_compose "${SERVER_IP}" || true
  fi

  cleanup_workdir
  hetzner_delete_server "${SERVER_NAME}"
  SERVER_IP=""
}

# Provision one template on a dedicated Hetzner server; destroy server on exit (success or failure).
run_template_e2e() {
  local slug=$1

  E2E_CLEANED_UP=false
  trap 'e2e_cleanup_template_run' RETURN EXIT

  TEMPLATE_SLUG="${slug}"
  SERVER_NAME="${SERVER_NAME:-selfhost-e2e-${slug}-$(date +%s)}"
  SERVER_IP=""

  require_template_slug "${slug}"

  log "========================================"
  log "Hetzner E2E: ${slug} (source: ${TEMPLATE_SOURCE:-repo})"
  log "Server name: ${SERVER_NAME}"
  log "========================================"

  prepare_workdir
  prepare_compose "${slug}"
  prepare_env_file "${slug}"

  hetzner_create_server "${SERVER_NAME}"
  hetzner_wait_for_ssh "${SERVER_IP}"

  remote_install_docker "${SERVER_IP}"
  remote_deploy "${SERVER_IP}"
  verify_service "${SERVER_IP}" "${slug}"

  log "SUCCESS: ${slug} is up and healthy on ${SERVER_IP}"
}
