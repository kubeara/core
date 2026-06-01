#!/usr/bin/env bash

# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

TEMPLATES_DIR="${REPO_ROOT}/apps/control-panel-app/templates"
GENERATED_DIR="${REPO_ROOT}/apps/control-panel-app/generated-templates"
WORK_DIR=""

# Lists folder-based templates that have docker-compose.yml (sorted).
discover_template_slugs() {
  local slug
  local slugs=()

  for dir in "${TEMPLATES_DIR}"/*/; do
    [[ -d "${dir}" ]] || continue
    slug="$(basename "${dir}")"
    if [[ -f "${dir}/docker-compose.yml" ]]; then
      slugs+=("${slug}")
    fi
  done

  if ((${#slugs[@]} == 0)); then
    die "No templates found under ${TEMPLATES_DIR}"
  fi

  printf '%s\n' "${slugs[@]}" | sort
}

template_slug_exists() {
  local slug=$1
  [[ -f "${TEMPLATES_DIR}/${slug}/docker-compose.yml" ]]
}

require_template_slug() {
  local slug=$1

  if template_slug_exists "${slug}"; then
    return 0
  fi

  die "Unknown template slug '${slug}'. Available: $(discover_template_slugs | tr '\n' ' ')"
}

prepare_workdir() {
  WORK_DIR="$(mktemp -d)"
  log "Using work directory: ${WORK_DIR}"
}

cleanup_workdir() {
  if [[ -n "${WORK_DIR:-}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}

prepare_compose_from_repo() {
  local slug=$1
  local src="${TEMPLATES_DIR}/${slug}/docker-compose.yml"

  [[ -f "${src}" ]] || die "Template not found: ${src}"
  cp "${src}" "${WORK_DIR}/docker-compose.yml"
  log "Using compose from repo: ${src}"
}

prepare_compose_from_generated() {
  local slug=$1
  local json_file="${GENERATED_DIR}/service-template-${slug}.json"
  local base64_file="${GENERATED_DIR}/service-template-${slug}.base64"

  [[ -f "${json_file}" ]] || die "Generated JSON not found: ${json_file} (run: npm run build:templates)"
  [[ -f "${base64_file}" ]] || die "Generated base64 not found: ${base64_file}"

  local compose_from_json
  compose_from_json="$(jq -r '.compose' "${json_file}")"
  local compose_from_file
  compose_from_file="$(tr -d '\n' < "${base64_file}")"

  if [[ "${compose_from_json}" != "${compose_from_file}" ]]; then
    die "compose field in JSON does not match .base64 file for slug ${slug}"
  fi

  if command -v openssl >/dev/null 2>&1; then
    echo "${compose_from_json}" | openssl base64 -d -A > "${WORK_DIR}/docker-compose.json"
  else
    echo "${compose_from_json}" | base64 -d > "${WORK_DIR}/docker-compose.json"
  fi
  log "Using compose decoded from generated base64: ${base64_file}"
}

prepare_compose() {
  local slug=$1
  local source="${TEMPLATE_SOURCE:-repo}"

  case "${source}" in
    repo)
      prepare_compose_from_repo "${slug}"
      COMPOSE_FILE="docker-compose.yml"
      ;;
    generated)
      if [[ "${SKIP_TEMPLATE_BUILD:-false}" != "true" ]]; then
        (cd "${REPO_ROOT}" && npm run build:templates --silent)
      fi
      prepare_compose_from_generated "${slug}"
      COMPOSE_FILE="docker-compose.json"
      ;;
    *)
      die "Unsupported TEMPLATE_SOURCE=${source} (use: repo | generated)"
      ;;
  esac
}

generate_env_from_schema() {
  local slug=$1
  local config="${TEMPLATES_DIR}/${slug}/template.config.json"
  local out="${WORK_DIR}/.env"

  [[ -f "${config}" ]] || die "template.config.json not found for ${slug}"

  jq -r '
    (
      (.env_schema // {}) | to_entries[] |
      select(.value.default != null) |
      "\(.key)=\(.value.default)"
    ),
    (
      (.port_schema // {}) | to_entries[] |
      select(.value.default != null) |
      "\(.key)=\(.value.default)"
    )
  ' "${config}" > "${out}.defaults" 2>/dev/null || true

  : > "${out}"

  if [[ -s "${out}.defaults" ]]; then
    cat "${out}.defaults" >> "${out}"
  fi

  # Required fields without defaults — use E2E-safe test values
  case "${slug}" in
    postgresql)
      grep -q '^POSTGRES_USER=' "${out}" 2>/dev/null || echo 'POSTGRES_USER=e2e_user' >> "${out}"
      grep -q '^POSTGRES_PASSWORD=' "${out}" 2>/dev/null || echo 'POSTGRES_PASSWORD=e2e_pass_change_me' >> "${out}"
      grep -q '^POSTGRES_DB=' "${out}" 2>/dev/null || echo 'POSTGRES_DB=e2e_db' >> "${out}"
      grep -q '^POSTGRES_PORT=' "${out}" 2>/dev/null || echo 'POSTGRES_PORT=5432' >> "${out}"
      grep -q '^POSTGRES_IMAGE=' "${out}" 2>/dev/null || echo 'POSTGRES_IMAGE=postgres:16' >> "${out}"
      grep -q '^POSTGRES_RESTART_POLICY=' "${out}" 2>/dev/null || echo 'POSTGRES_RESTART_POLICY=always' >> "${out}"
      grep -q '^POSTGRES_DATA_PATH=' "${out}" 2>/dev/null || echo 'POSTGRES_DATA_PATH=/var/lib/postgresql/data' >> "${out}"
      grep -q '^TZ=' "${out}" 2>/dev/null || echo 'TZ=UTC' >> "${out}"
      grep -q '^PGTZ=' "${out}" 2>/dev/null || echo 'PGTZ=UTC' >> "${out}"
      ;;
    redis)
      grep -q '^REDIS_PORT=' "${out}" 2>/dev/null || echo 'REDIS_PORT=6379' >> "${out}"
      ;;
    *)
      die "No built-in E2E env defaults for slug: ${slug}"
      ;;
  esac

  rm -f "${out}.defaults"
  log "Generated .env for ${slug}"
}

prepare_env_file() {
  local slug=$1

  if [[ -n "${ENV_FILE:-}" ]]; then
    [[ -f "${ENV_FILE}" ]] || die "ENV_FILE not found: ${ENV_FILE}"
    cp "${ENV_FILE}" "${WORK_DIR}/.env"
    log "Using env file: ${ENV_FILE}"
    return
  fi

  local template_example="${TEMPLATES_DIR}/${slug}/.env.example"
  if [[ -f "${template_example}" ]]; then
    cp "${template_example}" "${WORK_DIR}/.env"
    log "Using template env example: ${template_example}"
    return
  fi

  local example="${E2E_ROOT}/env/${slug}.env.example"
  if [[ -f "${example}" ]]; then
    cp "${example}" "${WORK_DIR}/.env"
    log "Using env example: ${example}"
    return
  fi

  generate_env_from_schema "${slug}"
}

load_env_into_shell() {
  set -a
  # shellcheck disable=SC1091
  source "${WORK_DIR}/.env"
  set +a
}
