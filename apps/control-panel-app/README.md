# Control Panel App

This is the main control panel application that manages templates and orchestrates deployments across connected agents.

## Features

- Template management via REST API
- WebSocket server for real-time agent communication
- PostgreSQL integration for template storage
- Template caching with Redis support
- Deployment orchestration and status tracking

## Running

```bash
npm run start:control-panel-app
```

## Development

```bash
npm run start:control-panel-app:dev
```

## PostgreSQL templates

| Slug | Folder | Notes |
|------|--------|--------|
| `postgresql` | `templates/postgresql/` | Original one-click template |
| `postgresV2` | `templates/postgresV2/` | Compose-only database template |
| `n8n` | `templates/n8n/` | Web app with **sslip.io URL generation** |

## URL generation (Coolify-style)

Set `AGENT_PUBLIC_IP` on the agent (reported to control panel on WebSocket connect).  
When a template declares `SERVICE_URL_*` (e.g. n8n), the control panel auto-generates:

- `SERVICE_URL_N8N` → `http://n8n-{deploymentId}.{ip}.sslip.io`
- `SERVICE_FQDN_N8N` → hostname only
- Port-specific variants with `:5678` appended

Deploy **n8n** (agent must be connected with `AGENT_PUBLIC_IP` set):

```bash
curl -X POST http://localhost:3000/deploy/compose \
  -H 'Content-Type: application/json' \
  -d '{"templateSlug":"n8n"}'
```

Response includes `publicUrl` — open that URL (with port `:5678`) in your browser.

Each folder contains:

- `docker-compose.yml` — compose with Coolify-style `SERVICE_*` magic variables
- `template.config.json` — optional schema for legacy `POST /deploy` (not used by postgresV2)

Build generated artifacts and seed the database:

```bash
npm run build:templates
npm run seed
```

Deploy **postgresV2** via compose-only endpoint (user/password auto-generated; host port defaults to 5432):

```bash
curl -X POST http://localhost:3000/deploy/compose \
  -H 'Content-Type: application/json' \
  -d '{"templateSlug":"postgresV2"}'
```

Override the host port if needed:

```bash
curl -X POST http://localhost:3000/deploy/compose \
  -H 'Content-Type: application/json' \
  -d '{"templateSlug":"postgresV2","ports":{"SERVICE_PORT_POSTGRES":5435}}'
```

Note: the port key is `SERVICE_PORT_POSTGRES` (not `SERVICE_PORT_POSTGRESV2`).

Legacy schema-based deploy (templates with `template.config.json`):

```bash
curl -X POST http://localhost:3000/deploy \
  -H 'Content-Type: application/json' \
  -d '{"templateSlug":"postgresql","ports":{"SERVICE_PORT_POSTGRESQL":5432}}'
```

Inspect stored variables (secrets masked):

```bash
curl http://localhost:3000/deployments/<deploymentId>/env
```

Update stored variables, then redeploy:

```bash
curl -X PATCH http://localhost:3000/deployments/<deploymentId>/env \
  -H 'Content-Type: application/json' \
  -d '{"env":{"POSTGRES_DB":"myapp"}}'

curl -X POST http://localhost:3000/deployments/<deploymentId>/redeploy \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Magic variable naming follows `SERVICE_{COMMAND}_{IDENTIFIER}` (e.g. `SERVICE_PASSWORD_POSTGRES` → auto password).
