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
| `postgresV2` | `templates/postgresV2/` | **Preferred** — magic `SERVICE_*_POSTGRESV2` vars + DB persistence |

Each folder contains:

- `docker-compose.yml` — compose with Coolify-style `SERVICE_*` magic variables
- `template.config.json` — schema (port required; credentials auto-generated)
- `.env.example` — local reference only (deploy uses `environment_variables` table)

Build generated artifacts and seed the database:

```bash
npm run build:templates
npm run seed
```

Deploy **postgresV2** (only host port is required; user/password are generated if omitted). Resolved variables are stored in `environment_variables` (encrypted) linked to `service_deployments`:

```bash
curl -X POST http://localhost:3000/deploy \
  -H 'Content-Type: application/json' \
  -d '{"templateSlug":"postgresV2","ports":{"SERVICE_PORT_POSTGRESV2":5432}}'
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

Magic variable naming follows `SERVICE_{COMMAND}_{IDENTIFIER}` (e.g. `SERVICE_PASSWORD_POSTGRESV2` → auto password).
