# Run Kubeara from Docker Hub

No source code required — only Docker, Docker Compose, `curl`, and `openssl`.

The installer lives at the **repo root**: [`install.sh`](../../../install.sh) and [`uninstall.sh`](../../../uninstall.sh).

`install.sh` is **self-contained** for `curl | sh`: it embeds `docker-compose.control-panel.yml`, generates `.env.control-panel`, and pulls images from **Docker Hub**. Compose files in this directory are used for manual installs and when running `./install.sh` from a git clone.

## One-line install

Review the script before piping to your shell.

**macOS / Linux / Windows (WSL or Git Bash)** — same command:

```bash
curl -fsSL https://setup.kubeara.dev | sh
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
| **Windows** | PowerShell installer downloads Docker Desktop and installs WSL2 if missing (UAC). Skip with `KUBEARA_SKIP_DOCKER_INSTALL=1`. First WSL install usually needs a reboot. | Starts Docker Desktop and waits (PowerShell) / requires Desktop running (WSL) |

Optional environment variables:

| Variable | Purpose |
|----------|---------|
| `KUBEARA_INSTALL_DIR` | Where compose and `.env` are stored (default `/opt/kubeara/control-panel` or `~/.kubeara/control-panel`) |
| `KUBEARA_CHANNEL` | Docker image tag (`prod`, `dev`, …) |
| `VITE_API_URL` | Browser API URL incl. `/api`. Default: public IP on VPS, else `http://localhost:9461/api`. Override for domain/LAN. |
| `ENCRYPTION_SECRET` | Use a fixed secret instead of auto-generating |
| `SKIP_MIGRATE=1` | Skip migrations/seed on re-run |
| `KUBEARA_SKIP_DOCKER_INSTALL=1` | Linux: skip Docker Engine auto-install. Windows PowerShell: skip Docker Desktop auto-install |

Uninstall:

```bash
# macOS / Linux / WSL / Git Bash
curl -fsSL https://setup.kubeara.dev/uninstall.sh | sh
```

```powershell
# Windows PowerShell
irm https://setup.kubeara.dev/uninstall.ps1 | iex
```

**Hosting:** `https://setup.kubeara.dev` is the `kubeara-install` Cloudflare Worker (`worker/wrangler.install.jsonc`). Source files live in the repo root (`install.sh`, `install.ps1`, `uninstall.sh`, `uninstall.ps1`). Connect this Worker to the GitHub repo in the Cloudflare dashboard (production branch `main`, Wrangler config `worker/wrangler.install.jsonc`) so pushes deploy automatically. Do not reuse `wrangler.jsonc` (that is the console frontend).

| Path | File |
|------|------|
| `/` (root) | `install.sh` |
| `/install.ps1` | PowerShell installer (must be real `.ps1`, not a copy of `install.sh`) |
| `/uninstall.sh` | `uninstall.sh` |
| `/uninstall.ps1` | PowerShell uninstaller |

Keep the embedded compose inside root `install.sh` in sync when you change `docker-compose.control-panel.yml` here.

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

Set `CONTROL_PANEL_URL` on the control panel (e.g. `http://host.docker.internal:9461` when the agent runs in Docker and the panel on the host). Local agent files default to `~/.kubeara/agent` (override with `KUBEARA_AGENT_LOCAL_DIR`).

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

- Control panel API: http://localhost:9461
- Console SPA: http://localhost:7935
- Postgres (host): localhost:8274

### Local vs remote self-host vs cloud

Set **`VITE_API_URL`** to whatever URL the browser should use for the API (must be reachable from the user's machine). Leave **`COOKIE_DOMAIN` empty** for self-host. `CONTROL_PANEL_URL` defaults from `VITE_API_URL`.

| Scenario | `VITE_API_URL` | Notes |
|----------|----------------|-------|
| Laptop | `http://localhost:9461/api` (default) | Open `http://localhost:7935` |
| VPS with public IP on the NIC | auto `http://PUBLIC_IP:9461/api` | Open the console URL printed at install end |
| Domain / HTTPS / LAN IP / AWS EIP | set explicitly, e.g. `VITE_API_URL=https://panel.example.com/api` | Also set `CONTROL_PANEL_URL` if agents should use a different base |
| Cloud product | public API + `/api` | `COOKIE_DOMAIN=.example.com`, `COOKIE_SECURE=true`, `IS_CLOUD_VERSION=true` |

Example override:

```bash
VITE_API_URL=https://panel.example.com/api curl -fsSL https://setup.kubeara.dev | sh
```

Self-host remote ≠ cloud: leave `IS_CLOUD_VERSION=false` unless agents should connect directly (no SSH tunnels).

## Agent

Use after the control panel is running (local or remote).

```bash
cd deploy
cp .env.agent.example .env.agent
# Edit: ENCRYPTION_SECRET (same as control panel),
#       CONTROL_PANEL_URL (e.g. http://host.docker.internal:9461)

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

Required self-host keys (see `.env.control-panel.example` for defaults):

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | yes | `production` for self-host (`DB_SSL=false` keeps Postgres TLS off) |
| `DOCKER_PLATFORM` | yes | `linux/amd64` or `linux/arm64` |
| `KUBEARA_CONTROL_PANEL_IMAGE` | yes | Control panel image |
| `KUBEARA_CONSOLE_IMAGE` | yes | Console SPA image |
| `KUBEARA_AGENT_IMAGE` | yes | Agent image for remote installs |
| `PORT` | yes | Control panel host port (default `9461`; app listens on `3000` in-container) |
| `CONSOLE_PORT` | yes | Console SPA host port (default `7935`) |
| `DB_PORT` | yes | Postgres host publish port (default `8274`; app uses `5432` in-container) |
| `VITE_API_URL` | yes | Browser API base incl. `/api` |
| `CONTROL_PANEL_URL` | yes | Agent/onboard base URL |
| `CORS_ALLOWED_ORIGINS` | yes | Allowed browser origins for API CORS |
| `PUBLIC_API_ALLOWED_ORIGINS` | yes | Allowed origins for `/api/public/*` |
| `ENCRYPTION_SECRET` | yes | Must match agent |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | yes | Auth signing secrets |
| `ACCESS_TOKEN_COOKIE_NAME` / `REFRESH_TOKEN_COOKIE_NAME` | yes | HTTP-only auth cookies |
| `ACCESS_TOKEN_EXPIRES_IN` / `REFRESH_TOKEN_EXPIRES_IN` | yes | Token / cookie TTL |
| `COOKIE_DOMAIN` | yes (empty OK) | Leave empty for self-host |
| `COOKIE_SECURE` / `COOKIE_SAME_SITE` | yes | Cookie flags |
| `OTP_EXPIRES_IN` | yes | Auth OTP code lifetime (not an email-provider setting) |
| `DB_HOST` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | yes | App → Postgres (defaults: `postgres` / …) |
| `DB_SSL` | yes | Keep `false` for compose Postgres |
| `IS_CLOUD_VERSION` | yes | `false` for self-host tunnels |
| `AGENT_SOCKET_TUNNEL_PORT` | yes | SSH reverse-tunnel listen port |

Optional cloud-only integrations (Stripe, Zoho, Brevo email, Grafana Loki) are **not** part of the self-host env. Leave them unset.

Mounted at `/app/apps/control-panel-app/.env` inside the container (same pattern as the agent).

### .env.agent

| Variable | Required | Purpose |
|----------|----------|---------|
| `KUBEARA_AGENT_IMAGE` | yes | Docker Hub image |
| `AGENT_PORT` | yes | Host publish port (container listens on `3001`) |
| `ENCRYPTION_SECRET` | yes | Must match control panel |
| `KUBEARA_SERVER_ID` | yes | Set automatically on remote install |
| `CONTROL_PANEL_URL` | yes | How the agent reaches the panel |

## Stop

```bash
docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel down
docker compose -f docker-compose.agent.yml --env-file .env.agent down
# Add -v to remove volumes (deletes DB data):
#   docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel down -v
```
