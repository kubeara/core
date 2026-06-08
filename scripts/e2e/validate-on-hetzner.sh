#!/usr/bin/env bash
#
# E2E: provision a Hetzner VM, install Docker, deploy one service template,
# verify it is healthy, then destroy the server.
#
# Usage:
#   ./scripts/e2e/validate-on-hetzner.sh <slug>
#   npm run e2e:hetzner -- <slug>
#   TEMPLATE_SLUG=<slug> npm run e2e:hetzner
#   ./scripts/e2e/validate-on-hetzner.sh --list
#
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/run.sh
source "${E2E_DIR}/lib/run.sh"

print_e2e_usage() {
  cat <<EOF
Usage:
  npm run e2e:hetzner -- <slug>
  TEMPLATE_SLUG=<slug> npm run e2e:hetzner
  ./scripts/e2e/validate-on-hetzner.sh <slug>

Examples:
  npm run e2e:hetzner -- n8n
  npm run e2e:hetzner -- mongodb

Available template slugs:
$(discover_template_slugs | sed 's/^/  - /')
EOF
}

if [[ "${1:-}" == "--list" || "${1:-}" == "-l" ]]; then
  discover_template_slugs
  exit 0
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  print_e2e_usage
  exit 0
fi

TEMPLATE_SLUG="${1:-${TEMPLATE_SLUG:-}}"
if [[ -z "${TEMPLATE_SLUG}" ]]; then
  print_e2e_usage >&2
  die "Template slug is required"
fi

require_template_slug "${TEMPLATE_SLUG}"

TEMPLATE_SOURCE="${TEMPLATE_SOURCE:-repo}"
SCENARIOS="${SCENARIOS:-default,user_input}"
FAILED_SCENARIOS=()
PASSED_SCENARIOS=()

e2e_require_prereqs
e2e_setup_ssh_key

configure_scenario() {
  local slug=$1
  local scenario=$2
  local ts
  ts="$(date +%s)"

  case "${scenario}" in
    default)
      unset ENV_FILE
      SERVER_NAME="${SERVER_NAME_PREFIX:-selfhost-e2e}-${slug}-default-${ts}"
      log "Scenario '${scenario}' env source: ${TEMPLATES_DIR}/${slug}/.env.example (or fallback)"
      ;;
    user_input)
      ENV_FILE="${USER_INPUT_ENV_FILE:-${TEMPLATES_DIR}/${slug}/.env.user}"
      if [[ ! -f "${ENV_FILE}" ]]; then
        log "Scenario '${scenario}' skipped (missing env file: ${ENV_FILE})"
        return 1
      fi
      SERVER_NAME="${SERVER_NAME_PREFIX:-selfhost-e2e}-${slug}-user-${ts}"
      log "Scenario '${scenario}' env source: ${ENV_FILE}"
      ;;
    *)
      die "Unsupported scenario '${scenario}' (use: default,user_input)"
      ;;
  esac

  return 0
}

IFS=',' read -r -a _scenarios <<< "${SCENARIOS}"
log "Template: ${TEMPLATE_SLUG} | Scenarios: ${_scenarios[*]}"

for _scenario in "${_scenarios[@]}"; do
  _scenario="$(echo "${_scenario}" | xargs)"
  [[ -n "${_scenario}" ]] || continue

  unset SERVER_IP

  if ! configure_scenario "${TEMPLATE_SLUG}" "${_scenario}"; then
    FAILED_SCENARIOS+=("${_scenario}")
    continue
  fi

  log "Running scenario '${_scenario}' for template '${TEMPLATE_SLUG}'"

  # Subshell isolates traps/cleanup and allows the next scenario to run on failure.
  if ( run_template_e2e "${TEMPLATE_SLUG}" ); then
    PASSED_SCENARIOS+=("${_scenario}")
  else
    FAILED_SCENARIOS+=("${_scenario}")
  fi
done

log "========================================"
log "E2E summary (${TEMPLATE_SLUG}): ${#PASSED_SCENARIOS[@]} passed, ${#FAILED_SCENARIOS[@]} failed"
[[ ${#PASSED_SCENARIOS[@]} -gt 0 ]] && log "Passed scenarios: ${PASSED_SCENARIOS[*]}"
[[ ${#FAILED_SCENARIOS[@]} -gt 0 ]] && log "Failed scenarios: ${FAILED_SCENARIOS[*]}"
log "========================================"

if ((${#FAILED_SCENARIOS[@]} > 0)); then
  die "One or more scenarios failed for template ${TEMPLATE_SLUG}"
fi

log "All scenarios passed for template ${TEMPLATE_SLUG}"
