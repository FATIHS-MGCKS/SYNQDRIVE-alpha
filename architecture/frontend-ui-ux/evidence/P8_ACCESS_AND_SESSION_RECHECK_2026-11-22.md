# P8 — VPS access and authenticated session recheck

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_FEUX_P8_EXISTING_VPS_ACCESS_AND_AUTH_SESSION_RECHECK` |
| **Recheck at (UTC)** | `2026-11-22T18:59:55Z` |
| **Owner authorization** | `OWNER_VPS_READ_ONLY_AUTHORIZATION=GRANTED` (SSH/filesystem read) |
| **PR** | #2493 |

## Distinction (binding)

| Layer | Status | Notes |
|-------|--------|-------|
| **SSH / VPS read-only** | **AVAILABLE** | Does **not** imply logged-in SynqDrive user in browser |
| **HTTPS app origin** | **AVAILABLE** (unauthenticated) | SPA shells + health |
| **Clerk / JWT application session** | **NOT AVAILABLE** in agent context | Required for functional Master/Rental/Operator UI |

## Phase 1 — SSH verification

### Preflight script review

`bash .cursor/scripts/cloud-agent-ssh-preflight.sh` — **read-only**: prints host/user/key presence, runs **BatchMode** SSH auth test. **No** deploy, restart, or config mutations.

`bash .cursor/scripts/cloud-agent-verify-vps.sh` — DNS/TCP/SSH auth probe. **No** application login.

### Observed (this recheck)

| Check | Result |
|-------|--------|
| `CLOUD_AGENT_SSH_PREFLIGHT` | **PASS** |
| Principal | `synqdrive-admin@srv1374778.hstgr.cloud` |
| Remote user | `synqdrive-admin` |
| Host short name | `srv1374778` |
| Strict host key | known_hosts enforced (preflight uses common lib) |
| Active release symlink | `/opt/synqdrive/releases/20261111223933_v4994` |
| `git` HEAD on VPS | `1e6a267c8c7951e2a11633e89ab96714844ea846` |
| `index.html` readable | yes |
| Bundled assets | `index-Cn8n4pFR.js`, `index-DmctIvoe.css` |

**Conclusion:** P7 VPS conclusions **reconfirmed**. P8 `AUTHENTICATED_ACCESS=BLOCKED` was **never** a denial of SSH — it referred to **browser application session** only.

## Phase 2 — UI test capability inventory

| Option | Exists? | Production-safe without new login? | Verdict |
|--------|---------|-----------------------------------|---------|
| Pre-authenticated browser tab in Cloud Agent | **No** | n/a | Not present |
| Cursor secret/env for FEUX-approved session artifact | **No** | n/a | Injected env: SSH secrets only (`CLOUD_AGENT_*`); no `CLERK_*`, no `FEUX_*`, no session file path |
| Playwright under `frontend/e2e/` | **Yes** | **No** for prod UI audit | `baseURL: http://127.0.0.1:5173`; local dev server + **route mocks** (e.g. `operator-fixtures.ts` synthetic tokens) |
| Operator production smoke runbook | **Yes** | **No** without owner JWT | `docs/runbooks/operator-production-smoke.md` — write smoke needs Clerk JWT; read-only curl checks are unauthenticated |
| VO5C operator session files | **Yes** (repo tooling) | **No** for UI audit | Deploy/operator session scope — **not** FEUX read-only UI audit; no session file mounted in agent |

**No** cookies, tokens, or session files were read from VPS disks, databases, PM2 memory, or logs.

## Phase 3 — Authenticated functional test

**Not executed** — prerequisite **explicitly approved application session** still missing. Prior matrix rows remain **BLOCKED** (not upgraded to PASS).

## Phase 4 — Root cause (precise)

```
ROOT_CAUSE=P8_SSH_AVAILABLE_AND_APP_BROWSER_SESSION_NOT_PROVISIONED_FOR_FEUX_AUDIT
```

| Factor | Detail |
|--------|--------|
| SSH | Available and authorized for read-only ops |
| Browser | No pre-opened, owner-labeled session for this operation |
| Identity | No approved test persona / role class bound to agent runtime |
| Framework | Playwright exists for **local mocked E2E**, not authorized prod read-only UI pass |
| Handoff | No documented `FEUX-*` session transfer mechanism in Cursor agent env |

### Minimal owner next step (no secrets in chat)

1. Create or designate an **isolated read-only smoke tenant** (Master + Rental + Operator scopes as needed) per existing smoke runbook patterns — synthetic data only.
2. In Cursor Cloud Agent **Secrets**, add only what policy allows, e.g.:
   - `FEUX_PROD_UI_AUDIT_AUTHORIZED=1` (env flag naming the scope), and
   - either a **short-lived Playwright `storageState` JSON** as Runtime Secret **or** scoped Clerk test credentials **explicitly labeled for read-only FEUX audit** (not shared deploy keys).
3. Re-run P8 with instruction: *use provisioned session only; navigation + read surfaces; no writes.*

Alternative: owner executes a **sanitized screen walkthrough** locally and attaches evidence IDs — agent updates authorities from owner-supplied observations (no credential transfer).

## Phase 5 — Evidence IDs

| ID | Claim |
|----|-------|
| `FEUX-EVID-P8-ACCESS-RECHECK-001` | SSH + VPS artifact recheck separates from auth session gap |
| `FEUX-EVID-P8-AUTH-GATE-001` | Application session still blocked (refined rationale) |