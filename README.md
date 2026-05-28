[![GitHub stars](https://img.shields.io/github/stars/kubeara/core?style=flat&color=7C3AED&label=stars)](https://github.com/kubeara/core)
[![MIT License](https://img.shields.io/badge/license-MIT-7C3AED.svg)](https://github.com/kubeara/core/blob/main/LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/kubeara/control-panel?style=flat&color=7C3AED)](https://github.com/kubeara/core/pkgs/container/control-panel)

<div align="center">

# Kubeara

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

### Two ways to use Kubeara

**Self-hosted — free forever**  
Run Kubeara on your own server.  
Full control. MIT licensed.  
No feature limits. No time limits.  

**Kubeara Cloud — managed for you**  
We run the control plane.  
You connect your servers.  
Free For available. No credit card.

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
| **Agent-based security** | Agent runs on your server and initiates outbound connections only. No SSH keys stored in any database. |
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
| **Heroku and Render refugees** | Same deployment experience. Your infrastructure. Fraction of the cost. |
| **DevOps teams** | Replace manual Docker Compose management with a proper control plane and monitoring. |

## Quick Start

### Self-hosted (free forever)

```bash
curl -fsSL https://get.kubeara.dev | sh
```

> View the install script before running:
> [install.sh](https://github.com/kubeara/core/blob/main/install.sh)

Open dashboard: http://your-server-ip:3000

**Manual install:**
```bash
git clone https://github.com/kubeara/core
cd core
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
3. Paste server IP and SSH key
4. Click **Validate and Connect**
5. Deploy your first service

**Manual install:**
```bash
git clone https://github.com/kubeara/core
cd core
cp .env.example .env
docker compose up -d
```

---

### Kubeara Cloud (no setup required)

[→ Start free at app.kubeara.dev](https://app.kubeara.dev)

Free Forver No Hidden Charges.

---

### After install

1. Open the dashboard
2. Click **Add Server**
3. Paste server IP and SSH key
4. Click **Validate and Connect**
5. Deploy your first service

## Why should I use the Cloud version?

Self-hosted is free and always will be. Cloud is for teams who want the same experience without managing the Kubeara control plane themselves.

**Your application data never touches our infrastructure on any plan.**
Both options deploy to servers you connect. We only manage the Kubeara dashboard.

### Cloud is the right choice if

- You want automatic Kubeara updates
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

## Features

### Core — free forever

**Deployment**
- 🚀 One-click deployment from 200+ templates
- 🐳 Docker Compose and Dockerfile support
- 🌐 Automatic SSL via Let's Encrypt
- 🔀 Custom domain configuration
- ♻️ Automatic container restarts
- 📦 Volume and persistent storage management
- 🔄 Rolling updates with zero downtime

**Servers**
- 🖥️ Connect any server via SSH
- 🔍 Automatic server validation on connect
- 📊 Real-time CPU, RAM, and disk monitoring
- 🌍 Multi-region server management
- 🔒 Agent-based security — no SSH key storage

**AI and Models**
- 🤖 Ollama deployment in one click
- 🧠 AI model browser — pull any model
- ⚡ VRAM checker before every model pull
- 📈 GPU utilization per container
- 🌡️ GPU temperature monitoring
- 💾 VRAM usage per service

**Developer Experience**
- 🔗 Native MCP server integration
- 📝 Real-time deployment logs
- 🛠️ NestJS and Next.js framework support
- 🔑 API key management
- 👥 Team members Management
- 🏢 Workspace Management

---

### Enterprise

- 🔑 SSO / SAML / OIDC
- 📂 LDAP / Active Directory
- 📋 Full audit logs with export
- 🛡️ Advanced RBAC — custom roles
- 📄 Compliance documentation
- 👥 Unlimited team members
- 🏢 Unlimited workspaces
- 🤝 SLA guarantee
- 💬 Priority support
- 🏷️ White-label rights

[→ Enterprise pricing](https://kubeara.dev/pricing)  
[→ Request enterprise trial](mailto:bhushan.lilapra@kubeara.dev)
