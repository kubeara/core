<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://images.kubeara.dev/main_logo.png">
  <source media="(prefers-color-scheme: light)" srcset="https://images.kubeara.dev/main_logo_dark.png">
  <img src="https://images.kubeara.dev/main_logo.png" alt="Kubeara" width="200">
</picture>

Deploy anything on your own servers.  
Connect a server, click deploy, done.  
MIT licensed and free to self-host forever.

[Website](https://kubeara.dev)

</div>

---

Kubeara is an open source platform to deploy
and manage any service on your own servers —
databases, applications, AI models, and more.

Connect your server. Choose a service.
Click deploy. Everything else is handled.

---

### The self-hosted alternative to Coolify, Heroku, Railway, Render, Netlify, and Vercel.

Managed cloud platforms give you convenience but take away control. Your data sits on their servers. Their pricing scales against you. Their outages become your problem.

Kubeara gives you the same one-click deployment experience — on infrastructure you own.

✅ No data leaving your servers.  
✅ No per-seat pricing surprises.  
✅ No vendor lock-in.  
✅ Free forever for self-hosted.

---

## See Kubeara in Action

<div align="center">

<img src="https://images.kubeara.dev/gifs/deploy-compressed.gif" alt="Kubeara Deployment Demo" width="640" height="360">

</div>

---

### Two ways to use Kubeara

**Self-hosted — free forever**  
Run Kubeara on your own server.  
Full control. MIT licensed.  
No feature limits. No time limits.  

**Kubeara Cloud — managed for you**  
We run the control plane.  
You connect your servers.  
Free tier available. No credit card. Try now !

## Why Kubeara

Most deployment platforms were built for 
web applications. Kubeara was built 
specifically for private infrastructure — 
databases, AI models, and services that 
must run on your own servers.

### What is built in

| Capability | What it does |
|---|---|
| **GPU monitoring** | Real-time utilization, VRAM usage, and temperature per container. Not just server-wide — per service. |
| **VRAM checker** | Validates available GPU memory before every model pull. Prevents failed deployments before they start. |
| **AI model management** | Pull, switch, and delete AI models from the dashboard. No SSH. No terminal commands. |
| **MCP integration** | Native MCP server. Manage infrastructure through Claude, Cursor, or any MCP-compatible client. |
| **Agent-based security** | Agent runs on your server and initiates outbound connections only. No Plain text SSH keys stored in any database. |
| **Framework deployment** | Framework-specific Dockerfiles for NestJS, Next.js, and React. Works first time without Nixpacks errors. |
| **200+ templates** | Every template validated through automated testing including live deployment verification. |
| **Free cloud tier** | One server free on Kubeara Cloud. No credit card. No time limit. No other platform offers this. |

---

### Who uses Kubeara

| Use case | Why Kubeara |
|---|---|
| **Private AI deployment** | Run Ollama, Open WebUI, and local LLMs on your own server. Data never leaves your infrastructure. |
| **Compliance-driven teams** | Healthcare, fintech, and legal teams that cannot send data to third-party AI providers. |
| **Agencies and MSPs** | Manage multiple client servers from one dashboard. Deploy the same stack across all clients in minutes. |
| **Versal, Heroku and Render refugees** | Same deployment experience. Your infrastructure. Fraction of the cost. |
| **DevOps teams** | Replace manual Docker Compose management with a proper control plane and monitoring. |

## Quick Start

### Self-hosted (free forever)

**macOS / Linux / Windows (WSL or Git Bash):**

```bash
curl -fsSL https://get.kubeara.dev | sh
```

**Windows PowerShell** (Docker Desktop):

```powershell
irm https://get.kubeara.dev/install.ps1 | iex
```

> View the install script before running:
> [install.sh](https://github.com/kubeara/core/blob/main/install.sh)

Open dashboard: http://your-server-ip:3000 (or the console port from your install output).

**Manual install:**
```bash
git clone https://github.com/kubeara/core
cd control-panel
cp .env.example .env
docker compose up -d
```

---

### Kubeara Cloud (no setup required)

[→ Start free at app.kubeara.dev](https://app.kubeara.dev)

Free tier — one server, no credit card, no time limit.

---

### After install

1. Open the dashboard
2. Click **Add Server**
3. Provide server IP and SSH key
4. Click **Validate and Connect**
5. Deploy your first service

---

## Why should I use the Cloud version?

Self-hosted is free and always will be. Cloud is for teams who want the same experience without managing the Kubeara control plane themselves.

**Your application data never touches our infrastructure on any plan.**
Both options deploy to servers you connect. We only manage the Kubeara dashboard.

### Cloud is the right choice if

- You want automatic Kubeara updates that includes latest security patches, bug fixes and new services
- You want backups handled automatically
- You want email or priority support
- You do not want to maintain the control plane yourself

### Pricing

| Plan | Price | Servers |
|---|---|---|
| Free | $0 | 1 |
| Starter | $5/month | 5 |
| Pro | $29/month | 25 |
| Max | $99/month | Unlimited |
| Enterprise | $199/month | Unlimited + SSO |

---

## Features

### Free Forever

#### 🚀 Deployment

* One-click deployment from 200+ templates
* Docker Compose and Dockerfile support
* Automatic SSL via Let's Encrypt
* Custom domain configuration
* Automatic container restarts
* Volume and persistent storage management
* Rolling updates with zero downtime

<div align="center">

<img src="https://images.kubeara.dev/screenshots/v2/overview.png" alt="Deploy a service with Kubeara" width="750">

</div>

#### 🖥️ Servers

* Connect any server via SSH
* Automatic server validation on connect
* Real-time CPU, RAM, and disk monitoring
* Multi-region server management
* Agent-based security — No plaintext SSH key storage

<div align="center">

<img src="https://images.kubeara.dev/screenshots/v2/add_server.png" alt="Add Your Server in Kubeara" width="750">

</div>

#### 📊 Real-Time Metrics

* Monitor CPU, RAM, and disk usage
* Monitor GPU utilization and temperature
* Track VRAM usage per service
* View real-time resource usage across your infrastructure

<div align="center">

<img src="https://images.kubeara.dev/screenshots/v2/metrics.png" alt="Real-Time Metrics in Kubeara" width="750">

</div>

#### 🛡️ Resource Validation

* Validate available resources before deployment
* Prevent failed deployments caused by insufficient resources
* Check CPU, RAM, GPU, and VRAM availability

<div align="center">

<img src="https://images.kubeara.dev/screenshots/resource_validation.png" alt="Resource Validation in Kubeara" width="750">

</div>

#### 🤖 AI & Models

* One-click Ollama and AI model deployment
* VRAM validation before every model pull
* GPU utilization per container
* GPU temperature monitoring
* VRAM usage per service

<div align="center">

<img width="750" alt="image" src="https://github.com/user-attachments/assets/8a10e865-629f-40a6-adc4-df81746bfbcc" />

</div>

#### 📋 Activity Tracking

* Keep track of deployment and infrastructure activities
* Monitor important changes across your servers and services

<div align="center">

<img src="https://images.kubeara.dev/screenshots/v2/activities.png" alt="Activity Tracking in Kubeara" width="750">

</div>

#### 🛠️ Developer Experience

* Native MCP server integration
* Real-time deployment logs
* NestJS and Next.js framework support
* API key management
* Team member management

<div align="center">

<img src="https://images.kubeara.dev/screenshots/v2/MCP.png" alt="MCP Integration in Kubeara" width="750">

</div>

---

### Enterprise

- 🔑 SSO / SAML / OIDC
- 📂 LDAP / Active Directory
- 📋 Full audit logs with export
- 🛡️ Advanced RBAC — custom roles
- 📄 Compliance documentation
- 👥 Unlimited team members
- 🤝 SLA guarantee
- 💬 Priority support
- 🏷️ White-label rights

[→ Enterprise pricing](https://kubeara.dev/pricing)  
[→ Request enterprise trial](mailto:bhushan.lilapra@kubeara.dev)

## Development workflow

Kubeara uses [Conventional Commits](https://www.conventionalcommits.org/) and [Release Please](https://github.com/googleapis/release-please) for automated, semver-based releases.

```
Feature branch
      ↓
Pull request (CI: lint, build, test)
      ↓
Merge into main
      ↓
Release Please opens/updates a Release PR
      ↓
Review Release PR (version + CHANGELOG.md)
      ↓
Merge Release PR
      ↓
Git tag + GitHub Release published
      ↓
Users install the new version
```

### Branching

1. Create a feature branch from `main` (for example `feature/deployment-logs`).
2. Open a pull request into `main`.
3. Ensure CI passes (lint, build, template tests).
4. Merge after review.

Merging to `main` does **not** publish a release immediately. Release Please accumulates commits and opens a **Release PR** when a version bump is warranted.

### Conventional commits

Use these types in PR titles or squash-merge commit messages:

| Type | Release impact | Example |
|------|----------------|---------|
| `feat` | Minor (`1.0.0` → `1.1.0`) | `feat: add deployment log streaming` |
| `fix` | Patch (`1.0.0` → `1.0.1`) | `fix: resolve docker compose parser error` |
| `feat!` or `BREAKING CHANGE:` | Major (`1.0.0` → `2.0.0`) | `feat!: redesign deployment API` |
| `docs` | Changelog only | `docs: update install guide` |
| `refactor` | Changelog only | `refactor: simplify agent install flow` |
| `perf` | Performance section | `perf: reduce deployment status polling` |
| `test` | No release | `test: add template compose validation` |
| `build` / `ci` / `chore` / `style` | No release | `chore: update dependencies` |

Breaking change examples:

```text
feat!: remove legacy deploy endpoint

feat: add new deploy API

BREAKING CHANGE: removed /api/v1/deployments/legacy
```

### Releases

- **Release PR**: created/updated by Release Please on pushes to `main`.
- **On merge**: bumps `package.json`, updates `CHANGELOG.md`, creates a git tag (for example `v1.2.0`), and publishes a [GitHub Release](https://github.com/kubeara/core/releases).
- **Tracked version**: [`.release-please-manifest.json`](.release-please-manifest.json).

See also [`release-please-config.json`](release-please-config.json) and [`.github/workflows/release-please.yml`](.github/workflows/release-please.yml).

## Security

### Security model

Kubeara uses an agent-based architecture designed to eliminate the attack surface that caused the January 2026 Coolify vulnerabilities.

**How it works:**
- Agent runs on your server
- Agent initiates outbound connections only
- No Plain text SSH keys stored in any database
- No persistent access to your server after initial bootstrap
- All agent communication encrypted in transit

---

### Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email: bhushan.lilapra@kubeara.dev

We will respond within 48 hours.
We follow responsible disclosure.
We credit researchers in our changelog.

---

### Supported versions

| Version | Supported |
|---|---|
| Latest | ✅ |
| Previous minor | ✅ |
| Older versions | ❌ |

We recommend always running the latest version.

---

### Known security measures

✅ Plain text SSH keys never stored in database  
✅ All secrets encrypted at rest  
✅ Agent outbound connections only  
✅ No persistent SSH access after bootstrap  
✅ Rate limiting on all API endpoints  
✅ Automatic security updates via Docker  
✅ HTTPS enforced on all connections  

[![GitHub stars](https://img.shields.io/github/stars/kubeara/core?style=flat&color=7C3AED&label=stars)](https://github.com/kubeara/core)
[![MIT License](https://img.shields.io/badge/license-MIT-7C3AED.svg)](https://github.com/kubeara/core/blob/main/LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/kubeara/control-panel?style=flat&color=7C3AED)](https://github.com/kubeara/core/pkgs/container/control-panel)
