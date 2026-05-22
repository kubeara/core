# Run Kubeara from Docker Hub

No source code required — only Docker and these compose files.

## Files

| File | What it starts |
|------|----------------|
| `docker-compose.yml` | Postgres + control panel |
| `docker-compose.agent.yml` | Agent only (connects to an existing control panel) |
| `.env.control-panel.example` | Example env for the control panel stack |
| `.env.agent.example` | Example env for the agent |

## Typical flow

1. Start the **control panel** stack (includes Postgres).
2. Start the **agent** on the machine where deployments should run (same host or another server with Docker).

## Control panel

```bash
cd deploy
cp .env.control-panel.example .env.control-panel
# Edit: KUBEARA_CONTROL_PANEL_IMAGE, ENCRYPTION_SECRET, DB_*

docker compose --env-file .env.control-panel pull
docker compose --env-file .env.control-panel up -d
```

Open http://localhost:3000

## Agent

Use after the control panel is running (local or remote).

```bash
cd deploy
cp .env.agent.example .env.agent
# Edit: KUBEARA_AGENT_IMAGE, ENCRYPTION_SECRET (same as control panel),
#       CONTROL_PANEL_URL (e.g. http://host.docker.internal:3000)

docker compose -f docker-compose.agent.yml --env-file .env.agent pull
docker compose -f docker-compose.agent.yml --env-file .env.agent up -d
```

The agent container mounts `/var/run/docker.sock` so it can run `docker compose` on the **host** for template deployments. The host must have Docker installed.

## Pull images manually

```bash
docker pull kubeara/control-panel-app:latest
docker pull kubeara/agent-app:latest
```

## Environment

### .env.control-panel

| Variable | Purpose |
|----------|---------|
| `KUBEARA_CONTROL_PANEL_IMAGE` | Docker Hub image |
| `ENCRYPTION_SECRET` | App encryption key |
| `PORT` | Control panel port (default 3000) |
| `DB_*` | Postgres credentials and database name |

### .env.agent

| Variable | Purpose |
|----------|---------|
| `KUBEARA_AGENT_IMAGE` | Docker Hub image |
| `ENCRYPTION_SECRET` | Must match control panel |
| `CONTROL_PANEL_URL` | Control panel base URL |
| `AGENT_PORT` | Agent port (default 3001) |
| `AGENT_PUBLIC_IP` | Public IP for generated URLs |
| `TRAEFIK_ENABLED` | Enable Traefik routing on agent host |

## Database migrations

Migrations are not run automatically on first start. Run them once against this Postgres instance before using the control panel in production.

## Stop

```bash
docker compose --env-file .env.control-panel down
docker compose -f docker-compose.agent.yml --env-file .env.agent down
# Add -v to remove volumes (deletes DB data):
#   docker compose --env-file .env.control-panel down -v
```
