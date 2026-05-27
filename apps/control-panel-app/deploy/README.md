# Run Kubeara from Docker Hub

No source code required — only Docker and these compose files.

## Files

| File | What it starts |
|------|----------------|
| `docker-compose.control-panel.yml` | Postgres + control panel |
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

This runs TypeORM migrations, then `npm run seed` (template upserts from `apps/control-panel-app/templates`).

Pulls images from Docker Hub automatically if they are not on the machine. To force the latest tag from Hub:

```bash
docker compose -f docker-compose.control-panel.yml --env-file .env.control-panel up -d --pull always
```

Open http://localhost:3000

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
| `DOCKER_PLATFORM` | `linux/amd64` or `linux/arm64` (optional) |
| `ENCRYPTION_SECRET` | App encryption key (must match agent) |
| `CONTROL_PANEL_URL` | Public URL for remote agents / onboard install |
| `PORT` | Control panel port (default 3000) |
| `DB_HOST` | `postgres` inside compose (do not use `127.0.0.1`) |
| `DB_*` | Postgres credentials and database name |

Mounted at `/app/apps/control-panel-app/.env` inside the container (same pattern as the agent).

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
