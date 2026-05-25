#!/usr/bin/env bash
#
# E2E: provision a Hetzner VM, install Docker, deploy one service template,
# verify it is healthy, then destroy the server.
#
# Usage:
#   ./scripts/e2e/validate-on-hetzner.sh [postgresql|redis]
#
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/run.sh
source "${E2E_DIR}/lib/run.sh"

TEMPLATE_SLUG="${1:-postgresql}"
TEMPLATE_SOURCE="${TEMPLATE_SOURCE:-generated}"

e2e_require_prereqs
e2e_setup_ssh_key

run_template_e2e "${TEMPLATE_SLUG}"
