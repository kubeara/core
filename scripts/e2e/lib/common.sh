#!/usr/bin/env bash

set -euo pipefail

E2E_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${E2E_ROOT}/../.." && pwd)"
E2E_KNOWN_HOSTS_FILE="${E2E_KNOWN_HOSTS_FILE:-${E2E_ROOT}/.known_hosts}"

timestamp() {
  local ts
  ts="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  printf '%s:%s\n' "${ts:0:22}" "${ts:22:2}"
}

log() {
  printf '[e2e][%s] %s\n' "$(timestamp)" "$*"
}

die() {
  printf '[e2e][%s][error] %s\n' "$(timestamp)" "$*" >&2
  exit 1
}

require_cmd() {
  local cmd=$1
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: ${cmd}"
}

require_env() {
  local name=$1
  [[ -n "${!name:-}" ]] || die "Environment variable ${name} is required"
}

e2e_prepare_known_hosts_file() {
  mkdir -p "$(dirname "${E2E_KNOWN_HOSTS_FILE}")"
  touch "${E2E_KNOWN_HOSTS_FILE}"
}

e2e_forget_host_key() {
  local ip=$1
  e2e_prepare_known_hosts_file
  ssh-keygen -R "${ip}" -f "${E2E_KNOWN_HOSTS_FILE}" >/dev/null 2>&1 || true
}

ssh_cmd() {
  local ip=$1
  shift
  e2e_prepare_known_hosts_file
  ssh \
    -i "${SSH_PRIVATE_KEY}" \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile="${E2E_KNOWN_HOSTS_FILE}" \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    "root@${ip}" "$@"
}

scp_to_server() {
  local ip=$1
  local src=$2
  local dest=$3
  e2e_prepare_known_hosts_file
  scp \
    -i "${SSH_PRIVATE_KEY}" \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile="${E2E_KNOWN_HOSTS_FILE}" \
    -o BatchMode=yes \
    "${src}" "root@${ip}:${dest}"
}
