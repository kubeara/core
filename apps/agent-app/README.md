# Agent App

This is the deployment agent application that connects to the control panel and executes deployments.

## Features

- Connects to control panel via WebSocket
- Listens for deployment instructions
- Executes template deployments
- Reports deployment status in real-time
- Automatic reconnection with exponential backoff

## Running

```bash
npm run start:agent-app
```

## Development

```bash
npm run start:agent-app:dev
```

## Docker image

The production image installs the Docker CLI and Compose plugin. When running in a container, mount the host socket so deployments use the host daemon:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - agent_deployments:/app/deployments
```

See `apps/control-panel-app/deploy/docker-compose.agent.yml`.

## Environment Variables

- `CONTROL_PANEL_URL` - URL of the control panel (default: http://localhost:3000)
- `PORT` - Port to run on (default: 3001)
