#!/usr/bin/env bash

set -euo pipefail

E2E_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${E2E_ROOT}/../.." && pwd)"

log() {
  printf '[e2e] %s\n' "$*"
}

die() {
  printf '[e2e][error] %s\n' "$*" >&2
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

ssh_cmd() {
  local ip=$1
  shift
  ssh \
    -i "${SSH_PRIVATE_KEY}" \
    -o StrictHostKeyChecking=accept-new \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    "root@${ip}" "$@"
}

scp_to_server() {
  local ip=$1
  local src=$2
  local dest=$3
  scp \
    -i "${SSH_PRIVATE_KEY}" \
    -o StrictHostKeyChecking=accept-new \
    -o BatchMode=yes \
    "${src}" "root@${ip}:${dest}"
}
