# Scripts

Utility scripts for the SelfHost / Kubeara core monorepo. These are **not used in production**.

## E2E: Hetzner template validation

`e2e/validate-on-hetzner.sh` provisions a temporary Hetzner Cloud VM, installs Docker, deploys a service template (`postgresql` or `redis`), verifies the stack is healthy, then tears everything down.

Use this to confirm that:

- Template YAML builds correctly (`npm run build:templates`)
- Generated JSON and base64 `compose` fields match
- Decoded compose runs with Docker Compose on a real Ubuntu server

### What the script does

1. Runs `npm run build:templates` when `TEMPLATE_SOURCE=generated` (default)
2. Verifies `service-template-<slug>.json` `compose` matches `service-template-<slug>.base64`
3. Creates a Hetzner server via `hcloud`
4. Waits for SSH and installs Docker
5. Copies compose + `.env` to the server
6. Runs `docker compose config` and `docker compose up -d`
7. Verifies health (PostgreSQL: healthcheck + `pg_isready`; Redis: `PING`)
8. Runs `docker compose down` on the VM and **deletes the server**

Typical runtime: **3–8 minutes** per run.

---

## Prerequisites

### Accounts and access

| Item | Description |
|------|-------------|
| **Hetzner Cloud account** | [console.hetzner.cloud](https://console.hetzner.cloud/) |
| **API token** | Project → **Security** → **API tokens** → Generate (Read & Write) |
| **SSH key in Hetzner** | Upload your **public** key under **Security** → **SSH keys** and note the **name** (e.g. `my-mac-key`) |

The script connects as `root` using the private key that matches the public key registered in Hetzner.

### Software on your machine

```bash
# Hetzner CLI
brew install hcloud

# JSON parser (required by the script)
brew install jq

# Repo dependencies (for build:templates)
cd /path/to/core
npm install
```

You also need `ssh`, `scp`, and `npm` (included on macOS / most Linux distros).

Verify:

```bash
hcloud version
jq --version
node --version
npm --version
```

### SSH key

Your local private key must match the public key in Hetzner. Common paths:

- `~/.ssh/id_ed25519`
- `~/.ssh/id_rsa`

Create a key if needed:

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

Add the **public** key (`*.pub`) in Hetzner Console → **SSH keys** → **Add SSH key**.

`HCLOUD_SSH_KEY` must be the **label/name in the Hetzner console**, not a file path.

---

## Environment variables

Set these before each run (from the repository root):

```bash
export HCLOUD_TOKEN="your-hetzner-api-token"
export HCLOUD_SSH_KEY="my-mac-key"   # exact name from Hetzner SSH keys page

# Only if your key is not ~/.ssh/id_ed25519 or ~/.ssh/id_rsa:
export SSH_PRIVATE_KEY="$HOME/.ssh/id_ed25519"
```

Optional:

| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPLATE_SOURCE` | `generated` | `generated` (build + base64) or `repo` (raw `docker-compose.yml`) |
| `HCLOUD_LOCATION` | `nbg1` | Hetzner datacenter |
| `HCLOUD_SERVER_TYPE` | `cx22` | Server plan |
| `HCLOUD_IMAGE` | `ubuntu-22.04` | OS image |
| `ENV_FILE` | _(auto)_ | Path to a custom `.env` file |
| `VERIFY_TIMEOUT_SEC` | `180` | Max seconds to wait for health checks |
| `SKIP_DESTROY` | `false` | Set to `true` to keep the server on exit (debugging) |
| `SERVER_NAME` | `selfhost-e2e-<slug>-<timestamp>` | Override server name |

Example local env file (do **not** commit tokens):

```bash
# scripts/e2e/.env.local
export HCLOUD_TOKEN="..."
export HCLOUD_SSH_KEY="..."
```

```bash
set -a && source scripts/e2e/.env.local && set +a
```

---

## Running the script

From the **repository root**:

### PostgreSQL

```bash
npm run e2e:hetzner:postgresql
```

### Redis

```bash
npm run e2e:hetzner:redis
```

### All templates (one server per template)

Discovers every folder under `apps/control-panel-app/templates/` that contains `docker-compose.yml` (currently `postgresql`, `redis`), runs them **one by one**, and creates a **new Hetzner server for each** template. Each server is destroyed after that template passes (or fails).

```bash
npm run e2e:hetzner:all
```

Direct invocation:

```bash
./scripts/e2e/validate-all-on-hetzner.sh
```

If one template fails, the script continues with the remaining templates and reports a summary at the end.

### Direct invocation (single template)

```bash
./scripts/e2e/validate-on-hetzner.sh postgresql
./scripts/e2e/validate-on-hetzner.sh redis
```

### Variants

**Test raw YAML from the repo (skip base64 decode path):**

```bash
TEMPLATE_SOURCE=repo npm run e2e:hetzner:postgresql
```

**Use the bundled example env file:**

```bash
ENV_FILE=scripts/e2e/env/postgresql.env.example npm run e2e:hetzner:postgresql
```

**Keep the server if something fails (debugging):**

```bash
SKIP_DESTROY=true npm run e2e:hetzner:postgresql
```

Delete manually afterward:

```bash
hcloud server list
hcloud server delete <server-name>
```

### Success output

```text
[e2e] SUCCESS: postgresql is up and healthy on <ip>
```

---

## npm scripts

| Script | Command |
|--------|---------|
| `e2e:hetzner` | `validate-on-hetzner.sh` (default slug: `postgresql`) |
| `e2e:hetzner:postgresql` | PostgreSQL E2E |
| `e2e:hetzner:redis` | Redis E2E |
| `e2e:hetzner:all` | All folder-based templates, sequentially |

---

## Pre-flight checklist

```bash
# 1) Token works
export HCLOUD_TOKEN="..."
hcloud server list

# 2) SSH key is registered
hcloud ssh-key list

# 3) Repo ready
cd /path/to/core
npm install
npm run build:templates

# 4) Run
export HCLOUD_SSH_KEY="your-key-name"
npm run e2e:hetzner:postgresql
```

---

## Cost

Each template run creates a real **cx22** VM for a few minutes. Hetzner bills for that time. The script deletes the server at the end unless `SKIP_DESTROY=true`.

`e2e:hetzner:all` provisions **one server per template** (e.g. 2 templates ≈ 2 servers created and destroyed in sequence). Plan for ~6–16 minutes total for two templates.

---

## Layout

```text
scripts/
  README.md
  e2e/
    validate-on-hetzner.sh      # single template
    validate-all-on-hetzner.sh  # all folder-based templates
    lib/
      common.sh                 # logging, ssh/scp helpers
      run.sh                    # shared run_template_e2e flow
      hetzner.sh                # create / wait / delete server
      bootstrap.sh              # install Docker on the VM
      templates.sh              # discover slugs, prepare compose + .env
      deploy.sh                 # docker compose config / up / down
      verify.sh                 # health checks per template
    env/
      postgresql.env.example
      redis.env.example
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Missing required command: hcloud` | `brew install hcloud` |
| `Missing required command: jq` | `brew install jq` |
| `Environment variable HCLOUD_TOKEN is required` | `export HCLOUD_TOKEN=...` |
| `Environment variable HCLOUD_SSH_KEY is required` | Use the **name** from Hetzner SSH keys, not a file path |
| SSH timeout | Wrong private key, or public key not added in Hetzner |
| `compose field in JSON does not match .base64` | Run `npm run build:templates` again |
| Permission denied (ssh) | Set `SSH_PRIVATE_KEY` to the matching private key |
| `Unknown template slug` | Slug must be a folder with `docker-compose.yml` under `apps/control-panel-app/templates/` |
| `No templates found` | Add a folder with `docker-compose.yml` under `templates/` |

---

## Minimum steps (quick start)

1. Hetzner account + API token + SSH key uploaded in console  
2. `brew install hcloud jq`  
3. `npm install` in repo root  
4. `export HCLOUD_TOKEN=...` and `export HCLOUD_SSH_KEY=...`  
5. `npm run e2e:hetzner:postgresql`
