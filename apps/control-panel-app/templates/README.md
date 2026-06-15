# Service templates (`docker-compose.yml`)

Templates in this folder are read directly from disk and upserted into Postgres with `npm run seed` (from the monorepo `core` root, after `npm run build:control-panel-app`).

This document describes how the **Docker Compose parser** resolves **environment variables and host ports** for **compose-only** templates (templates without `template.config.json`, deployed via `POST /deployments/compose` or auto-routed when the template has no schema). The logic lives in:

- `libs/common/src/compose-parser/compose-parser.util.ts`
- `libs/common/src/server-url/server-url.util.ts`

---

## 1. Where variables are discovered

The parser scans the **entire compose YAML as text** for placeholders:

| Form | Example | Notes |
|------|---------|--------|
| Braced with optional default | `${VAR}` / `${VAR:-default}` | Default uses `:-` or a single `-` after the name (no nested `${}` inside defaults). |
| Bare dollar | `$VAR` | Same as `${VAR}` without default. |

Duplicate names merge: if one occurrence has a default and another does not, the default is kept.

---

## 2. Host ports: `SERVICE_PORT_*` only

Only variables whose names start with **`SERVICE_PORT_`** are treated as **host port bindings** used in mappings like `'${SERVICE_PORT_N8N:-5678}:5678'`.

- **Do not** use unrelated names such as `N8N_*_PORT` for **host publish** placeholders if you intend them as compose “port variables”—they remain normal env vars and are **not** auto-filled from template `port` metadata the same way.
- Port values are stored as numbers; callers may pass them in API `env` or `ports` (both work for `SERVICE_PORT_*` keys).

Compose-only deploys can omit a port only if **`serverUrlContext.useTraefik` is true** (Traefik path): host `SERVICE_PORT_*` placeholders are then not required and generated host port entries are stripped after resolution.

---

## 3. Default values in placeholders

`${NAME:-DEFAULT}` fills `NAME` from the request/env first; otherwise **`DEFAULT`** is used if it is non-empty.

For **`SERVICE_PORT_*`**, only a **numeric** default is applied (non-numeric defaults are ignored for the ports map).

---

## 4. `SERVICE_*` “magic” variables (auto-generated secrets)

Variables matching **Coolify-style** `SERVICE_{COMMAND}_{IDENTIFIER}` can be **auto-generated** when missing (no request value, no compose default):

| Pattern (examples) | Generated as |
|--------------------|--------------|
| `SERVICE_PASSWORD_*` | 24-char alphanumeric |
| `SERVICE_PASSWORD_64_*` | 64-char alphanumeric |
| `SERVICE_PASSWORDWITHSYMBOLS_*` | 24-char password with symbols |
| `SERVICE_PASSWORDWITHSYMBOLS_64_*` | 64-char password with symbols |
| `SERVICE_BASE64_*` / `SERVICE_BASE64_32_*` | 32-char alphanumeric |
| `SERVICE_BASE64_64_*` | 64-char alphanumeric |
| `SERVICE_BASE64_128_*` | 128-char alphanumeric |
| `SERVICE_USER_*` | 16-char alphanumeric |
| `SERVICE_LOWERCASEUSER_*` | 16-char lowercase alphanumeric |
| `SERVICE_HEX_32_*` | 32 hex chars (16 random bytes) |
| `SERVICE_HEX_64_*` | 64 hex chars |
| `SERVICE_HEX_128_*` | 128 hex chars |
| Other `SERVICE_{COMMAND}_*` shapes the parser treats as magic | 32-char alphanumeric (fallback) |

**Not** auto-filled by this magic path (handled elsewhere or must be provided):

- `SERVICE_PORT_*` — from user input, compose default, or URL generation (see below).
- Names parsed as **`SERVICE_URL_*` / `SERVICE_FQDN_*`** — see §5–§6.

---

## 5. Bare `SERVICE_URL_*` / `SERVICE_FQDN_*` lines in `environment`

Besides `${...}` substitution, you can **declare** URL/FQDN keys without values in lists (traefik / Coolify-style triggers):

```yaml
environment:
  - SERVICE_URL_N8N_5678
```

The parser collects lines like:

- `- SERVICE_URL_...` or `- SERVICE_FQDN_...`
- `SERVICE_URL_...:` / `SERVICE_FQDN_...:` with an empty value

**Generation runs only for declarations starting with `SERVICE_URL_`** (not bare `SERVICE_FQDN_*` alone). Those declarations drive creation of matching `SERVICE_FQDN_*` and `SERVICE_URL_*` keys.

---

## 6. Public URL / FQDN generation (`serverUrlContext`)

When the control panel resolves compose with **`serverUrlContext`** set (connected agent IP, deployment id, optional `wildcardDomain`, `forceHttps`, `useTraefik`):

1. **Subdomain**

   `{serviceKebab}-{deploymentSuffix}.{baseHost}`  
   Example: service `N8N`, deployment `deployment-abc-def` → `n8n-abc-def`.

2. **Base host**

   - If `wildcardDomain` is set → use that URL’s host (and path prefix if any).
   - Else **sslip.io**-style: `http://<ip>.sslip.io` (with special cases for `127.0.0.1` / IPv6 formatting per `sslipWildcard()`).

3. **Keys produced from a declaration `SERVICE_URL_{NAME}`** (no trailing port segment)

   - `SERVICE_URL_{NAME}` — full URL with scheme.
   - `SERVICE_FQDN_{NAME}` — host (+ path suffix from wildcard base), no scheme.

4. **Declaration with trailing port: `SERVICE_URL_{NAME}_{PORT}`** (e.g. `SERVICE_URL_N8N_5678`)

   - Same base pair as above.
   - **If `useTraefik` is false:** also sets `SERVICE_URL_{NAME}_{PORT}` = base URL + `:{PORT}`, and matching `SERVICE_FQDN_*` with `:{PORT}` when applicable.
   - **If `useTraefik` is true:** port-suffixed URL/FQDN entries are **omitted** (traffic goes through Traefik on 80/443; use the non-suffixed URL).
   - **If `useTraefik` is false:** also auto-fills `SERVICE_PORT_{NAME}` from the numeric port suffix when not supplied (so direct host publishing matches the advertised URL).

Caller-provided env values **win** over generated ones.

---

## 7. Required variables (compose-only validation)

After resolution, any placeholder still empty is **missing** and fails validation.

**Exceptions (not required to be filled):**

- Magic `SERVICE_*` secrets (§4).
- `SERVICE_URL_*` / `SERVICE_FQDN_*` when `serverUrlContext` is present (generated or skipped per rules above).
- **`SERVICE_PORT_*`** when `serverUrlContext.useTraefik` is true.

**Implication for authors:** every other `${VAR}` without a default must be supplied by the API or by a non-empty default in compose.

---

## 8. API request shape (compose-only)

- **`env`**: arbitrary keys; `SERVICE_PORT_*` may appear here or under `ports`.
- **`ports`**: only keys that appear as `SERVICE_PORT_*` in the compose should be sent; unknown port keys are rejected.

---

## 9. Minimal checklist for a new template

1. Use **`SERVICE_PORT_{SERVICENAME}`** for host port mapping if the app should be reachable on the host (unless you standardize on Traefik-only).
2. For auto secrets, use **`SERVICE_PASSWORD_{APP}`**, **`SERVICE_USER_{APP}`**, etc. (§4).
3. For Coolify-style public URLs, add a bare line **`SERVICE_URL_{NAME}_{internalPort}`** and reference `${SERVICE_URL_{NAME}}` / `${SERVICE_FQDN_{NAME}}` in app env as needed.
4. Prefer **`${VAR:-sensible}`** for optional tuning knobs so deploy works without passing every key.
5. Run **`npm run build:control-panel-app && npm run seed`** from `core` after editing.
6. Run **`npm run test:templates`** from `core` to validate compose structure, env/port rules, resource limits, and logging limits.
7. Add catalog metadata as leading comments in `docker-compose.yml` (read during `npm run seed`):

   | Comment key | DB column | Notes |
   |-------------|-----------|--------|
   | `# shortDescription:` | `shortDescription` | Also accepts legacy `# description:` / `# slogan:` |
   | `# longDescription:` | `longDescription` | HTML string; or place HTML in `long-description.html` beside compose |
   | `# documentation:` | `documentation` | |
   | `# category:` | `category` | Comma-separated values |
   | `# tags:` | `tags` | Comma-separated values |
   | `# logo:` | `logo` | Path relative to `templates/` (encoded as data URI on seed) |
   | `# port:` | `port` | |

8. Register optional per-slug overrides (name, version) in `apps/control-panel-app/src/templates/build-template-records.util.ts` (`metadataBySlug`) when compose comments are not enough.

---

## 10. Reference templates in this repo

| Template | Notes |
|----------|--------|
| `postgres/` | Compose-only PostgreSQL; magic vars; `SERVICE_PORT_POSTGRES`, passwords, etc. |
| `mysql/` | Standalone MySQL 8.4 on port 3306 |
| `mariadb/` | Standalone MariaDB 11.4 on port 3306 |
| `mongodb/` | Standalone MongoDB 8.0 on port 27017 |
| `surrealdb/` | Multi-model database on port 8000 |
| `clickhouse/` | OLAP analytics database on ports 8123 (HTTP) and 9000 (native) |
| `redis/` | In-memory cache on port 6379 |
| `valkey/` | Redis-compatible cache (Valkey) on port 6379 with AOF persistence |
| `n8n/` | Compose-only; `SERVICE_URL_N8N_5678` declaration + Traefik-friendly URL vars |
| `uptime-kuma/` | Self-hosted uptime monitoring on port 3001 |
| `grafana/` | Dashboards; `SERVICE_URL_GRAFANA_3000` + admin credentials |
| `prometheus/` | Metrics collection on port 9090 with default scrape config |
| `gitea/` | Lightweight Git hosting on port 3000 (SQLite, HTTP-only) |
| `gitlab-ce/` | Full DevOps platform on port 8929; high memory footprint |
| `code-server/` | Browser VS Code on port 8080 with password auth |
| `sql-server/` | Microsoft SQL Server 2022 on port 1433; 2 GB memory minimum |
| `wordpress/` | WordPress with MariaDB on port 80 |
| `directus/` | Headless CMS with PostgreSQL on port 8055 |
| `strapi/` | Headless CMS with PostgreSQL on port 1337 (`naskio/strapi` community image) |
| `pocketbase/` | Single-container BaaS with SQLite on port 8090 |
| `monica/` | Personal CRM with MariaDB on port 80 |
| `minio/` | S3-compatible object storage on ports 9000 (API) and 9001 (console) |
| `nextcloud/` | File sync and collaboration with MariaDB and Redis on port 80 |
| `seafile/` | File sync and sharing with MariaDB and Redis on port 80 |
| `flowise/` | Visual AI agent builder on port 3000 |
| `anything-llm/` | Private AI document workspace on port 3001 |
| `litellm/` | LLM proxy gateway with PostgreSQL on port 4000 |
| `ollama/` | Local LLM inference API on port 11434 |
| `open-webui/` | Self-hosted chat UI for Ollama on port 8080 |
| `qdrant/` | Vector database on ports 6333 (HTTP) and 6334 (gRPC) |
| `weaviate/` | AI-native vector database on ports 8080 and 50051 |
| `langfuse/` | LLM observability stack on port 3000 (Postgres, ClickHouse, Redis, MinIO) |
| `netdata/` | Real-time host and container monitoring on port 19999 |
| `activepieces/` | Workflow automation with PostgreSQL and Redis on port 8080 |
| `windmill/` | Script and flow platform with PostgreSQL on port 8000 |
| `node-red/` | Flow-based IoT and automation editor on port 1880 |
| `plausible/` | Privacy-friendly analytics with PostgreSQL and ClickHouse on port 8000 |
| `umami/` | Lightweight privacy analytics with PostgreSQL on port 3000 |
| `matomo/` | Full-featured web analytics with MariaDB on port 8080 |
| `drone-ci/` | Container-native CI with Docker runner on port 80 |
| `woodpecker-ci/` | Lightweight CI/CD engine with Docker agent on port 8000 |
| `ghost/` | Publishing platform for blogs and newsletters with MariaDB on port 2368 |
| `signoz/` | OpenTelemetry APM with ClickHouse on ports 8080, 4317, and 4318 |
| `healthchecks/` | Cron job and heartbeat monitoring with PostgreSQL on port 8000 |
| `vaultwarden/` | Bitwarden-compatible password manager on port 8080 |
| `authentik/` | Identity provider with SSO and MFA; PostgreSQL, Redis, server, and worker on port 9000 |
| `authelia/` | SSO and 2FA portal with Redis on port 9091; embedded config and file-based users |
| `keycloak/` | IAM platform with PostgreSQL on port 8080 |
| `nocodb/` | Airtable-style database UI with PostgreSQL on port 8080 |
| `affine/` | Knowledge workspace with PostgreSQL, Redis, and migration job on port 3010 |

---

## 11. Implementation reference

| Topic | File |
|--------|------|
| Extraction, magic, ports, validation | `libs/common/src/compose-parser/compose-parser.util.ts` |
| sslip URL/FQDN, `useTraefik` URL shapes | `libs/common/src/server-url/server-url.util.ts` |
| Traefik label injection on agent | `libs/common/src/traefik/traefik-labels.util.ts` |

For behaviour guarantees, prefer reading these files and `compose-parser.util.spec.ts` alongside this README.
