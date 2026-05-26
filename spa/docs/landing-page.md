# Kubeara — Marketing Site

Specification for the **public marketing site**: landing page and supporting pages. Does not cover auth or authenticated app routes.

---

## Site overview

| Item | Detail |
|------|--------|
| **Pages** | **6** public marketing routes |
| **Audience** | Developers and small teams who self-host on VPS or bare metal |
| **Goal** | Explain Kubeara, build trust, answer questions, and drive **Sign up** / **Sign in** |
| **Framework** | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 — same repo as the app |
| **Route group** | `src/app/(marketing)/` with shared layout, header, and footer |

### One-line pitch

Deploy databases, caches, and observability stacks on **your servers** with curated templates and live deployment logs—no manual Kubernetes setup.

### Marketing routes

| # | Route | Purpose |
|---|--------|---------|
| 1 | `/` | Landing — convert visitors |
| 2 | `/pricing` | Plans, beta pricing, billing FAQ |
| 3 | `/docs` | Getting started and how-to guides |
| 4 | `/privacy` | Privacy policy |
| 5 | `/terms` | Terms of service |
| 6 | `/contact` | Support and inquiries |

---

## Shared chrome (all marketing pages)

### Header (sticky)

| Element | Content / behavior |
|---------|-------------------|
| Logo | **K** mark + “Kubeara” → `/` |
| Nav | **Docs** → `/docs` · **Pricing** → `/pricing` · **Contact** → `/contact` |
| On `/` only | Optional in-page anchors: Features `#features`, Templates `#templates`, FAQ `#faq` |
| Theme toggle | Reuse `ThemeToggle` (light/dark) |
| Actions | **Sign in** → `/login` · **Get started** → `/register` (primary) |

### Footer (all pages)

| Column | Links |
|--------|--------|
| **Product** | `/` (Home), `/docs`, `/pricing`, `/contact` |
| **Account** | `/login`, `/register` |
| **Legal** | `/privacy`, `/terms` |
| **Meta** | © {year} Kubeara |

### Layout & middleware

- **No** app `TopBar`; shared `(marketing)` layout with header + footer.
- **Public** — no session required; pages are cacheable.
- **Middleware:** Allow `/`, `/pricing`, `/docs`, `/privacy`, `/terms`, `/contact` without auth redirect.
  - **Anonymous** at `/` → marketing home (not redirect to `/login`).
  - **Authenticated** at `/` → redirect to `/servers` (recommended) or show “Go to dashboard”.
  - Auth routes unchanged; protected app routes unchanged.

### Suggested file structure

```
src/app/(marketing)/
  layout.tsx              # MarketingHeader + Footer + children
  page.tsx                # Landing (/) — or keep src/app/page.tsx at root
  pricing/page.tsx
  docs/page.tsx
  privacy/page.tsx
  terms/page.tsx
  contact/page.tsx
src/components/marketing/
  marketing-header.tsx
  marketing-footer.tsx
  marketing-hero.tsx
  ...
src/app/globals.css       # .marketing-* styles
```

Update `src/middleware.ts` `matcher` to include all six marketing paths.

---

# `/` — Landing page

Single scrollable page. Primary conversion surface.

## Page structure

```
┌─────────────────────────────────────────┐
│  Shared header                          │
├─────────────────────────────────────────┤
│  1. Hero                                │
│  2. Logos / trust (optional, v2)        │
│  3. How it works                        │
│  4. Template highlights                 │
│  5. Features                            │
│  6. FAQ                                 │
│  7. Final CTA                           │
├─────────────────────────────────────────┤
│  Shared footer                          │
└─────────────────────────────────────────┘
```

## Section content

### 1. Hero

| Element | Copy (draft) |
|---------|----------------|
| **Eyebrow** | Self-hosted infrastructure, simplified |
| **Headline** | Deploy production stacks on your servers in minutes |
| **Subheadline** | Connect SSH, pick a template, and follow real-time deployment logs. PostgreSQL, Redis, Kafka, Grafana, and more—on hardware you control. |
| **Primary CTA** | Get started free → `/register` |
| **Secondary CTA** | Sign in → `/login` |
| **Visual** | Product screenshot: template grid + deploy log panel |

### 2. Trust (optional — v2)

Strip: “Your server. Your data.” · Badges: SSH · Docker-friendly · No vendor lock-in

### 3. How it works

| Step | Title | Body |
|------|--------|------|
| 1 | Connect your server | Add host and credentials. Kubeara talks to your machine over SSH. |
| 2 | Choose a template | Pick from databases, caches, messaging, monitoring, and automation. |
| 3 | Deploy and monitor | Watch live logs until the stack is ready. Manage everything from one dashboard. |

Link: **Read the docs** → `/docs`

### 4. Template highlights (`#templates`)

Eight cards from `src/lib/templates.ts`: PostgreSQL, MongoDB, Redis, Kafka, Grafana, n8n, Elasticsearch, NGINX.

| Element | Content |
|---------|---------|
| Title | Popular templates |
| Subtitle | One-click deploys for the stacks you run every day. |
| CTA | View all templates → `/register` |

Do not link to `/deploy/...` from landing—auth required.

### 5. Features (`#features`)

| Feature | Description |
|---------|-------------|
| Server inventory | Every connected server, status, and host at a glance. |
| Curated templates | Pre-configured stacks by category—not raw YAML dumps. |
| Live deployment logs | Stream-style logs during deploy. |
| Your infrastructure | Workloads run on your VPS or metal. |
| Dark & light mode | System-aware theming. |

### 6. FAQ (`#faq`)

| Question | Answer (draft) |
|----------|----------------|
| What is Kubeara? | A control plane to connect servers and deploy infrastructure templates with guided logs. |
| What do I need to get started? | A Linux server over SSH and a Kubeara account. See [docs](/docs). |
| Which templates are available? | Databases, caches, messaging, search, storage, monitoring, and more. |
| Is my data stored in the cloud? | Account metadata is managed by Kubeara; workloads run on **your** machines. See [privacy](/privacy). |
| Is Kubeara free? | See [pricing](/pricing) for current plans and beta details. |
| Can I use this in production? | Validate backups, networking, and security for your environment. |

### 7. Final CTA

| Element | Copy |
|---------|------|
| Headline | Ready to deploy on your own servers? |
| Subhead | Create an account and connect your first server in minutes. |
| Primary CTA | Get started → `/register` |
| Secondary | Sign in → `/login` |

### SEO (`/`)

| Field | Draft |
|-------|--------|
| `title` | Kubeara — Deploy infrastructure on your servers |
| `description` | Connect your servers and deploy PostgreSQL, Redis, Kafka, Grafana, and more with one-click templates and live deployment logs. |

---

# `/pricing` — Pricing

**Goal:** Set expectations on cost; reduce signup friction during beta.

## Page structure

```
Header
├── Hero (pricing headline)
├── Plan cards (1–3 tiers or single “Beta” card)
├── Feature comparison table (optional)
├── Billing FAQ
├── CTA band
Footer
```

## Content

### Hero

| Element | Copy (draft) |
|---------|----------------|
| **Headline** | Simple pricing for self-hosted teams |
| **Subhead** | Pay for the control plane. Your compute stays on your servers. |

### Plans (draft — adjust before launch)

| Plan | Price | Best for | Includes |
|------|-------|----------|----------|
| **Beta** | Free | Early adopters | Unlimited servers (fair use), all templates, community support |
| **Pro** (future) | $X / month | Growing teams | Priority support, team seats, SLA — *placeholder* |
| **Enterprise** (future) | Contact us | Orgs with compliance needs | SSO, custom templates, dedicated support → `/contact` |

**Beta card CTA:** Get started → `/register`  
**Enterprise CTA:** Contact sales → `/contact`

### What’s always included (bullet list)

- Server connection and inventory
- Template catalog and deployments
- Live deployment logs
- Light and dark UI

### What’s not billed

- Infrastructure running on **your** machines (your VPS/cloud bill is separate)
- Egress or storage on your servers

### Billing FAQ

| Question | Answer (draft) |
|----------|----------------|
| Is the beta really free? | Yes, during the beta period. We’ll notify users before paid plans apply. |
| Will I be charged for my servers? | No. Kubeara does not bill for CPU/RAM on your hardware. |
| Can I cancel anytime? | Yes. Delete your account or stop using the service; no lock-in on your servers. |
| When will paid plans launch? | Announced on this page and by email before billing starts. |

### CTA band

**Start free during beta** → `/register` · Questions? → `/contact`

### SEO

| Field | Draft |
|-------|--------|
| `title` | Pricing — Kubeara |
| `description` | Kubeara beta pricing and plans. Deploy infrastructure on your own servers. |

---

# `/docs` — Documentation

**Goal:** Help new users succeed without support tickets.

## Page structure

```
Header
├── Docs home hero
├── Quick start (numbered)
├── Guides (cards or sidebar nav)
├── Troubleshooting
├── “Still stuck?” → /contact
Footer
```

## Content

### Hero

| Element | Copy (draft) |
|---------|----------------|
| **Headline** | Kubeara documentation |
| **Subhead** | Connect a server, deploy a template, and read deployment logs—in a few steps. |

### Quick start

| Step | Title | Body |
|------|--------|------|
| 1 | Create an account | [Register](/register) or [sign in](/login). |
| 2 | Add a server | Go to **Servers** → add name, host, username, and SSH credentials. Server must be reachable on the network Kubeara uses. |
| 3 | Pick a template | Open **Templates**, choose a stack (e.g. PostgreSQL), click **Deploy**. |
| 4 | Follow deployment logs | Watch the log stream until the deploy completes. Fix errors using the log output. |
| 5 | Verify the service | SSH to the host or use the stack’s default port/docs to confirm it’s running. |

**CTA:** Get started → `/register`

### Guides (sections or linked anchors)

| Guide | Summary |
|-------|---------|
| **Connecting a server** | Linux recommended; SSH key or password; firewall must allow Kubeara’s connection; status pills: online, offline, pending, error. |
| **Templates overview** | Categories: Database, Cache, Messaging, Search, Storage, Monitoring, Infrastructure, Automation; full list matches app catalog. |
| **Deployment logs** | Real-time stream during deploy; back to templates when done; common log patterns (pulling image, starting service, health check). |
| **Account & profile** | Name and email on **Profile**; password reset via [forgot password](/forgot-password). |
| **Security practices** | Rotate credentials; restrict SSH; don’t expose admin ports publicly; review [privacy](/privacy). |

### Troubleshooting

| Problem | Things to try |
|---------|----------------|
| Server stays **pending** or **offline** | Check host/IP, SSH port, credentials, firewall, and that the machine is up. |
| Deploy fails mid-log | Read the last error line; disk space; port conflicts; re-run deploy after fixing. |
| Can’t sign in | Reset password; clear cookies; confirm correct email. |
| Template not listed | Refresh; sign in; some templates may roll out gradually. |

### Still stuck?

Contact us at `/contact` or email [support@kubeara.com] *(replace with real address)*.

### SEO

| Field | Draft |
|-------|--------|
| `title` | Documentation — Kubeara |
| `description` | Quick start and guides for connecting servers and deploying templates with Kubeara. |

---

# `/privacy` — Privacy policy

**Goal:** Legal transparency; linked from FAQ, footer, and registration.

> **Note:** Replace placeholders with lawyer-reviewed text before production.

## Page structure

```
Header
├── Title + Last updated date
├── Table of contents (anchor links)
├── Policy sections (prose)
Footer
```

## Sections (outline + draft summaries)

| Section | Content to cover |
|---------|------------------|
| **Introduction** | Kubeara (“we”) respects your privacy. This policy explains what we collect and why. |
| **Information we collect** | Account: name, email, password (hashed). Usage: session cookie (`kubeara_session`), IP/logs for security. Servers: host, username, connection metadata you provide—**not** workload data on your machines unless stated. |
| **How we use information** | Operate the service, authentication, support, improve product, security/abuse prevention. |
| **Where data is stored** | Kubeara application data on our infrastructure; **workloads run on your servers**. |
| **Cookies** | Session cookie for login; theme preference if stored client-side. |
| **Sharing** | No sale of personal data; subprocessors (hosting, email) listed when applicable. |
| **Retention** | Account data while active; deletion on account removal subject to legal retention. |
| **Your rights** | Access, correction, deletion, export—contact `/contact`. GDPR/CCPA bullets if applicable. |
| **Security** | Reasonable measures; users responsible for SSH and server hardening. |
| **Children** | Service not directed at under-16. |
| **Changes** | We may update this page; “Last updated” date at top. |
| **Contact** | Privacy questions → `/contact` or privacy@kubeara.com *(placeholder)*. |

### SEO

| Field | Draft |
|-------|--------|
| `title` | Privacy Policy — Kubeara |
| `description` | How Kubeara collects, uses, and protects your personal information. |

---

# `/terms` — Terms of service

**Goal:** Usage rules and liability limits.

> **Note:** Replace placeholders with lawyer-reviewed text before production.

## Page structure

Same as privacy: header, title, last updated, TOC, sections, footer.

## Sections (outline + draft summaries)

| Section | Content to cover |
|---------|------------------|
| **Agreement** | By using Kubeara you accept these terms. |
| **Service description** | Control plane to connect servers and deploy templates; provided as-is during beta. |
| **Accounts** | Accurate registration info; you’re responsible for account security. |
| **Acceptable use** | No illegal activity, abuse, crypto mining on shared infra, attempting to breach others’ systems. |
| **Your servers** | You own/configure your machines; you’re responsible for compliance, backups, and costs with your provider. |
| **Intellectual property** | Kubeara brand and software ours; templates/stacks subject to their upstream licenses. |
| **Beta disclaimer** | Service may change or break; no guaranteed uptime during beta. |
| **Disclaimer of warranties** | Provided “as is” to extent permitted by law. |
| **Limitation of liability** | Cap damages as permitted; no liability for data loss on your servers from your misconfiguration. |
| **Termination** | We may suspend accounts for violation; you may stop using the service anytime. |
| **Governing law** | [Jurisdiction — TBD] |
| **Contact** | Legal/terms questions → `/contact`. |

### SEO

| Field | Draft |
|-------|--------|
| `title` | Terms of Service — Kubeara |
| `description` | Terms and conditions for using the Kubeara platform. |

---

# `/contact` — Contact

**Goal:** Single place for support, sales, and privacy/legal inquiries.

## Page structure

```
Header
├── Hero
├── Contact methods (cards)
├── Contact form (optional v1: mailto only)
├── Response expectations
Footer
```

## Content

### Hero

| Element | Copy (draft) |
|---------|----------------|
| **Headline** | Get in touch |
| **Subhead** | Questions about beta access, deployments, or enterprise? We’re here to help. |

### Contact channels

| Channel | Detail | Use for |
|---------|--------|---------|
| **General support** | support@kubeara.com *(placeholder)* | Bugs, deploy help, account issues |
| **Sales / Enterprise** | sales@kubeara.com *(placeholder)* | Pro/Enterprise, volume, custom needs |
| **Privacy** | privacy@kubeara.com *(placeholder)* | Data requests, privacy policy |

### Contact form (v1 or v2)

| Field | Required |
|-------|----------|
| Name | Yes |
| Email | Yes |
| Topic | Dropdown: Support · Billing · Enterprise · Privacy · Other |
| Message | Yes |

**v1 alternative:** Mailto links only—no backend form until API exists.

**Submit behavior (when form exists):** POST to `/api/contact` or third-party (Resend, Formspree); success message + no PII in URL.

### Response expectations

| Element | Copy |
|---------|------|
| Copy | We typically respond within 2 business days during beta. |

### CTA

Not ready to write? **Read the docs** → `/docs` · **Get started** → `/register`

### SEO

| Field | Draft |
|-------|--------|
| `title` | Contact — Kubeara |
| `description` | Contact Kubeara for support, sales, and privacy inquiries. |

---

## CTAs summary (all marketing pages)

| Label | Destination | Typical usage |
|-------|-------------|----------------|
| Get started / Get started free | `/register` | Header, hero, final CTAs, pricing beta card |
| Sign in | `/login` | Header, footer |
| Documentation / Read the docs | `/docs` | Landing how-it-works, contact page |
| Pricing / See pricing | `/pricing` | Landing FAQ |
| Contact us | `/contact` | Pricing enterprise, docs, privacy/terms |
| Privacy / Terms | `/privacy`, `/terms` | Footer, FAQ, registration links |

---

## Design guidelines (all pages)

| Topic | Guidance |
|-------|----------|
| **Brand** | Logo mark **K** (same as app `TopBar`) |
| **Colors** | `--background`, `--foreground`, `--surface`, `--primary` from `globals.css` |
| **Typography** | Geist Sans; landing hero largest; docs/legal use readable prose width (~`65ch`) |
| **Legal pages** | Simple typography, numbered sections, sticky TOC on desktop optional |
| **Tone** | Direct, technical, confident |

---

## Copy checklist (before launch)

- [ ] All 6 routes implemented and in middleware matcher
- [ ] Shared header/footer links work (no `#` placeholders)
- [ ] Landing copy and templates match `templates.ts`
- [ ] FAQ links to `/pricing`, `/privacy`, `/docs`
- [ ] Privacy & terms reviewed by counsel
- [ ] Contact emails replaced with real addresses
- [ ] Authenticated `/` redirect tested
- [ ] Per-page SEO `title` / `description` set

---

## Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **1** | `(marketing)` layout, header, footer, `/` landing, middleware |
| **2** | `/docs` quick start + troubleshooting |
| **3** | `/pricing` + `/contact` |
| **4** | `/privacy` + `/terms` (legal review) |
| **5** | OG images, contact form API, polish & a11y |

---

## Out of scope (this doc)

- Auth pages: `/login`, `/register`, `/forgot-password`, `/reset-password`
- App pages: `/servers`, `/templates`, `/deploy/...`, `/profile`
- API routes except future `/api/contact`

---

*Kubeara marketing site — May 2026.*
