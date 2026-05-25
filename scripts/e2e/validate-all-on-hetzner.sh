#!/usr/bin/env bash
#
# E2E: run validate-on-hetzner flow for every folder-based template under
# apps/control-panel-app/templates (one new Hetzner server per template).
#
# Usage:
#   ./scripts/e2e/validate-all-on-hetzner.sh
#
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/run.sh
source "${E2E_DIR}/lib/run.sh"

TEMPLATE_SOURCE="${TEMPLATE_SOURCE:-generated}"
FAILED_SLUGS=()
PASSED_SLUGS=()

e2e_require_prereqs
e2e_setup_ssh_key

TEMPLATE_SLUGS=()
while IFS= read -r _slug; do
  [[ -n "${_slug}" ]] && TEMPLATE_SLUGS+=("${_slug}")
done < <(discover_template_slugs)

log "Discovered ${#TEMPLATE_SLUGS[@]} template(s): ${TEMPLATE_SLUGS[*]}"

if [[ "${TEMPLATE_SOURCE}" == "generated" ]]; then
  log "Building all templates once..."
  (cd "${REPO_ROOT}" && npm run build:templates --silent)
  export SKIP_TEMPLATE_BUILD=true
fi

for slug in "${TEMPLATE_SLUGS[@]}"; do
  unset ENV_FILE SERVER_NAME SERVER_IP

  # Subshell so a failed template does not abort the full run (set -e + die).
  if ( run_template_e2e "${slug}" ); then
    PASSED_SLUGS+=("${slug}")
  else
    FAILED_SLUGS+=("${slug}")
  fi
done

log "========================================"
log "E2E summary: ${#PASSED_SLUGS[@]} passed, ${#FAILED_SLUGS[@]} failed"
[[ ${#PASSED_SLUGS[@]} -gt 0 ]] && log "Passed: ${PASSED_SLUGS[*]}"
[[ ${#FAILED_SLUGS[@]} -gt 0 ]] && log "Failed: ${FAILED_SLUGS[*]}"
log "========================================"

if ((${#FAILED_SLUGS[@]} > 0)); then
  die "One or more templates failed E2E validation"
fi

log "All templates passed E2E validation"
