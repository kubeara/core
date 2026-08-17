# Run Kubeara from Docker Hub

No source code required — only Docker, Docker Compose, `curl`, and `openssl`.

The installer lives at the **repo root**: [`install.sh`](../../../install.sh) and [`uninstall.sh`](../../../uninstall.sh).

`install.sh` is **self-contained** for `curl | sh`: it embeds `docker-compose.control-panel.yml`, generates `.env.control-panel`, and pulls images from **Docker Hub**. Compose files in this directory are used for manual installs and when running `./install.sh` from a git clone.

## One-line install

Review the script before piping to your shell.

**macOS / Linux / Windows (WSL or Git Bash)** — same command:

```bash
curl -fsSL https://get.kubeara.dev | sh
```

Or from GitHub raw:

```bash
curl -fsSL https://raw.githubusercontent.com/kubeara/core/main/install.sh | sh
```

### Docker prerequisites (by OS)

| OS | If Docker is missing | If Docker is installed but not running |
|----|----------------------|----------------------------------------|
| **Linux** | Installer runs [get.docker.com](https://get.docker.com) (disable with `KUBEARA_SKIP_DOCKER_INSTALL=1`) | Starts the daemon; uses `sudo` / `sg docker` when the socket needs elevation |
| **macOS** | Error with Docker Desktop install link (never auto-installs) | Starts Docker Desktop (`open -a Docker`) and waits |
| **Windows** | Error with Docker Desktop install link | Starts Docker Desktop and waits (PowerShell) / requires Desktop running (WSL) |

Optional environment variables:

| Variable | Purpose |
|----------|---------|
| `KUBEARA_INSTALL_DIR` | Where compose and `.env` are stored (default `/opt/kubeara/control-panel` or `~/.kubeara/control-panel`) |
| `KUBEARA_CHANNEL` | Docker image tag (`prod`, `dev`, …) |
| `VITE_API_URL` | Browser API URL incl. `/api`. Default: public IP on VPS, else `http://localhost:3000/api`. Override for domain/LAN. |
| `ENCRYPTION_SECRET` | Use a fixed secret instead of auto-generating |
| `SKIP_MIGRATE=1` | Skip migrations/seed on re-run |
| `KUBEARA_SKIP_DOCKER_INSTALL=1` | Linux only: do not auto-install Docker Engine |

Uninstall:

```bash
# macOS / Linux / WSL / Git Bash
curl -fsSL https://get.kubeara.dev/uninstall.sh | sh
```

```powershell
# Windows PowerShell
irm https://get.kubeara.dev/uninstall.ps1 | iex
```

**Hosting:** publish root `install.sh` at `https://get.kubeara.dev`, `uninstall.sh` at `/uninstall.sh`, and optionally `install.ps1` / `uninstall.ps1`. Keep the embedded compose inside root `install.sh` in sync when you change `docker-compose.control-panel.yml` here.

## Files

| File | What it starts |
|------|----------------|
| `../../../install.sh` | One-line self-hosted installer (repo root) |
| `../../../uninstall.sh` | Stop the control panel stack (repo root) |
| `docker-compose.control-panel.yml` | Postgres + control panel + console (SPA) |
| `docker-compose.agent.yml` | Agent only (connects to an existing control panel) |
| `.env.control-panel.example` | Example env for the control panel stack |
| `.env.agent.example` | Example env for the agent |

## Typical flow

1. Start the **control panel** stack (includes Postgres).
2. Run **database migrations** once.
3. Start the **agent** on the deployment host — manually (compose below), automatically via **`POST /servers/onboard`** with `installAgent: true` (default), or on first **`POST /deployments/compose`** with `deployOnLocal: true` (installs prerequisites + agent locally).

Set `CONTROL_PANEL_URL` on the control panel (e.g. `http://host.docker.internal:3000` when the agent runs in Docker and the panel on the host). Local agent files default to `~/.kubeara/agent` (override with `KUBEARA_AGENT_LOCAL_DIR`).

## Remote agent install (onboard API)

When the control panel runs with `CONTROL_PANEL_URL` set, `POST /servers/onboard` can install the agent on the remote host over SSH after a successful login:

- Uploads `docker-compose.agent.yml` and a generated `.env.agent` to `/opt/kubeara/agent` (override with `KUBEARA_AGENT_REMOTE_DIR`).
- Runs `ensure-agent-prerequisites.sh` on the remote host (installs Docker, Compose, Node on Ubuntu/Debian or Alpine via sudo).
- Then runs `docker compose pull` and `up -d` on the remote server.
- Sets `AGENT_PUBLIC_IP` to the server host from onboard; `CONTROL_PANEL_URL` must be reachable from the remote host (not `host.docker.internal` on a VPS).

Set on the **control panel** (see `.env.control-panel.example`):

| Variable | Purpose |
|----------|---------|
| `CONTROL_PANEL_URL` | URL agents use to reach the API (required for install) |
| `KUBEARA_AGENT_IMAGE` | Optional; default `kubeara/agent:prod` |
| `KUBEARA_AGENT_DEPLOY_DIR` | Optional; path to bundled `deploy/` in the image |

Request body: `"installAgent": false` skips remote install (SSH + DB only).

### Supported production servers (per-user VPS)

The prereq script is written for **real SSH servers** customers onboard, not minimal lab containers:

| OS | Package manager | Docker service |
|----|-----------------|----------------|
| Debian / Ubuntu | `apt` | `systemd` (`systemctl start docker`) |
| Alpine Linux VPS | `apk` | OpenRC (`rc-service docker start`) |

Requirements on each server: SSH, **passwordless sudo** (or root), outbound internet for packages/images.

### Local testing: Docker SSH container vs real server

A **Docker image that only provides OpenSSH** (e.g. `localhost:2222`) is fine for testing **SSH login**, but often **cannot** run the Docker engine inside the container:

- No `rc-service`, `service`, or `systemctl`
- `dockerd` fails without `--privileged`
- This is expected; it is **not** the same as a customer’s Ubuntu/Alpine VPS.

| Goal | What to use |
|------|-------------|
| Test SSH + onboard API (no agent install) | `"installAgent": false` |
| Test full agent install locally | Real VM, or SSH container with `--privileged`, or `-v /var/run/docker.sock:/var/run/docker.sock` |
| Production | Customer’s Debian/Ubuntu/Alpine **VPS** |

## Control panel

```bash
cd deploy
cp .env.control-panel.example .env.control-panel
# Edit: ENCRYPTION_SECRET (and image tag if needed)

docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel pull
docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel up -d
```

Run migrations and seed service templates once (before using the UI):

```bash
docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel --profile migrate run --rm migrate
```

This runs TypeORM migrations, then `npm run seed:prod` (template upserts from `apps/control-panel-app/templates`; uses prebuilt `dist` in the image).

Pulls images from Docker Hub automatically if they are not on the machine. To force the latest tag from Hub:

```bash
docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel up -d --pull always
```

Open (local):

- Control panel API: http://localhost:3000
- Console SPA: http://localhost:8080

### Local vs remote self-host vs cloud

Set **`VITE_API_URL`** to whatever URL the browser should use for the API (must be reachable from the user's machine). Leave **`COOKIE_DOMAIN` empty** for self-host. `CONTROL_PANEL_URL` defaults from `VITE_API_URL`.

| Scenario | `VITE_API_URL` | Notes |
|----------|----------------|-------|
| Laptop | `http://localhost:3000/api` (default) | Open `http://localhost:8080` |
| VPS with public IP on the NIC | auto `http://PUBLIC_IP:3000/api` | Open the console URL printed at install end |
| Domain / HTTPS / LAN IP / AWS EIP | set explicitly, e.g. `VITE_API_URL=https://panel.example.com/api` | Also set `CONTROL_PANEL_URL` if agents should use a different base |
| Cloud product | public API + `/api` | `COOKIE_DOMAIN=.example.com`, `COOKIE_SECURE=true`, `IS_CLOUD_VERSION=true` |

Example override:

```bash
VITE_API_URL=https://panel.example.com/api curl -fsSL https://get.kubeara.dev | sh
```

Self-host remote ≠ cloud: leave `IS_CLOUD_VERSION=false` unless agents should connect directly (no SSH tunnels).

## Agent

Use after the control panel is running (local or remote).

```bash
cd deploy
cp .env.agent.example .env.agent
# Edit: ENCRYPTION_SECRET (same as control panel),
#       CONTROL_PANEL_URL (e.g. http://host.docker.internal:3000)

docker compose -f docker-compose.agent.yml --env-file .env.agent up -d
```

Use `--pull always` to refresh `kubeara/agent:prod` from Docker Hub before starting.

## `all predefined address pools have been fully subnetted`

Docker on Mac has created too many unused networks. Clean up, then retry:

```bash
docker network prune -f
docker container prune -f
```

If it still fails: **Docker Desktop → Troubleshoot → Clean / purge data** (removes unused networks), or restart Docker Desktop.

The agent compose uses `network_mode: bridge` so it does not allocate another project network. The control panel stack needs one compose network so the app can reach Postgres.

## Apple Silicon (M1/M2/M3) — `no matching manifest for linux/arm64`

Hub images built on GitHub Actions are multi-arch (`linux/amd64`, `linux/arm64`).

**Right now:** compose defaults to `platform: linux/amd64` (runs under emulation on Mac). Set in `.env.control-panel` / `.env.agent`:

```bash
DOCKER_PLATFORM=linux/amd64
```

**After multi-arch images are on Hub:** pull again, then set:

```bash
DOCKER_PLATFORM=linux/arm64
```

The agent container mounts `/var/run/docker.sock` so it can run `docker compose` on the **host** for template deployments. The host must have Docker installed.

## Docker image tags (CI/CD)

Docker images are pushed on every commit to:

- `kubeara/control-panel`
- `kubeara/agent`

Tags are branch-aware:

- `feature/*`: `feature-<branch-name>-<short-sha>` (slashes replaced with `-`)
- `development`: `dev` and `dev-<short-sha>`
- `main`: `prod` and `prod-<short-sha>`

Examples:

```text
kubeara/agent:feature-login-a1b2c3d
kubeara/agent:dev
kubeara/agent:dev-a1b2c3d
kubeara/agent:prod
kubeara/agent:prod-a1b2c3d
```

`latest` is intentionally not published.

## Pull images manually

```bash
docker pull kubeara/control-panel:prod
docker pull kubeara/agent:prod
```

## Environment

### .env.control-panel

| Variable | Purpose |
|----------|---------|
| `KUBEARA_CONTROL_PANEL_IMAGE` | Docker Hub image |
| `KUBEARA_CONSOLE_IMAGE` | Console SPA Docker image (default `kubeara/console:prod`) |
| `DOCKER_PLATFORM` | `linux/amd64` or `linux/arm64` (optional) |
| `ENCRYPTION_SECRET` | App encryption key (must match agent) |
| `JWT_SECRET` | Access token signing secret (required) |
| `JWT_REFRESH_SECRET` | Refresh token signing secret (required) |
| `ACCESS_TOKEN_COOKIE_NAME` | HTTP-only access token cookie name (default `kubeara_access_token`) |
| `REFRESH_TOKEN_COOKIE_NAME` | HTTP-only refresh token cookie name (default `kubeara_refresh_token`) |
| `ACCESS_TOKEN_EXPIRES_IN` | Access token and cookie TTL (default `15m`) |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token and cookie TTL (default `7d`) |
| `COOKIE_DOMAIN` | Leave empty for self-host (local or remote IP / single host). Only set for multi-subdomain HTTPS cloud (e.g. `.kubeara.dev`). Do not set to an IP. |
| `COOKIE_SECURE` | Set cookie `Secure` flag (`true` / `false`) |
| `COOKIE_SAME_SITE` | Cookie `SameSite` policy (`lax`, `strict`, `none`) | Use of strict is recommended for production |
| `CONTROL_PANEL_URL` | URL agents/onboard use (default: derived from `VITE_API_URL`) |
| `IS_CLOUD_VERSION` | `true` = agents connect via `CONTROL_PANEL_URL` (no SSH tunnels). Self-host: leave `false`. |
| `PORT` | Control panel port (default 3000) |
| `CONSOLE_PORT` | Console SPA host port (default 8080) |
| `VITE_API_URL` | Browser API base incl. `/api`. Primary setting for local / remote / domain. |
| `DB_HOST` | `postgres` inside compose (do not use `127.0.0.1`) |
| `DB_*` | Postgres credentials and database name |
| `GRAFANA_CLOUD_LOKI_*` | Optional Grafana Cloud Loki push (see below) |
| `KUBEARA_ENV` | Must be `PROD` (case-insensitive) for Loki shipping; also used as a Loki label |
| `KUBEARA_HOST_LABEL` | Loki label for host identity |
| `LOG_LEVEL` | Winston log level (default `info`) |

Mounted at `/app/apps/control-panel-app/.env` inside the container (same pattern as the agent).

### Grafana Cloud logs (winston-loki)

The control panel ships NestJS logs to Grafana Cloud Loki only when `KUBEARA_ENV=PROD` and these variables are set:

| Variable | Purpose |
|----------|---------|
| `GRAFANA_CLOUD_LOKI_URL` | Push URL from Grafana Cloud (ends with `/loki/api/v1/push`) |
| `GRAFANA_CLOUD_LOKI_USER` | Numeric user / instance ID |
| `GRAFANA_CLOUD_LOKI_API_KEY` | Access policy token with `logs:write` |

Copy `deploy/.env.monitoring.example` to `.env.monitoring`, fill in credentials from your Grafana Cloud stack portal, then either merge the values into `.env.control-panel` or pass both files:

```bash
docker compose -f docker-compose.control-panel.yml \
  --env-file .env.control-panel --env-file .env.monitoring up -d
```

In Grafana → Explore → Loki, query logs with:

```logql
{service="control-panel-app"}
```

Add `env` and `host` labels for filtering: `{service="control-panel-app", env="PROD"}`.

When `KUBEARA_ENV` is not `PROD` or Loki credentials are unset, logs continue to stdout only (Docker still captures them).

### .env.agent

| Variable | Purpose |
|----------|---------|
| `KUBEARA_AGENT_IMAGE` | Docker Hub image |
| `ENCRYPTION_SECRET` | Must match control panel |
| `CONTROL_PANEL_URL` | Control panel base URL |
| `AGENT_PORT` | Agent port (default 3001) |
| `AGENT_PUBLIC_IP` | Public IP for generated URLs |
| `TRAEFIK_ENABLED` | Enable Traefik routing on agent host |

## Stop

```bash
docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel down
docker compose -f docker-compose.agent.yml --env-file .env.agent down
# Add -v to remove volumes (deletes DB data):
#   docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel down -v
```
