# SynqDrive — Agent instructions

## Repository layout

| Path | Role |
|------|------|
| `backend/` | NestJS modular monolith, Prisma, workers, DIMO/HM integrations |
| `frontend/` | Vite + React SPA (rental, master, operator surfaces) |
| `architecture/` | Canonical module authorities, knowledge graphs, and supporting change records |
| `.cursor/rules/` | Project engineering rules (always apply) |
| `.cursor/scripts/` | Cloud Agent bootstrap + VPS deploy helpers |

## Mandatory architecture-first workflow

Before inspecting or changing any SynqDrive module, every agent **must** follow this workflow.

**Normative audit standard:** Every `NOT_STARTED` or `AUDIT_IN_PROGRESS` module audit must read and follow [`architecture/MODULE_AUTHORITY_STANDARD.md`](architecture/MODULE_AUTHORITY_STANDARD.md) **before** auditing or creating authority files. Detailed audit rules, mandatory file structure, Production read-only safety, and the `AUTHORITY_ACTIVE` promotion gate live in that standard — this section provides routing only.

### 1. Read the central registry first

Read [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md) before substantive module work.

### 2. Find the module and check registry coverage status

Find the affected module in the registry overview table and read its **registry coverage status**. Listing alone does not mean a usable authority exists.

| Registry status | Agent action |
|-----------------|--------------|
| **`AUTHORITY_ACTIVE`** | Read all mandatory authority entry documents before substantive work (see §3). |
| **`NOT_STARTED`** | Module is inventoried only — treat as having no authority; read and execute [`MODULE_AUTHORITY_STANDARD.md`](architecture/MODULE_AUTHORITY_STANDARD.md) before substantive work (see §4). |
| **`AUDIT_IN_PROGRESS`** | Read existing partial audit artifacts; continue under [`MODULE_AUTHORITY_STANDARD.md`](architecture/MODULE_AUTHORITY_STANDARD.md); do not treat partial docs as complete authority (see §5). |
| **`SUPERSEDED`** | Do not extend the superseded authority; follow the successor pointer (see §6). |

Registry coverage status is separate from each authority’s native lifecycle, maturity, epistemic, and validation statuses.

### 3. If registry status is `AUTHORITY_ACTIVE`

- Read all mandatory authority entry documents listed in the registry.
- Inspect scope boundaries, current state, invariants, decisions, evidence, contradictions, open questions, and validation commands.
- Update the authority in the **same workstream/PR** when the change is substantive.

### 4. If registry status is `NOT_STARTED`

The module is only inventoried and must be treated like a module with **no authority**. A listed `NOT_STARTED` module must **never** be treated as already understood, documented, audited, or safe to change based only on its registry entry.

Before substantive implementation:

1. Read and follow [`architecture/MODULE_AUTHORITY_STANDARD.md`](architecture/MODULE_AUTHORITY_STANDARD.md) completely.
2. Set registry status to `AUDIT_IN_PROGRESS` when reconstruction begins.
3. Perform the **repository current-state audit** and, for runtime-bearing modules, a **read-only Production-VPS audit** per the standard.
4. Treat `origin/main` and deployed Production as **separate baselines**; record and reconcile drift.
5. If Production access is unavailable, record the non-secret blocker in `AUDIT_MANIFEST.md` / `evidence/PRODUCTION_BASELINE.md` — do **not** invent runtime facts.
6. Do **not** promote a deployed runtime-bearing module to `AUTHORITY_ACTIVE` without the required Production audit (`VERIFIED_READ_ONLY`, or justified `PRODUCTION_NOT_APPLICABLE` / `NOT_DEPLOYED`).
7. Production audits are **read-only by default**. Never deploy, restart processes, modify flags, mutate data, reprocess events, enqueue jobs, run migrations, or modify Production during an audit without **separate, explicit user authorization**.
8. Create authority artifacts per the standard’s mandatory directory structure; use [`architecture/tankstellenerkennung/`](architecture/tankstellenerkennung/) as the structural reference.
9. Classify knowledge on **three separate axes** (never merge into one field):
   - **Registry coverage status** — `NOT_STARTED`, `AUDIT_IN_PROGRESS`, `AUTHORITY_ACTIVE`, `SUPERSEDED`
   - **Epistemic state** — for example `CONFIRMED`, `INFERRED`, `HISTORICAL`, `UNKNOWN`, `CONTRADICTED`
   - **Decision / validation status** — for example `PROPOSED`, `EXPERIMENTAL`, `VALIDATED`, `PRODUCTION_VALIDATED`, `REJECTED`, `SUPERSEDED`
   Follow the owning module authority’s exact schema where it defines equivalent vocabulary.
10. Promote to `AUTHORITY_ACTIVE` only when the standard’s promotion gate is satisfied.
11. Update the module’s registry row and detailed authority section in the **same workstream/PR**.

Agents have repository access and are expected to have configured Production-VPS access. Verify with `bash .cursor/scripts/cloud-agent-verify-vps.sh` before Production inspection.

### 5. If registry status is `AUDIT_IN_PROGRESS`

- Read and continue under [`architecture/MODULE_AUTHORITY_STANDARD.md`](architecture/MODULE_AUTHORITY_STANDARD.md).
- Read all existing partial audit artifacts.
- Do **not** treat them as complete authority.
- Complete missing repository and Production audit surfaces required for the task.
- Explicitly preserve unresolved gaps and uncertainty.
- Do **not** silently set `AUTHORITY_ACTIVE` merely because files exist.

### 6. If registry status is `SUPERSEDED`

- Do **not** extend the superseded authority.
- Follow the successor pointer in the registry.
- Preserve the superseded entry for historical navigation.

### 7. If the module is entirely absent from the inventory

- Add an inventory row with initial registry status `NOT_STARTED` (module name, mini description, registry status).
- Then read and execute [`architecture/MODULE_AUTHORITY_STANDARD.md`](architecture/MODULE_AUTHORITY_STANDARD.md) when substantive work is requested.

### 8. Supporting documents are evidence, not default authority

Root-level architecture phase/change documents (for example `architecture/P1_*`, `architecture/BATTERY_V2_*`, `architecture/FUEL_STATION_*`) are **supporting evidence** unless a registered authority explicitly designates them as current authority. Do not infer that a module is documented merely because flat `architecture/*.md` files mention it.

### 9. During and after work

- **Code and verified runtime evidence** remain the source of truth for current behavior.
- The **registered authority** is the canonical architectural memory and navigation layer.
- Conflicts between code and documentation must be **recorded and resolved** — never silently overwritten.
- Cross-module changes require consultation and updates of **every owning authority**.
- Substantive behavior/architecture/signal/lifecycle/calculation/queue/worker/integration/persistence/API/UI-contract changes must update the affected authority in the **same workstream/PR**.
- Preserve **BEFORE**, **WHY**, **CHANGE**, alternatives, expected effect, validation, observed effect, non-effects, tradeoffs, remaining gaps, and evidence where applicable.
- Run applicable authority validators.
- The final report must state which architecture authorities and change records were updated.

#### Registry synchronization gate

After substantive work, before declaring the task complete:

1. Determine every **affected module** from the final diff.
2. Update every affected **module authority** in the same PR when the change is substantive.
3. Re-read each affected registry **overview row** and **active detail section** in [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md) after the authority update.
4. Update the central registry **only if** any listed metadata changed (module name, mini description, registry coverage status, authority-native status, authority path, scope, boundaries, mandatory entry documents, validation commands, successor, Last updated).
5. Explicitly report `REGISTRY_REVIEWED: UPDATED` or `REGISTRY_REVIEWED: UNCHANGED` for **every** affected module, with before/after registry coverage status.
6. Run the central registry validator: `bash architecture/scripts/validate-module-registry.sh`
7. A missing registry review result is **incomplete work**.

**Important:**

- An ordinary change to an `AUTHORITY_ACTIVE` module normally leaves it `AUTHORITY_ACTIVE`.
- Registry coverage status expresses documentation/authority coverage, **not** feature maturity.
- Authority-native, epistemic, and decision/validation statuses remain **separate axes**.
- Never promote or downgrade a module merely because files or implementation changes exist.
- Cross-module changes require **one review result per affected module**.

See [`.cursor/rules/Architectur-Updates.mdc`](.cursor/rules/Architectur-Updates.mdc) for the mandatory `ARCHITECTURE_GOVERNANCE` completion report contract.

## Local development (reference)

```bash
cd backend && npm ci && npx prisma generate
cd ../frontend && npm ci
cd backend && npm run infra:up          # postgres, redis, clickhouse via docker compose (local dev only)
cd backend && npm run start:dev
cd frontend && npm run dev
```

Env template: `backend/.env.example` — **never commit real secrets**.

ClickHouse: backend connects via `CLICKHOUSE_URL` only (optional). Local dev may use `npm run infra:up` for Docker Compose; production may use native/external/self-hosted — see `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`. Verify: `npm run clickhouse:ping:url`. **Do not** run `infra:up` blindly on a prod VPS.

---

## Cursor Cloud Agent setup

Cloud Agents use `.cursor/environment.json` (Dockerfile + install/start scripts).
**Configure credentials in the [Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents) → Secrets tab — never in git.**

### Runtime Secret vs Environment Variable

Both types are injected as shell environment variables at agent runtime. The difference is visibility to the AI agent:

| Cursor type | Use for | Agent can read value? | Redacted in chat/commits? |
|-------------|---------|----------------------|---------------------------|
| **Runtime Secret** | Passwords, private keys, API secrets, DB URLs | No (`[REDACTED]`) | Yes |
| **Environment Variable** | Hostnames, usernames, public URLs, feature flags | Yes | No |

**Rule of thumb for SynqDrive:**

- **Runtime Secret:** anything that must not appear in commits or agent transcripts.
- **Environment Variable:** non-sensitive config the agent may need to see (e.g. `CLOUD_AGENT_VPS_HOST`).

Build-time-only credentials (private npm registries) → **Build Secret** (not used for VPS deploy).

### Choose a VPS path

| Path | When | `CLOUD_AGENT_VPS_HOST` | `TAILSCALE_AUTH_KEY` |
|------|------|--------------------------|----------------------|
| **A — Public SSH** (simpler) | Deploy only, Hostinger SSH reachable | `srv1374778.hstgr.cloud` | **Do not add** |
| **B — Tailscale** (more secure) | Private VPS + optional prod DB from agent | `mein-vps.internal` | **Runtime Secret** |

**Tailscale without using it:** do **not** create an empty `TAILSCALE_AUTH_KEY` entry. Omit the variable entirely — `cloud-agent-start.sh` only connects when the key is set and non-empty. Add it later when you switch to path B.

### Dashboard checklist (one-time)

1. **Connect SCM** — GitHub/GitLab with read-write on this repo.
2. **Create environment** — select this repo; Cursor builds from `.cursor/environment.json`.
3. **Network policy** — Dashboard → Cloud Agents → **Security**:
   - Mode: **Default + allowlist** (recommended)
   - Path A: `srv1374778.hstgr.cloud`, `app.synqdrive.eu`, `github.com`
   - Path B: also `mein-vps.internal`
   - Required artifact host: `cloud-agent-artifacts.s3.us-east-1.amazonaws.com`
4. **Tailscale ACL** (path B only) — allow node `synqdrive-cursor-cloud` → `mein-vps` on TCP **22** and **5432**.
5. **Secrets** — see table below.
6. **Restart** the Cloud Agent after adding or changing secrets.

#### Secrets inventory

| Name | Cursor type | Path A (public SSH) | Path B (Tailscale) |
|------|-------------|---------------------|---------------------|
| `CLOUD_AGENT_SSH_PRIVATE_KEY` | **Runtime Secret** | Required | Required |
| `CLOUD_AGENT_VPS_HOST` | Environment Variable | `srv1374778.hstgr.cloud` | `mein-vps.internal` |
| `CLOUD_AGENT_SSH_USER` | Environment Variable | `root` (optional) | `root` (optional) |
| `TAILSCALE_AUTH_KEY` | **Runtime Secret** | **omit** | Required |
| `DATABASE_URL` | **Runtime Secret** | omit (unless needed) | Optional (prod DB via tailnet) |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Runtime Secret | As needed for task | As needed |
| `DIMO_API_KEY`, `DIMO_PRIVATE_KEY`, `DIMO_CLIENT_ID` | Runtime Secret | As needed | As needed |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Runtime Secret | As needed for email deploy | As needed |
| `HOSTINGER_API_TOKEN` | Runtime Secret | For `sync-resend-dns-to-hostinger.sh` (DNS) | Optional |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Runtime Secret | As needed | As needed |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN` | Runtime Secret | Voice Assistant PSTN | As needed |
| `TWILIO_VOICE_WEBHOOK_BASE_URL` | Environment Variable | `https://app.synqdrive.eu` (prod webhook base) | As needed |
| Other keys from `backend/.env.example` | Runtime Secret | As needed | As needed |

#### MCP servers (Cursor agent tooling)

Project template: `.cursor/mcp.json.example` (committed). Runtime config: `.cursor/mcp.json` (gitignored, generated at Cloud Agent install).

| Server | Auth | Required secrets / setup |
|--------|------|--------------------------|
| **didit** | OAuth (browser on first tool call) | No API key — log in via Cursor MCP UI |
| **dimo** | Env | `DIMO_CLIENT_ID`, `DIMO_PRIVATE_KEY`, `DIMO_DOMAIN` (e.g. `https://app.synqdrive.eu/auth/dimo/callback`) |
| **resend** | Env | `RESEND_API_KEY` (Bearer to `https://mcp.resend.com/mcp`) |
| **stripe** | Env | `STRIPE_SECRET_KEY` (Bearer to `https://mcp.stripe.com`) |
| **hostinger-api** | Env | `HOSTINGER_API_TOKEN` |

Cloud Agent bootstrap runs `cloud-agent-mcp-setup.sh` during install (writes `.cursor/mcp.json`). After adding secrets, restart the Cloud Agent. Didit still needs one-time OAuth in the MCP panel.

Local Cursor: copy the example or run `bash .cursor/scripts/cloud-agent-mcp-setup.sh`, then reload the window.

`CLOUD_AGENT_SSH_PRIVATE_KEY` = full PEM from local `id_ed25519` (Windows: `C:\Users\<you>\.ssh\id_ed25519`).

### VPS connectivity

On boot, `cloud-agent-start.sh`:

1. Connects Tailscale **only if** `TAILSCALE_AUTH_KEY` is set (path B).
2. Materializes `~/.ssh/id_ed25519` from `CLOUD_AGENT_SSH_PRIVATE_KEY`.
3. Runs connectivity checks when Tailscale is active (path B).

Manual verification inside a Cloud Agent shell:

```bash
bash .cursor/scripts/cloud-agent-verify-vps.sh
ssh ${CLOUD_AGENT_SSH_USER:-root}@${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud} 'hostname'
```

Path B only — HTTP(S) via Tailscale proxy:

```bash
source ~/.cursor-cloud-proxy.env
```

### Deploy without Tailscale (path A — recommended for deploy-only)

No Tailscale account or auth key required. Same deploy script as path B.

**Minimum secrets (Cursor dashboard):**

| Name | Type | Value |
|------|------|-------|
| `CLOUD_AGENT_SSH_PRIVATE_KEY` | Runtime Secret | Your `id_ed25519` private key (full PEM) |
| `CLOUD_AGENT_VPS_HOST` | Environment Variable | `srv1374778.hstgr.cloud` |
| `CLOUD_AGENT_SSH_USER` | Environment Variable | `root` |

**Do not add** `TAILSCALE_AUTH_KEY`.

**Allowlist:** `srv1374778.hstgr.cloud`, `app.synqdrive.eu`, `github.com`.

**Prerequisite:** VPS SSH (port 22) must be reachable from Cursor Cloud Agent IPs. Hostinger firewall must allow inbound SSH (key-only auth). If SSH is IP-restricted to your home IP only, path A will fail — use path B (Tailscale) instead.

**Test in Cloud Agent terminal:**

```bash
ssh -o BatchMode=yes root@srv1374778.hstgr.cloud hostname
bash .cursor/scripts/cloud-agent-deploy.sh
```

---

## Production deploy (Cloud Agent)

The VPS deploy clones **`main` from GitHub** — not the agent workspace. Always **push before deploy**.

### Standard flow (same as local agent)

When the user asks to **commit and deploy**:

1. `git status` / `git diff` — review changes; never commit secrets (`.env`, keys).
2. Commit with a concise message if there are changes.
3. `git push origin main`
4. Run:

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

The deploy script:

- Verifies SSH to the VPS (Tailscale optional)
- Ensures working tree is clean and `main` is pushed to `origin`
- SSHs to the VPS and runs `backend/scripts/ops/vps-deploy-release.sh`
- That remote script: DB backup → clone release → link `backend.env` + `frontend.env` → `npm ci` + build → Prisma migrate → PM2 restart → health check
- Verifies `https://app.synqdrive.eu/api/v1/health`

### Deploy-only (no new commits)

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

Skip git preflight (e.g. redeploy current `main` without local checkout):

```bash
CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 bash .cursor/scripts/cloud-agent-deploy.sh
```

### Override targets (optional)

| Name | Type | Default |
|------|------|---------|
| `CLOUD_AGENT_VPS_HOST` | Environment Variable | `mein-vps.internal` (use `srv1374778.hstgr.cloud` without Tailscale) |
| `CLOUD_AGENT_VPS_DEPLOY_SCRIPT` | Environment Variable | `/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh` |
| `CLOUD_AGENT_HEALTH_URL` | Environment Variable | `https://app.synqdrive.eu/api/v1/health` |

---

## Tests

```bash
cd backend && npm test
cd frontend && npm test
```

## Architecture rules

- Preserve multi-tenant org scoping — no hardcoded org/vehicle IDs.
- DIMO Segments are canonical trip boundaries; use DIMO MCP for DIMO work.
- Figma is visual source of truth; codebase is functional source of truth.
- AI Upload: never auto-apply unconfirmed extraction results.
