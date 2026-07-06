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

# Hetzner server names must be valid hostnames (max 63 characters).
e2e_make_server_name() {
  local prefix="${1:-selfhost-e2e}"
  local slug="$2"
  local scenario="$3"
  local ts="${4:-$(date +%s)}"

  local suffix="-${scenario}-${ts}"
  local head="${prefix}-"
  local max_len=63
  local name="${head}${slug}${suffix}"

  if ((${#name} <= max_len)); then
    printf '%s\n' "${name}"
    return 0
  fi

  local hash
  hash="$(printf '%s' "${slug}" | shasum -a 256 2>/dev/null | cut -c1-6)"
  if [[ -z "${hash}" ]]; then
    hash="$(printf '%s' "${slug}" | cksum | awk '{printf "%06d", $1 % 1000000}')"
  fi

  local budget=$((max_len - ${#head} - ${#suffix}))
  local keep=$((budget - 7))
  ((keep > 0)) || die "Cannot fit e2e server name within ${max_len} characters"

  local short_slug="${slug:0:${keep}}-${hash}"
  printf '%s\n' "${head}${short_slug}${suffix}"
}
