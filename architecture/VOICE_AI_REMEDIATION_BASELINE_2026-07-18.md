# SynqDrive Voice AI Remediation Baseline

| Field | Value |
|-------|-------|
| **Phase** | Prompt 1A of 20 — Remediation baseline (read-only) |
| **Date** | 2026-07-18 (UTC) |
| **Method** | Repo/git read-only, VPS runtime read-only, DB aggregates, provider REST (ElevenLabs MCP unavailable; Twilio Docs MCP docs-only), automated tests |
| **Baseline anchor** | Post-deployment audit commit `8c59a504` |
| **Repository HEAD** | `8c59a504` (`docs(voice): add post-deployment acceptance audit`) |
| **VPS running commit** | `ac856881` (`merge(document-intake): integrate Document Intake V2 stack into main`) |
| **VPS release** | `20260718004214_v4994` |

> **No product files changed. No remediation implemented in this prompt.**

---

## 1. Executive Summary

**Baseline decision: REMEDIATION REQUIRED — production Voice AI remains NO-GO.**

Since the post-deployment acceptance audit (`8c59a504`), **no voice product code, migrations, or VPS deployment have changed**. The only repository commit after the audit is the audit document itself. Runtime production state is **unchanged** from the prior audit: voice stack is deployed but **disabled**, with **zero** provider resources and **zero** operational conversations.

**Improvements since prior audit (tooling only):**

- Cloud Agent workspace: `npx prisma generate` restores **reproducible backend build** and **full voice security suite** (12/12 suites, 49 tests, including MCP security).

**Unchanged blockers:**

- No native integration, MCP, or webhook ingestion enabled on VPS.
- No ElevenLabs agents or Twilio numbers; no `VoiceSubscription` rows.
- One `DRAFT` `VoiceAssistant` without subscription.
- Entitlement gaps: no `addon.voice_agent` HTTP guard; agent deploy lacks subscription gate; MCP requires `ACTIVE` only while outbound allows `TRIAL`/`PAST_DUE`.
- VPS deployment **lags** `origin/main` by one docs-only commit.

---

## 2. Scope and Method

### References read

| Document | Path | Status |
|----------|------|--------|
| Runtime baseline | `architecture/VOICE_AI_RUNTIME_BASELINE_2026-07-17.md` | Read |
| Production ADR | `architecture/VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` | Read |
| Post-deployment audit | `architecture/VOICE_AI_POST_DEPLOYMENT_ACCEPTANCE_AUDIT_2026-07-18.md` | Read |
| Production readiness | `architecture/VOICE_AI_PRODUCTION_READINESS_REPORT_2026-07-17.md` | Read |
| Security / observability | `architecture/VOICE_AI_SECURITY_OBSERVABILITY_2026-07-17.md` | Read |
| E2E matrix | `docs/testing/voice-ai-e2e-test-matrix.md` | Read |
| Release runbook | `docs/runbooks/voice-ai-production-release.md` | Read |
| Incidents runbook | `docs/runbooks/voice-incidents.md` | Referenced |

**Deviation:** Two untracked architecture drafts exist locally (`VOICE_AI_TWILIO_TENANT_CLIENT_FACTORY_2026-07-17.md`, `VOICE_AI_USAGE_EVENT_AUDIT_MODELS_2026-07-17.md`) — not on `main`, not deployed.

### Provider MCP

| Server | Status | Used for |
|--------|--------|----------|
| ElevenLabs MCP | **error** | Not used; REST read-only via VPS env |
| Twilio Docs MCP | **ready** | Documentation reference only (no account API) |
| Twilio REST (IE1 Dublin) | **used** | Parent account, numbers, subaccounts |

### Redaction

All phone numbers, secrets, full SIDs, transcripts, and customer payloads redacted or aggregated.

---

## 3. Git and Deployment Identity

| Check | Value |
|-------|-------|
| Local branch | `main` |
| Local commit | `8c59a504` |
| `origin/main` | `8c59a504` |
| Remote tracking | `origin/main` |
| VPS checkout commit | `ac856881` |
| Last VPS release dir | `20260718004214_v4994` |
| Last deployment time (artifact) | Backend `dist/main.js` built ~2026-07-18 00:45 UTC |
| Last deployment status | **SUCCESS** (PM2 online, health 200) |
| Local dirty state | 2 untracked arch drafts (non-voice-product) |
| VPS dirty state | `?? backend/uploads` |

### Voice commits since `8c59a504`

**None.** `git log 8c59a504..HEAD` on product paths is empty. The only commit after the audit is `8c59a504` itself.

### Comparison matrix

| Comparison | Status | Notes |
|------------|--------|-------|
| Repository vs `origin/main` | **MATCH** | `8c59a504` |
| VPS checkout vs `origin/main` | **MISMATCH** | VPS `ac856881` < main `8c59a504` (docs-only delta) |
| Backend build vs VPS checkout | **MATCH** | VPS serves `ac856881` backend artifact |
| Frontend build vs VPS checkout | **MATCH** | VPS `index-CoR4omeT.js` from release `20260718004214` |
| Local backend build vs VPS deployment build | **NOT VERIFIED** byte-identical | Local rebuild after `prisma generate` not deployed |

---

## 4. Changes Since Post-Deployment Audit

| Commit | Paths | Functional impact | Audit validity |
|--------|-------|-------------------|----------------|
| `8c59a504` | `architecture/VOICE_AI_POST_DEPLOYMENT_ACCEPTANCE_AUDIT_2026-07-18.md` | Documentation only | N/A — is the audit |
| *(none)* | Backend, frontend, prisma, VPS env | — | **Post-deployment audit findings remain valid** |

No changes detected in: Voice Assistant, Twilio, ElevenLabs, MCP Gateway, orchestration, billing, protection, provisioning, feature flags, lifecycle, webhooks, org UI, master admin UI, migrations, tests, deployment config, or runbooks (beyond the audit file).

---

## 5. Runtime State

| Service | Status | Uptime (probe) | Commit | Last success | Last disturbance | Method |
|---------|--------|----------------|--------|--------------|------------------|--------|
| Backend PM2 `synqdrive` | online | ~2276s | `ac856881` | `GET /api/v1/health` 200 | 00:10 UTC crash loop (DI + webhook secret) — **resolved** | PM2 + curl |
| Frontend static | serving | same release | `index-CoR4omeT.js` | Bundle contains Control Plane | — | VPS file check |
| Voice BullMQ worker | embedded | — | — | Redis queue keys present | — | Redis `bull:voice.webhook.process:*` |
| Redis | PONG | — | — | queue wait/failed = 0 | — | `redis-cli` |
| PostgreSQL | reachable | — | — | Prisma queries OK | — | VPS Prisma |
| Reverse proxy | ok | — | — | Public health 200 | 502 during 00:10 deploy | curl |
| Twilio voice webhook | reachable | — | — | Unsigned POST → 401 | — | curl |
| MCP gateway | reachable, **disabled** | — | — | JSON-RPC “not enabled” | — | curl |
| ElevenLabs API | reachable | — | — | HTTP 200 | — | REST |
| Twilio API (IE1) | reachable | — | — | Trial account active | US endpoint 401 | REST Dublin |

**Last successful voice activity:** **NOT PRESENT** — zero conversations, webhooks, usage events, tool executions.

**Voice errors (24h, redacted):** ElevenLabsProviderHttpClient DI failures and missing `ELEVENLABS_WEBHOOK_SECRET` at 00:10 UTC on prior release; no errors after current stable boot.

---

## 6. Feature Flag State

VPS `backend.env` — presence and effective state (no secret values):

| Variable | VPS | Effective |
|----------|-----|-----------|
| `VOICE_CONTROL_PLANE_V2` | absent | **NOT PRESENT** in codebase |
| `VOICE_NATIVE_TWILIO_INTEGRATION` | absent | **false** |
| `VOICE_AI_NATIVE_TELEPHONY` | absent | **false** (legacy alias) |
| `VOICE_MCP_GATEWAY` | absent | **false** |
| `VOICE_AI_MCP_GATEWAY_ENABLED` | absent | **false** |
| `VOICE_WEBHOOK_INGESTION_ENABLED` | **false** | ingestion off |
| `VOICE_USAGE_ENFORCEMENT` | absent | **NOT PRESENT** in codebase |
| `VOICE_UI_V2` | absent | **NOT PRESENT** in codebase |
| `VOICE_OUTBOUND_AUTOMATIONS` | absent | **NOT PRESENT** in codebase |
| `VOICE_LEGACY_DIAGNOSTIC_CALLS` | absent | **false** |
| `VOICE_AI_PROVISIONING_STAGING_ENABLED` | absent | **false** |
| `VOICE_AI_SUBACCOUNTS` | absent | **false** |
| `VOICE_E2E_ALLOW_LIVE_CALLS` | absent | **false** |
| `TWILIO_REGION` | **ie1** | consistent |
| `TWILIO_EDGE` | **dublin** | consistent |
| `ELEVENLABS_WEBHOOK_SECRET` | **absent** | missing |
| `VOICE_MCP_TOKEN_SECRET` | **absent** | missing |
| `TWILIO_VOICE_WEBHOOK_BASE_URL` | set | present |
| `APP_URL` | set | present |

**Global vs tenant:** Environment flags are **global kill-switches / capability gates**. Per-tenant state is carried by `VoiceSubscription`, `VoiceAssistant.status`, provisioning jobs, and provider account rows — **no separate `voice_rollout` table**.

---

## 7. Database State

### Aggregated counts (production VPS)

| Table | Count |
|-------|------:|
| `voice_assistants` | 1 |
| `voice_subscriptions` | 0 |
| `voice_provider_accounts` | 0 |
| `voice_phone_numbers` | 0 |
| `voice_agent_deployments` | 0 |
| `voice_provisioning_jobs` | 0 |
| `voice_conversations` | 0 |
| `voice_provider_webhook_events` | 0 |
| `voice_usage_events` | 0 |
| `voice_billing_periods` | 0 |
| `voice_budget_policies` | 0 |
| `voice_tool_executions` | 0 |
| `voice_approval_requests` | 0 |
| `voice_test_runs` | 0 |

### Status distribution

| Entity | Distribution |
|--------|--------------|
| `VoiceAssistant` | 1 × `DRAFT` |

### Integrity checks

| Check | Count | Risk |
|-------|------:|------|
| Assistant without `VoiceSubscription` | 1 | **CONFIRMED** — org has assistant, no subscription |
| Multiple active deployments per org | 0 | OK |
| Orphan phone (no provider account) | 0 | OK |
| Conversation without provider correlation | 0 | N/A (no rows) |
| Usage event without conversation | 0 | N/A |
| Multiple provider accounts per org/provider | 0 | OK |

**Cross-tenant:** No multi-tenant data rows to inspect; isolation tests pass in CI (see §12).

---

## 8. Twilio State

| Check | Result | Evidence |
|-------|--------|----------|
| Parent account (IE1) | **CONFIRMED** active Trial | REST `api.dublin.ie1.twilio.com` |
| Subaccounts | **0** | REST + DB |
| Phone numbers | **0** | REST + DB |
| Org mapping in DB | **0** `voice_provider_accounts` | Prisma |
| Region / edge | **ie1 / dublin** | VPS env |
| Voice URLs / callbacks | **NOT PRESENT** | No numbers |
| SIP domains | **NOT VERIFIED** | Not queried |
| Parent resources reaching tenant routes | **LIKELY safe** | Tenant client factory subaccount-scoped when provisioned; currently nothing provisioned |
| Credential type | API Key (not auth token for REST SDK) | `.env.example` pattern |

**Note:** US-region Twilio REST returned 401 for account fetch; IE1 Dublin endpoint succeeded — consistent with regional client architecture.

---

## 9. ElevenLabs State

| Check | Result | Evidence |
|-------|--------|----------|
| Workspace reachable | **CONFIRMED** | HTTP 200 `/v1/user` |
| Agents | **0** | REST `/v1/convai/agents` |
| Imported phone numbers | **0** | REST `/v1/convai/phone-numbers` |
| Org mapping in DB | **0** deployments; assistant `elevenLabsAgentId` null | Prisma |
| MCP on agents | **NOT APPLICABLE** | No agents |
| Post-call webhooks (SynqDrive) | **NOT CONFIGURED** | Secret absent; ingestion false |
| Recent conversations | **NOT PRESENT** | DB + API |
| Agents without org mapping | **NOT PRESENT** | No agents |

ElevenLabs MCP server status: **error** — REST used instead.

---

## 10. Entitlement Enforcement

Code inspection + test evidence. Status reflects **implemented guards**, not production usage (no subscriptions exist).

| Action | Subscription required? | Statuses honored | Verdict |
|--------|---------------------|------------------|---------|
| Outbound native call | **Yes** | TRIAL, ACTIVE, PAST_DUE via `assertSubscriptionOperational` | **PARTIAL** — enforced on outbound/budget path |
| Assistant activation | **Yes** | TRIAL, ACTIVE, PAST_DUE | **PARTIAL** — `assertActivationAllowed` |
| MCP tool execution | **Yes** | **ACTIVE only** (stricter) | **PARTIAL** — `voice-mcp-tools.service.ts:73-77` |
| Agent deploy (versioned) | **No** | Staging flag + readiness only | **FAIL** — no subscription check in `AgentDeploymentService` |
| Twilio subaccount provision | **Partial** | ACTIVE unlocks; else `trialRestricted` | **PARTIAL** — `twilio-tenant-provisioning.service.ts:590-604` |
| Number purchase | Gated by staging + confirm + subaccount flags | — | **PARTIAL** — blocked when flags off |
| Legacy diagnostic outbound | Admin role + legacy flag + protection | — | **PASS** (gated; off in prod) |
| Billing addon `addon.voice_agent` on HTTP routes | **No** | — | **FAIL** — not on `VoiceAssistantController` |
| Voice automation outbound | **NOT PRESENT** | No dedicated voice-call workflow hook found | **NOT VERIFIED** |

**Trial / Active / Past Due / Suspended / Cancelled:** `VoiceSubscriptionService` defines `USABLE_STATUSES = [TRIAL, ACTIVE, PAST_DUE]`; suspend/cancel block operational paths. **CONFIRMED** in code; **NOT VERIFIED** in production data (zero subscriptions).

---

## 11. Tenant Rollout and Canary State

| Question | Answer | Evidence |
|----------|--------|----------|
| Global env flags as kill-switches? | **LIKELY yes** | Default false when absent; enable capability platform-wide |
| Persistent per-org rollout record? | **NOT PRESENT** as dedicated model | Uses subscription + assistant + jobs |
| Inbound/outbound same prerequisites? | **PARTIAL** | Both need native flag; inbound uses `evaluateInboundReadiness`, outbound adds policy + subscription + budget |
| Accidental all-org enablement? | **RISK if flags set globally** | No per-org env; org still needs subscription, readiness, numbers, deployment |
| Legacy diagnostic in production? | **DISABLED** | `VOICE_LEGACY_DIAGNOSTIC_CALLS` absent → false |
| Canary evidence | **NOT PRESENT** | Readiness report still PENDING |

---

## 12. Build and Test State

Commands run in Cloud Agent workspace at `8c59a504` after `npx prisma generate`.

| Command | Status | Errors | Cause | Known? |
|---------|--------|--------|-------|--------|
| `npx prisma generate` | **PASS** | 0 | — | Prerequisite for build |
| `npm run build` (backend) | **PASS** | 0 | — | **RESOLVED** vs prior audit |
| `npm run build` (frontend) | **PASS** | 0 | — | — |
| `npm run test:voice:security` | **PASS** | 0 | 12 suites, 49 tests | **RESOLVED** (incl. MCP security) |
| `npm run test:voice:staging-e2e` | **PASS** | 0 | 39 tests | — |
| `npm test -- voice-billing voice-protection orchestration provisioning mcp-write webhook-pipeline` | **PASS** | 0 | 54 tests | — |
| `npm test -- src/master/components/voice-control-plane` | **PASS** | 0 | 5 tests | — |
| `npm run test:voice:e2e` (Playwright) | **PASS** | 0 | 4 tests mocked | — |
| `npx prisma validate` | **PASS** | 0 | 1 schema warning | Known |
| `npx prisma migrate status` (local) | **NOT RUN** | — | No local Postgres | Expected in Cloud Agent |
| `npx prisma migrate status` (VPS) | **PASS** | 0 pending | 216 migrations | — |
| `npm run audit:voice-secrets` | **PASS** | 0 | — | — |
| `npx eslint` voice backend globs | **FAIL** | 1 | `no-control-regex` in `voice-mcp-input-sanitizer.util.ts` | **NEW** lint finding |
| `npx eslint` voice frontend paths | **FAIL** | 7 errors, 1 warning | `react-hooks/set-state-in-effect` etc. | **NEW** lint finding |
| Frontend `npm run lint` (package.json scope) | **NOT RUN** | — | Script excludes voice paths | By design |

**Local build vs deployment build:** **NOT VERIFIED** identical artifact; VPS build at `ac856881` is production truth.

---

## 13. Migration State

| Check | Status | Evidence |
|-------|--------|----------|
| Schema vs DB (VPS) | **MATCH** | `Database schema is up to date` |
| New voice migrations since audit | **NOT PRESENT** | Same 13 voice-related migrations |
| `20260717200000_voice_conversation_pending_outcome` anomaly | **CONFIRMED** | Two rows: one `rolled_back=true, finished=false`; one `finished=true` |
| Failed/incomplete migrations | **NOT PRESENT** beyond rolled-back duplicate row | VPS migrate status clean |

**Assessment:** Rolled-back duplicate is historical artifact from enum split fix (PR #489); schema is current. Recommend DBA hygiene review (P2), not blocking if migrate status clean.

---

## 14. Resolved Findings

| Prior ID | Topic | Status | Evidence |
|----------|-------|--------|----------|
| F-007 (post-deploy audit) | Backend build / MCP security compile failure | **RESOLVED** | `prisma generate` + build PASS; `voice-mcp-gateway.security.spec.ts` runs |
| Deploy crash (ElevenLabs DI) | PM2 crash on boot | **RESOLVED** | PR #493 in `ac856881`; health 200 |
| Webhook secret boot crash | Startup throw | **MITIGATED** | `VOICE_WEBHOOK_INGESTION_ENABLED=false` on VPS |

---

## 15. Remaining P0 Findings

### RB-P0-001 — No operational Voice AI in production
- **Verification:** CONFIRMED
- **Area:** Runtime
- **Description:** Zero agents, numbers, conversations, subscriptions; one DRAFT assistant.
- **Production impact:** Product non-functional for Voice AI.
- **Cause:** No canary/provisioning executed; flags off.
- **Code:** Orchestration readiness blockers
- **Runtime:** DB + provider API counts
- **Tests:** N/A
- **Remediation:** Staging org provisioning per release runbook
- **Dependencies:** Ops, secrets, flags

### RB-P0-002 — Native integration disabled globally
- **Verification:** CONFIRMED
- **Area:** Configuration
- **Description:** All native/MCP/staging flags absent or false on VPS.
- **Production impact:** No PSTN→AI path possible.
- **Cause:** Intentional pre-canary defaults.
- **Code:** `voice-feature-flags.config.ts`
- **Runtime:** VPS env audit
- **Remediation:** Per-org enablement after staging validation
- **Dependencies:** RB-P0-001

### RB-P0-003 — Webhook ingestion not production-ready
- **Verification:** CONFIRMED
- **Area:** Webhooks
- **Description:** `ELEVENLABS_WEBHOOK_SECRET` absent; ingestion false.
- **Production impact:** No post-call lifecycle or billing finalization.
- **Code:** `voice-secrets-startup.service.ts`, `voice-webhook-ingestion.config.ts`
- **Runtime:** Env presence audit
- **Remediation:** Configure secret; enable ingestion on staging host first

### RB-P0-004 — No evidenced inbound/outbound AI calls
- **Verification:** CONFIRMED (absence)
- **Area:** Call reality
- **Description:** No correlated CallSid + EL conversation in DB.
- **Production impact:** ADR §9 unmet.
- **Runtime:** `voice_conversations = 0`
- **Remediation:** Manual staging calls per E2E matrix §4

---

## 16. Remaining P1 Findings

### RB-P1-001 — Billing addon not enforced on voice HTTP routes
- **Verification:** CONFIRMED
- **Area:** Entitlements
- **Description:** `VoiceAssistantController` has OrgScoping + Roles only; no `addon.voice_agent` guard.
- **Code:** `voice-assistant.controller.ts`; `entitlement-resolver.service.ts` defines addon only in billing domain
- **Remediation:** Add entitlement guard to voice routes

### RB-P1-002 — Agent deploy lacks subscription gate
- **Verification:** CONFIRMED
- **Area:** Entitlements
- **Description:** `AgentDeploymentService` checks staging flag + readiness, not `VoiceSubscription`.
- **Code:** `agent-deployment.service.ts` `assertStagingEnabled()` only
- **Remediation:** Require operational subscription before deploy

### RB-P1-003 — MCP subscription stricter than outbound (inconsistent)
- **Verification:** CONFIRMED
- **Area:** Entitlements
- **Description:** MCP allows ACTIVE only; outbound allows TRIAL/PAST_DUE.
- **Code:** `voice-mcp-tools.service.ts` vs `voice-budget-enforcement.service.ts`
- **Remediation:** Align policy explicitly in remediation phase

### RB-P1-004 — MCP gateway disabled in production
- **Verification:** CONFIRMED
- **Area:** MCP
- **Runtime:** Public probe returns disabled JSON-RPC
- **Remediation:** Enable with `VOICE_MCP_TOKEN_SECRET` for canary org

### RB-P1-005 — Canary / live-call evidence missing
- **Verification:** CONFIRMED
- **Area:** Release process
- **Description:** Readiness report §4/§7 still PENDING.
- **Remediation:** Execute `voice-ai-production-release.md` phases 0–1

### RB-P1-006 — VPS deployment behind origin/main
- **Verification:** CONFIRMED
- **Area:** Deployment
- **Description:** VPS `ac856881` vs main `8c59a504` (docs-only).
- **Impact:** Audit doc not on VPS; no product delta.
- **Remediation:** Deploy when next product release occurs

### RB-P1-007 — Assistant without subscription in DB
- **Verification:** CONFIRMED
- **Area:** Data integrity
- **Runtime:** 1 assistant, 0 subscriptions
- **Remediation:** Create subscription or remove orphan assistant during staging setup

---

## 17. Remaining P2 Findings

### RB-P2-001 — Legacy Say TwiML still in deployed binary
- **Verification:** CONFIRMED
- **Area:** Legacy
- **Code:** `twilio-voice-twiml.util.ts`
- **Assessment:** SAFE while flags off and no numbers
- **Remediation:** Remove per ADR after 14-day native canary

### RB-P2-002 — Migration duplicate row for pending_outcome
- **Verification:** CONFIRMED
- **Area:** Database
- **Runtime:** `_prisma_migrations` rolled_back + finished rows
- **Remediation:** DBA cleanup / documentation

### RB-P2-003 — No `VOICE_USAGE_ENFORCEMENT` implementation
- **Verification:** NOT PRESENT
- **Area:** Feature flags
- **Description:** Flag referenced in audit prompt only; not in codebase
- **Remediation:** Implement or document alias to subscription enforcement

### RB-P2-004 — Live observability not verified
- **Verification:** NOT VERIFIED
- **Area:** Observability
- **Description:** `/api/v1/metrics` returns 401 without auth
- **Remediation:** Ops verify scrape + Grafana import

### RB-P2-005 — Global flag blast radius
- **Verification:** LIKELY
- **Area:** Rollout
- **Description:** Setting native/MCP flags true enables platform-wide capability; org gates are subscription/readiness not per-org env.
- **Remediation:** Add per-org rollout record or master-admin toggle before broad enablement

---

## 18. Remaining P3 Findings

### RB-P3-001 — Frontend voice ESLint violations
- **Verification:** CONFIRMED
- **Tests:** 7 errors, 1 warning on voice-assistant + control-plane paths
- **Remediation:** Fix in UI remediation phase

### RB-P3-002 — Backend voice ESLint violation
- **Verification:** CONFIRMED
- **Code:** `voice-mcp-input-sanitizer.util.ts` control-regex rule
- **Remediation:** Lint fix or justified disable

### RB-P3-003 — Untracked architecture drafts in workspace
- **Verification:** CONFIRMED
- **Files:** Twilio tenant factory, usage event audit drafts
- **Remediation:** Commit or delete in separate docs task

### RB-P3-004 — Org UI browser acceptance not performed
- **Verification:** NOT VERIFIED
- **Remediation:** Manual QA on staging tenant

---

## 19. Preconditions for UI Remediation

1. Staging org with mock/fixture APIs validated against real backend contracts.
2. Voice subscription + plan selection flow wired before wizard step 1 enforcement.
3. DE/EN copy deck frozen for wizard + ops nav (per ADR §4.7).
4. ESLint violations in `voice-assistant/**` resolved or baselined.
5. Control plane Playwright fixtures remain source for master admin; rental wizard needs staging E2E harness.
6. No production browser QA until RB-P0 staging org exists.

---

## 20. Preconditions for Staging Provisioning

1. `VOICE_AI_PROVISIONING_STAGING_ENABLED=true` on staging host only.
2. `VOICE_NATIVE_TWILIO_INTEGRATION=true` and `VOICE_MCP_GATEWAY=true` on staging host.
3. `ELEVENLABS_WEBHOOK_SECRET` + `VOICE_WEBHOOK_INGESTION_ENABLED=true` on staging host.
4. `VOICE_MCP_TOKEN_SECRET` dedicated secret on staging host.
5. `VOICE_E2E_ORG_ID` dedicated org; `VOICE_E2E_FORBIDDEN_ORG_IDS` set.
6. Create `VoiceSubscription` (ACTIVE or TRIAL) for staging org.
7. RB-P1-002 fixed or waived with explicit master-admin override policy for staging only.
8. Twilio IE1 subaccount provision for staging org.
9. ElevenLabs agent + number import for staging org.
10. Preflight: `bash backend/scripts/ops/voice-staging-preflight.sh`.

---

## 21. Required Remediation Order

1. **Tooling baseline:** Ensure CI runs `prisma generate` before build/test (lock in RESOLVED build state).
2. **Entitlements:** HTTP `addon.voice_agent` guard + agent-deploy subscription gate + align MCP/outbound subscription policy.
3. **Secrets (staging host):** `ELEVENLABS_WEBHOOK_SECRET`, `VOICE_MCP_TOKEN_SECRET`.
4. **Staging flags:** Enable provisioning, native integration, MCP, webhook ingestion on staging VPS only.
5. **Data:** Create staging `VoiceSubscription`; fix assistant-without-subscription orphan.
6. **Provision:** Subaccount → number → EL agent import → deployment.
7. **Validate:** Manual live calls (allowlist); verify conversation correlation + usage ledger.
8. **Canary 0/1:** Per release runbook; monitor metrics.
9. **Lint:** Voice frontend/backend ESLint cleanup.
10. **Legacy removal:** Only after ADR removal criteria met.
11. **Deploy:** Push docs + product fixes; align VPS with `main`.
12. **DB hygiene:** Review duplicate migration row.

---

## 22. Evidence Index

| ID | Type | Source |
|----|------|--------|
| E-01 | Git | `git rev-parse HEAD`, VPS `git rev-parse` |
| E-02 | Diff | `git log 8c59a504..HEAD`, `git diff 8c59a504..HEAD --stat` |
| E-03 | Health | `curl https://app.synqdrive.eu/api/v1/health` |
| E-04 | VPS DB | Prisma aggregate script on VPS |
| E-05 | VPS env | `grep ^VOICE_ /opt/synqdrive/shared/backend.env` |
| E-06 | Migrations | VPS `prisma migrate status`; `_prisma_migrations` query |
| E-07 | Twilio | IE1 REST account/numbers/subaccounts |
| E-08 | ElevenLabs | REST agents/phone-numbers |
| E-09 | Tests | `npm run test:voice:security` etc. |
| E-10 | Build | `npm run build` backend/frontend |
| E-11 | Code entitlements | `voice-budget-enforcement.service.ts`, `voice-mcp-tools.service.ts`, `agent-deployment.service.ts` |
| E-12 | Code flags | `voice-feature-flags.config.ts` |
| E-13 | Prior audit | `VOICE_AI_POST_DEPLOYMENT_ACCEPTANCE_AUDIT_2026-07-18.md` |
| E-14 | ADR | `VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` |
| E-15 | PM2 logs | `/root/.pm2/logs/synqdrive-error.log` (redacted) |

---

## 23. Final Baseline Decision

**REMEDIATION REQUIRED — remain NO-GO for production Voice AI rollout.**

The merged implementation is **code-complete enough to begin phased remediation**, but production runtime is **unchanged** since the post-deployment audit. Repository tooling blockers (build/security compile) are **resolved** in a fresh workspace with `prisma generate`. All P0 runtime blockers from the prior audit **remain open**.

**Next phase (1B+):** Execute §21 remediation order starting with entitlement hardening and staging-host provisioning — not broad production enablement.

---

*End of remediation baseline — documentation only.*
