# SynqDrive Voice AI Post-Deployment Acceptance Audit

| Field | Value |
|-------|-------|
| **Audit date** | 2026-07-18 (UTC) |
| **Auditor** | Cursor Cloud Agent (read-only) |
| **Scope** | Post-deployment acceptance of merged Voice AI stack (Prompts 1–10B) vs production target (ADR 0B) |
| **Method** | Repo/git read-only, VPS runtime read-only, DB read-only, redacted logs, provider API read-only, automated test execution |
| **Production host** | `https://app.synqdrive.eu` |
| **VPS release** | `/opt/synqdrive/releases/20260718004214_v4994` |
| **Repo commit (audit)** | `ac856881` (`merge(document-intake): integrate Document Intake V2 stack into main`) |
| **Voice merge stack** | PRs #456, #458, #460, #489, #491, #493, #495 on `main` (ancestor of `ac856881`) |

> **No fixes, no deploys, no env changes, no live calls initiated during this audit.**

---

## 1. Executive Decision

**Final production decision: NO-GO**

The Voice AI platform code is merged and deployed, and the core application is healthy (`GET /api/v1/health` → 200). However, the **binding production target** from `VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` §9 is **not met** in live production:

- **No org** runs the native ElevenLabs–Twilio AI path (all voice feature flags absent/disabled on VPS).
- **Zero** ElevenLabs agents, **zero** Twilio numbers, **zero** subaccounts, **zero** conversations, **zero** provider accounts in production DB.
- **No evidenced** inbound or outbound productive AI call (CallSid ↔ Conversation correlation).
- **Webhook ingestion disabled** (`ELEVENLABS_WEBHOOK_SECRET` not configured; production default opt-in off).
- **MCP gateway disabled** in production runtime.
- Prior readiness report (`VOICE_AI_PRODUCTION_READINESS_REPORT_2026-07-17.md`) **NO-GO** remains valid; staging live-call and canary evidence still absent.

Implementation maturity in repository tests is **high**; **runtime production acceptance** is **not**.

---

## 2. Scope and Method

### In scope

- Git/deployment identity (repo, VPS, PM2)
- Runtime health (backend, frontend static bundle, Redis, Postgres, nginx)
- Feature flags and non-secret env presence on VPS
- Legacy TwiML / Say path isolation (code + runtime gates)
- Twilio tenant model (code + provider API + DB)
- ElevenLabs deployment reality (code + provider API + DB)
- Inbound/outbound call reality (existing data only — **no new live calls**)
- MCP gateway (code tests + public probe)
- Conversation lifecycle (code + DB)
- Webhooks/queue (code + Redis + logs)
- Plans/billing/protection (code + tests)
- Org UI / Master control plane (code + Playwright mocked E2E)
- Security/privacy/observability (code + tests + partial runtime)
- Automated test matrix from `docs/testing/voice-ai-e2e-test-matrix.md`

### Out of scope / not performed

- Legal/compliance sign-off (GDPR DPA, etc.) — flagged separately where relevant
- Grafana dashboard live verification (metrics endpoint auth-blocked)
- Browser manual UI walkthrough on production tenant (no safe operator session)
- New PSTN live calls (`VOICE_E2E_ALLOW_LIVE_CALLS` absent on VPS)
- Twilio/ElevenLabs MCP servers (not available in Cloud Agent; REST used instead)

### Redaction policy

Phone numbers, emails, full SIDs, secrets, transcripts, and customer payloads are **not** recorded. Organization IDs appear only as truncated hashes where needed for correlation.

---

## 3. Git and Deployment Identity

| Check | Result | Evidence |
|-------|--------|----------|
| Local branch | `main` | `git branch --show-current` |
| Local commit | `ac856881` | `git rev-parse HEAD` |
| `origin/main` | `ac856881` | `git rev-parse origin/main` |
| VPS checked-out commit | `ac856881` | `git -C /opt/synqdrive/current rev-parse HEAD` |
| Local dirty state | **CLEAN** (2 untracked arch docs only) | `git status --short` |
| VPS dirty state | **MINOR** (`?? backend/uploads`) | VPS `git status --short` |
| Backend running build commit | **MATCH** `ac856881` | VPS release symlink + `dist/main.js` mtime 2026-07-18 00:45 UTC |
| Frontend running build | **MATCH** release `20260718004214` | VPS `backend/public/assets/index-CoR4omeT.js` (Voice Control Plane string present) |
| Cloud-agent vs VPS backend artifact | **NOT VERIFIED** byte-identical | Local frontend build produced `index-2g0x3Q0K.js` (different hash — expected after local rebuild; VPS artifact is deploy truth) |

**Voice-relevant migrations on VPS** (`_prisma_migrations`, names containing `voice`):

| Migration | Applied (`finished_at`) |
|-----------|-------------------------|
| `20260620160000_voice_assistant_module` | 2026-06-26 |
| `20260620180000_voice_assistant_tool_permissions` | 2026-06-26 |
| `20260717190000_twilio_voice_telephony` | 2026-07-17 |
| `20260717200000_voice_conversation_pending_outcome` | 2026-07-17 |
| `20260717200001_voice_conversation_pending_default` | 2026-07-17 |
| `20260717210000_voice_control_plane_models` | 2026-07-17 |
| `20260717220000_voice_usage_event_audit_models` | 2026-07-17 |
| `20260717230000_voice_phone_regulatory_in_review` | 2026-07-17 |
| `20260717230000_voice_webhook_ingestion_correlation` | 2026-07-17 |
| `20260717240000_voice_phone_elevenlabs_import_assigned` | 2026-07-17 |
| `20260717250000_voice_agent_deployment_snapshot` | 2026-07-17 |
| `20260717280000_voice_plans_usage_ledger` | 2026-07-17 |
| `20260717290000_voice_budget_abuse_protection` | 2026-07-17 |

`npx prisma migrate status` on VPS: **Database schema is up to date** (216 migrations).

**Anomaly:** `_prisma_migrations` contains a duplicate row for `20260717200000_voice_conversation_pending_outcome` with `finished_at: null` alongside the applied row — investigate in remediation (not fixed in this audit).

**Deployment-identity verdict:** **MATCH** (expected commit `ac856881` is live on VPS).

---

## 4. Runtime Health

| Service | Status | Start / uptime | Version / commit | Last success | Last disturbance |
|---------|--------|----------------|------------------|--------------|------------------|
| Backend (`synqdrive` PM2) | **online** | ~398s at probe | `ac856881` | Health 200, Nest started 00:11 UTC | Crash loop 00:10 UTC (ElevenLabs DI + missing webhook secret) — resolved before audit window |
| Frontend (static via backend) | **serving** | same release | `index-CoR4omeT.js` | HTTP 200 on `/` via app | — |
| Voice worker | **embedded** in `synqdrive` | — | BullMQ processor in main process | Queue keys present | — |
| Redis | **PONG** | — | — | `bull:voice.webhook.process:*` meta keys | — |
| PostgreSQL | **reachable** | — | Prisma connected | Migrations up to date | — |
| Reverse proxy | **ok** | nginx | — | Public health 200 | 502 during 00:10 UTC deploy window |
| Public Twilio voice webhook | **reachable** | — | — | Unsigned POST → **401** | — |
| Public MCP gateway | **reachable** | — | — | POST without token → JSON-RPC disabled message (HTTP 200) | — |
| ElevenLabs API | **reachable** | — | — | HTTP 200 agents list | 0 agents |
| Twilio API (parent account) | **reachable** | — | IE1 config in env | 0 numbers, 0 subaccounts | — |

**Queue backlog (Redis):** `voice.webhook.process` wait=0, failed=0, delayed=0.

**Voice errors last 24h (redacted PM2 error log):** ElevenLabsProviderHttpClient DI crash (resolved in PR #493 deploy); `Voice AI production secrets missing: ELEVENLABS_WEBHOOK_SECRET` (mitigated by `VOICE_WEBHOOK_INGESTION_ENABLED=false` on VPS).

---

## 5. Feature Flags and Configuration

VPS `backend.env` — **presence / safe values only**:

| Variable | VPS state | Effective production behavior |
|----------|-----------|-------------------------------|
| `VOICE_CONTROL_PLANE_V2` | **absent** | NOT VERIFIED — no code reference found; likely doc alias |
| `VOICE_NATIVE_TWILIO_INTEGRATION` | **absent** | **false** (`voice-feature-flags.config.ts`) |
| `VOICE_AI_NATIVE_TELEPHONY` | **absent** | **false** (legacy alias) |
| `VOICE_MCP_GATEWAY` | **absent** | **false** |
| `VOICE_AI_MCP_GATEWAY_ENABLED` | **absent** | **false** |
| `VOICE_USAGE_ENFORCEMENT` | **absent** | NOT VERIFIED dedicated flag; no route guard found |
| `VOICE_UI_V2` | **absent** | NOT VERIFIED dedicated env flag |
| `VOICE_OUTBOUND_AUTOMATIONS` | **absent** | NOT VERIFIED |
| `VOICE_LEGACY_DIAGNOSTIC_CALLS` | **absent** | **false** |
| `VOICE_E2E_ALLOW_LIVE_CALLS` | **absent** | **false** (safe default) |
| `VOICE_AI_PROVISIONING_STAGING_ENABLED` | **absent** | **false** — blocks live provider mutations |
| `VOICE_AI_SUBACCOUNTS` | **absent** | **false** |
| `VOICE_WEBHOOK_INGESTION_ENABLED` | **set** (boolean, redacted) | Production opt-in; required with webhook secret when true |
| `TWILIO_REGION` | **ie1** | CONFIRMED |
| `TWILIO_EDGE` | **dublin** | CONFIRMED |
| `ELEVENLABS_API_KEY` | **set** | configured |
| `ELEVENLABS_WEBHOOK_SECRET` | **absent** | webhook ingestion cannot be safely enabled |
| `TWILIO_AUTH_TOKEN` | **set** | configured |

**Tenant-level flags:** No `voice_provider_accounts`, `voice_phone_numbers`, or active deployments in DB — **no tenant has native integration active**.

**Verdict:** Production voice stack is **deployed but disabled by configuration**; IE1/Dublin **PASS**; native integration **FAIL** (not enabled); legacy diagnostic **PASS** (disabled).

---

## 6. Legacy Path Isolation

### Code inventory

| Symbol / path | Callers | Public reachability | Guards |
|---------------|---------|---------------------|--------|
| `buildInboundVoiceTwiml` | `TwilioVoiceBridgeService` (no-assistant fallback) | Twilio webhook (public, signed) | Signature + assistant resolution |
| `buildOutboundVoiceTwiml` | `TwilioTelephonyService.initiateOutboundCall` | Tenant API → `initiateTwilioOutboundCall` | Org scope + `VOICE_LEGACY_DIAGNOSTIC_CALLS` + staging flag |
| `buildLegacyDiagnosticTwiml` | Bridge when `legacy_diagnostic` route | Same webhook | Requires `VOICE_LEGACY_DIAGNOSTIC_CALLS=true` |
| `twilio.calls.create` + Say | `TwilioTelephonyService` | Legacy outbound only | Gated in `VoiceAssistantService.initiateTwilioOutboundCall` |
| `pstnProvider` / `VoicePstnProvider` | Schema + telephony utils | Tenant config field | **Backward compatibility**; native path uses orchestration + EL import |
| `LEGACY_TWIML_SAY` metadata | Lifecycle util, conversation metadata | Analytics tagging | `productiveAiCall: false` in tests |

### Runtime assessment

| Criterion | Rating | Evidence |
|-----------|--------|----------|
| Productive AI call accidentally in `<Say>` path | **SAFE LEGACY COMPATIBILITY** (current prod) | Native flags off; 0 Twilio numbers; inbound readiness blockers; fallback Say only on misconfigured native route |
| Legacy path publicly reachable for customers | **NOT APPLICABLE** | No assigned PSTN numbers |
| Analytics contamination | **SAFE LEGACY COMPATIBILITY** | `isLegacyTwimlConversation` / metadata `productiveAiCall: false` in characterization tests |
| pstnProvider steers V2 runtime | **SAFE LEGACY COMPATIBILITY** | `VoiceCallOrchestrationService.evaluateInboundReadiness` drives route; pstnProvider is not sole switch |
| Old fields backward only | **PASS** | ADR §4.9; enum retained |

**Caveat:** If an operator enables `VOICE_LEGACY_DIAGNOSTIC_CALLS=true` and assigns a Twilio number to SynqDrive webhooks without native EL import, **Say diagnostic path becomes reachable** — mitigated by default false and staging gates.

---

## 7. Twilio Tenant Isolation

| Check | Status | Evidence |
|-------|--------|----------|
| One subaccount per active org | **NOT VERIFIED** (prod) | DB: `voice_provider_accounts` = 0; Twilio API subaccounts = 0 |
| Tenant routes avoid parent account | **PARTIAL** (code) | `TwilioTenantClientFactory` + org-scoped telephony; parent credentials still used when subaccount not provisioned |
| Cross-org number visibility | **PASS** (code) | `buildPhoneNumberList` scoped to org subaccount when configured (`voice-assistant.service.ts` ~1210) |
| Control-plane credentials in tenant APIs | **PASS** (code) | `secretRef` vault pattern; masked refs in control plane |
| Runtime credentials subaccount-scoped | **NOT VERIFIED** (prod) | No provisioned subaccounts |
| IE1 / Dublin | **PASS** | VPS env + `twilio.config.ts` |
| Phone inventory / regulatory / capabilities | **NOT VERIFIED** (prod) | 0 `voice_phone_numbers` |
| Cross-tenant tests | **PASS** (automated) | `voice-tenant-isolation.security.spec.ts`, `org-scoping.voice.characterization.spec.ts` |

**Provider reality:** Parent Twilio account active; **0** incoming numbers; **0** child accounts listed.

---

## 8. ElevenLabs Deployment Reality

| Check | Status | Evidence |
|-------|--------|----------|
| Agent deployment per org | **FAIL** (prod) | DB `voice_agent_deployments` = 0 |
| Active deployment version | **NOT APPLICABLE** | — |
| Config hash | **NOT APPLICABLE** | — |
| Agent status | **FAIL** (prod) | EL API: 0 agents |
| Voice / languages | **NOT VERIFIED** | No agent |
| Imported Twilio number | **FAIL** (prod) | EL API: 0 phone numbers |
| Number–agent assignment | **NOT APPLICABLE** | — |
| MCP connection on agent | **NOT VERIFIED** | No agent |
| Post-call webhooks | **FAIL** (prod) | `ELEVENLABS_WEBHOOK_SECRET` absent; ingestion disabled |
| Rollback capability | **PASS** (code) | Control plane rollback API + tests |

**Production DB assistant snapshot (redacted):** 1 row, `status=DRAFT`, `pstnProvider=ELEVENLABS`, `elevenLabsAgentId=null`, `telephonyEnabled=false`, `inboundEnabled=true`, `connectionStatus=CONNECTED`, org id `faa710c9-****`.

---

## 9. Inbound Call Reality

**Status: NOT VERIFIED**

| Required proof | Result |
|----------------|--------|
| Twilio Call SID | **NOT FOUND** — `voice_conversations` = 0 |
| ElevenLabs Conversation ID | **NOT FOUND** |
| Correlated `VoiceConversation` | **NOT FOUND** |
| Active agent | **NOT FOUND** |
| No legacy `<Say>` productive path | **NOT VERIFIED** — no calls |
| MCP tenant binding | **NOT VERIFIED** |
| Post-call processing | **NOT VERIFIED** |
| Usage event | **NOT FOUND** — `voice_usage_events` = 0 |

**Configuration path (design):** PSTN → org subaccount number → ElevenLabs native integration → agent → MCP gateway — **not active in production** (flags off, no numbers, no agent).

No suitable existing staging/production conversation record for redacted audit. **No live call initiated** (`VOICE_E2E_ALLOW_LIVE_CALLS` absent).

---

## 10. Outbound Call Reality

**Status: NOT VERIFIED**

| Required proof | Result |
|----------------|--------|
| Staging/test outbound record | **NOT FOUND** |
| ElevenLabs outbound API path | **NOT VERIFIED** (runtime) |
| No `twilio.calls.create` + Say productive path | **PASS** (config) | Native/staging flags off; legacy outbound gated |
| Idempotency / policy / usage | **PASS** (code tests) | `voice-call-orchestration.spec.ts`, `voice-protection.spec.ts` |

---

## 11. MCP Gateway

| Area | Status | Evidence |
|------|--------|----------|
| Authentication (short-lived token, nonce, replay) | **PASS** (code) | `VoiceMcpTokenService`, security specs (compile blocked — see §21) |
| Read tools (8) | **PASS** (code) | `voice-mcp-tools.registry.ts` |
| Controlled write tools (6) | **PASS** (code) | `voice-mcp-write-tools.service.ts`, `voice-mcp-write-actions.spec.ts` |
| Cross-tenant rejection | **PASS** (tests) | tenant isolation + gateway security specs |
| Production gateway enabled | **FAIL** | VPS flags off; public probe returns disabled JSON-RPC |
| Tool allowlist / scopes | **PASS** (code) | Token claims + `allowedTools` |

**Production probe:** `POST /api/v1/mcp/voice/{orgId}` without Bearer → `The SynqDrive voice MCP gateway is not enabled.` (HTTP 200 JSON-RPC envelope).

---

## 12. Conversation Lifecycle

**Implementation:** `VoiceConversationLifecycleState` enum matches ADR states (CREATED → … → FINALIZED/FAILED/CANCELLED); monotone rank in `voice-conversation-lifecycle-state.util.ts`.

| Check | Status | Evidence |
|-------|--------|----------|
| Outcome separate from lifecycle | **PASS** (code) | Prisma `status` + `outcome` + `lifecycleState` |
| Contradictory combinations | **NOT VERIFIED** (prod data) | 0 conversations |
| Backward transitions | **PASS** (code/tests) | `canAdvanceLifecycleState` |
| Duplicate conversations per call | **PASS** (code/tests) | Correlation + idempotency specs |
| Double-counted minutes | **PASS** (code/tests) | `voice-billing.spec.ts` dedup |
| Stuck PROCESSING >30min | **NOT VERIFIED** | No data |

---

## 13. Webhooks and Event Processing

| Control | Status | Evidence |
|---------|--------|----------|
| Twilio signature | **PASS** | Unsigned probe 401; `twilio-webhook.controller.characterization` |
| ElevenLabs signature | **PASS** (code) | `elevenlabs-signature.util.ts`, pipeline tests |
| Proxy URL reconstruction | **PASS** (code) | Twilio characterization tests |
| Payload limits | **PASS** (code) | `VOICE_WEBHOOK_MAX_PAYLOAD_BYTES` |
| Idempotency / external event ID | **PASS** (code/tests) | `VoiceProviderWebhookEvent` unique constraint |
| BullMQ retry / DLQ / replay | **PASS** (code/tests) | pipeline + resilience specs |
| Production ingestion active | **FAIL** | `VOICE_WEBHOOK_INGESTION_ENABLED` + missing EL webhook secret |
| PII redaction | **PASS** (code/tests) | redaction utils + privacy specs |

**Production:** `voice_provider_webhook_events` = 0; queue empty.

---

## 14. Voice Plans and Entitlements

| Plan field | Required | Code (`voice-plan-catalog.ts`) | Production |
|------------|----------|--------------------------------|------------|
| Start 49€ / 100 min / 0,35€ / 1 number / 149€ setup | ✓ | **PASS** | NOT APPLICABLE (no subscriptions) |
| Pro 119€ / 400 / 0,29€ / 2 branches / 2 concurrent / 249€ | ✓ | **PASS** | NOT APPLICABLE |
| Business 249€ / 1000 / 0,25€ / 2 numbers / 5 concurrent / 499€ | ✓ | **PASS** | NOT APPLICABLE |
| Central catalog | ✓ | **PASS** | — |
| Org add-on (not vehicle pricing) | ✓ | **PASS** | `voice-billing` module |
| Backend entitlement enforcement on voice routes | ✓ | **FAIL** | No `addon.voice_agent` guard on `VoiceAssistantController` |

---

## 15. Usage, Cost and Billing

| Check | Status | Evidence |
|-------|--------|----------|
| Usage ledger / dedup / grace | **PASS** (code/tests) | `voice-billing.spec.ts` |
| 0,12€ planning fallback | **PASS** | `VOICE_COST_FALLBACK_CENTS_PER_MINUTE = 12` |
| FINAL cost not overwritten by estimate | **PASS** (code/tests) | billing pricing util |
| Production usage rows | **NOT VERIFIED** | `voice_usage_events` = 0 |

---

## 16. Budget and Abuse Protection

| Check | Status | Evidence |
|-------|--------|----------|
| Server-side enforcement | **PASS** (code/tests) | `voice-protection.spec.ts`, Redis Lua concurrency |
| Frontend-only enforcement | **N/A** | Backend services used |
| Production policy rows | **NOT VERIFIED** | No active voice org |

---

## 17. Organization UI/UX

| Area | Status | Evidence |
|------|--------|----------|
| 8-step wizard | **PARTIAL** | `VoiceOnboardingWizard.tsx` exists; browser prod **NOT VERIFIED** |
| Ops navigation (5 areas) | **PARTIAL** | Code in `voice-assistant/`; prod **NOT VERIFIED** |
| Real APIs vs mocks | **PASS** (code) | API client wiring |
| DE/EN | **PARTIAL** | i18n files present; full coverage **NOT VERIFIED** |
| Playwright mocked E2E | **PASS** | 4/4 `voice-control-plane-flow.spec.ts` |
| Mobile / a11y | **NOT VERIFIED** | — |

---

## 18. Master Admin Control Plane

| Area | Status | Evidence |
|------|--------|----------|
| 8-tab control plane | **PASS** (code + E2E) | Vitest 5/5; Playwright 4/4 |
| Masked numbers / no secrets in UI | **PASS** (tests) | control plane fixtures |
| Write actions audited | **PASS** (code/tests) | admin service specs |
| Production data | **NOT VERIFIED** | No staging org provisioned on VPS |

---

## 19. Security and Privacy

| Control | Status | Evidence |
|---------|--------|----------|
| Secret references (no plaintext in DB) | **PASS** (code) | `VoiceProviderAccount.secretRef` |
| Startup secret validation | **PASS** | `VoiceSecretsStartupService` |
| Webhook replay / MCP nonce | **PASS** (code/tests) | gateway + webhook specs |
| Retention scheduler | **PASS** (code) | `VoiceRetentionScheduler` |
| Legal sign-off | **NOT VERIFIED** | Out of engineering scope |

---

## 20. Observability and Operations

| Signal | Status | Evidence |
|--------|--------|----------|
| `synqdrive_voice_*` metrics defined | **PASS** (code) | `voice-metrics.service.ts`, `alerts.yml` |
| Live Prometheus scrape | **NOT VERIFIED** | `/api/v1/metrics` → 401 unauthenticated |
| Runbooks | **PASS** | `voice-ai-production-release.md`, `voice-incidents.md` align with architecture |
| Grafana panels | **NOT VERIFIED** | Not inspected on VPS |

---

## 21. Automated Test Results

| Command | Result | Duration | Failures | Notes |
|---------|--------|----------|----------|-------|
| `npm run audit:voice-secrets` | **PASS** | ~0.2s | 0 | |
| `npm run test:voice:security` | **PARTIAL** | ~17s | 1 suite failed to run | 44 tests passed; `voice-mcp-gateway.security.spec.ts` **TS compile error** in `invoices.service.ts` (document-intake Prisma client mismatch in Cloud Agent workspace) |
| `npm run test:voice:staging-e2e` | **PASS** | ~8s | 0 | 39 tests |
| `npm test -- voice-control-plane` (frontend) | **PASS** | ~3s | 0 | 5 tests |
| `npm run test:voice:e2e` (Playwright) | **PASS** | ~25s | 0 | 4 tests, mocked |
| `npm test -- voice-billing voice-protection voice-call-orchestration twilio-tenant-provisioning` | **PASS** | ~11s | 0 | 39 tests |
| `npm run build` (backend, Cloud Agent) | **FAIL** | ~53s | 87 TS errors | Prisma client out of sync with `ac856881` schema (document-intake); **VPS deploy build succeeded** |
| `npm run build` (frontend) | **PASS** | ~43s | 0 | |
| `npx prisma validate` | **PASS** | ~0.7s | 0 | 1 warning |
| VPS `prisma migrate status` | **PASS** | — | 0 pending | |
| Frontend `lint` | **NOT RUN** | — | — | Scoped to document-intake files only in `package.json` |

---

## 22. Production Acceptance Matrix

| Function | Status |
|----------|--------|
| Git/deploy identity | **PASS** |
| App runtime health | **PASS** |
| Voice migrations applied | **PASS** |
| Feature flags (production intent) | **FAIL** |
| Native Twilio–ElevenLabs integration live | **FAIL** |
| Twilio subaccount per org (prod) | **NOT VERIFIED** |
| ElevenLabs agent + number (prod) | **FAIL** |
| Inbound AI call reality | **NOT VERIFIED** |
| Outbound AI call reality | **NOT VERIFIED** |
| Legacy Say isolation | **PARTIAL** |
| MCP gateway (prod) | **FAIL** |
| Webhook ingestion (prod) | **FAIL** |
| Conversation lifecycle (data) | **NOT VERIFIED** |
| Plans catalog | **PASS** |
| Entitlement enforcement on routes | **FAIL** |
| Usage/billing (prod data) | **NOT VERIFIED** |
| Budget protection (prod) | **NOT VERIFIED** |
| Org UI (prod browser) | **NOT VERIFIED** |
| Master control plane | **PARTIAL** |
| Security bundle (CI) | **PARTIAL** |
| Observability (live) | **NOT VERIFIED** |
| Automated E2E (mocked) | **PASS** |
| Staging live PSTN | **NOT VERIFIED** |
| Canary | **NOT VERIFIED** |

---

## 23. Findings by Priority

### P0 – Production Blockers

#### F-001 — No productive Voice AI runtime in production
- **Priority:** P0 | **Verification:** CONFIRMED
- **Area:** Runtime / provider reality
- **Description:** Production has 0 EL agents, 0 phone numbers, 0 conversations, 0 provider accounts; 1 DRAFT assistant only.
- **Production impact:** KI-Sprachassistent not operable for customers.
- **Technical cause:** Feature flags off; no provisioning/canary executed.
- **Code evidence:** Orchestration readiness blockers in `voice-call-orchestration.service.ts`
- **Runtime evidence:** VPS Prisma counts; EL/Twilio API read-only
- **Test evidence:** N/A (no runtime)
- **Remediation:** Execute release runbook canary on staging org; provision subaccount, number, agent; enable flags per org.
- **Dependencies:** Ops credentials, `ELEVENLABS_WEBHOOK_SECRET`, staging sign-off

#### F-002 — Inbound/outbound AI path not evidenced
- **Priority:** P0 | **Verification:** CONFIRMED (absence)
- **Area:** Call reality
- **Description:** No `VoiceConversation` with correlated CallSid + EL conversation ID.
- **Production impact:** ADR §9 acceptance criteria unmet.
- **Technical cause:** No live calls; stack disabled.
- **Code evidence:** ADR §9; readiness report §4
- **Runtime evidence:** `voice_conversations` = 0
- **Test evidence:** Live matrix scenarios 14–17 MANUAL only
- **Remediation:** Staging live-call checklist with allowlist
- **Dependencies:** F-001

#### F-003 — Native integration disabled globally on VPS
- **Priority:** P0 | **Verification:** CONFIRMED
- **Area:** Configuration
- **Description:** `VOICE_NATIVE_TWILIO_INTEGRATION` / aliases absent → false.
- **Production impact:** Productive PSTN→AI path cannot activate.
- **Technical cause:** Intentional pre-canary defaults + missing per-org enablement.
- **Code evidence:** `voice-feature-flags.config.ts`
- **Runtime evidence:** VPS env audit
- **Remediation:** Per-org flag enablement after canary
- **Dependencies:** Release mandate

#### F-004 — Webhook ingestion not production-ready
- **Priority:** P0 | **Verification:** CONFIRMED
- **Area:** Webhooks
- **Description:** `ELEVENLABS_WEBHOOK_SECRET` missing; ingestion disabled.
- **Production impact:** Post-call lifecycle, correlation, billing finalization cannot run.
- **Technical cause:** Secret not in VPS env; opt-in default after PR #495.
- **Code evidence:** `voice-secrets-startup.service.ts`, `voice-webhook-ingestion.config.ts`
- **Runtime evidence:** PM2 crash history; env presence audit
- **Remediation:** Configure secret; set `VOICE_WEBHOOK_INGESTION_ENABLED=true` when ready
- **Dependencies:** ElevenLabs workspace webhook secret

### P1 – High Priority

#### F-005 — MCP gateway disabled in production
- **Priority:** P1 | **Verification:** CONFIRMED
- **Area:** MCP
- **Description:** Gateway returns disabled message; flags absent.
- **Production impact:** Agent tools cannot execute against SynqDrive domain.
- **Remediation:** Set `VOICE_MCP_GATEWAY=true` + `VOICE_MCP_TOKEN_SECRET` for canary org
- **Dependencies:** F-001

#### F-006 — No billing entitlement guard on voice HTTP routes
- **Priority:** P1 | **Verification:** CONFIRMED (code)
- **Area:** Entitlements
- **Description:** `VoiceAssistantController` uses OrgScoping + Roles only; `addon.voice_agent` not enforced.
- **Production impact:** Voice APIs may be reachable without subscription (if flags enabled).
- **Code evidence:** `voice-assistant.controller.ts`; grep no entitlement in voice-assistant module
- **Remediation:** Wire billing entitlement guard per ADR Phase 6B intent
- **Dependencies:** Billing module

#### F-007 — CI security suite compile failure (Cloud Agent workspace)
- **Priority:** P1 | **Verification:** CONFIRMED
- **Area:** Test harness
- **Description:** `voice-mcp-gateway.security.spec.ts` failed to run due to TS error in `invoices.service.ts` / Prisma client drift.
- **Production impact:** MCP security tests not executed in this audit environment.
- **Remediation:** `npx prisma generate` after schema sync; fix document-intake compile
- **Dependencies:** document-intake merge `ac856881`

#### F-008 — Canary and staging live-call evidence missing
- **Priority:** P1 | **Verification:** CONFIRMED
- **Area:** Release process
- **Description:** Readiness report NO-GO items still open.
- **Runtime evidence:** `VOICE_E2E_ALLOW_LIVE_CALLS` absent; 0 conversations
- **Remediation:** Execute `docs/runbooks/voice-ai-production-release.md` phases 0–1

### P2 – Medium Priority

#### F-009 — Legacy TwiML Say code paths remain in production binary
- **Priority:** P2 | **Verification:** CONFIRMED
- **Area:** Legacy
- **Description:** `buildInboundVoiceTwiml`, `buildOutboundVoiceTwiml` still deployed; gated but not removed per ADR §4.9 removal criteria.
- **Assessment:** SAFE LEGACY COMPATIBILITY while flags off and no numbers.
- **Remediation:** Remove after 14-day native canary per ADR

#### F-010 — Duplicate migration row anomaly
- **Priority:** P2 | **Verification:** CONFIRMED
- **Area:** Database
- **Description:** `_prisma_migrations` duplicate `20260717200000_voice_conversation_pending_outcome` with null `finished_at`.
- **Remediation:** DBA review; ensure no drift

#### F-011 — Live observability not verified
- **Priority:** P2 | **Verification:** NOT VERIFIED
- **Area:** Observability
- **Description:** Metrics endpoint requires auth; Grafana not inspected.
- **Remediation:** Ops verify scrape + dashboard import

### P3 – Improvements

#### F-012 — Org UI browser acceptance not performed
- **Priority:** P3 | **Verification:** NOT VERIFIED
- **Remediation:** Manual QA on staging tenant desktop/mobile

#### F-013 — Frontend lint does not cover voice modules
- **Priority:** P3 | **Verification:** CONFIRMED
- **Remediation:** Extend eslint scope for voice-assistant paths

---

## 24. Remaining Legacy Components

| Component | Role | Production risk |
|-----------|------|-----------------|
| `twilio-voice-twiml.util.ts` | Say TwiML builders | Low while flags off / no numbers |
| `TwilioTelephonyService.initiateOutboundCall` | `calls.create` + Say | Low — gated by legacy diagnostic flag |
| `VoicePstnProvider` enum | Schema compatibility | Low — metadata only |
| `buildInboundVoiceTwiml` | No-assistant webhook fallback | Low |
| `LEGACY_TWIML_SAY` lifecycle metadata | Analytics separation | None |

---

## 25. Required Remediation Order

1. Configure `ELEVENLABS_WEBHOOK_SECRET` and enable webhook ingestion for staging host only.
2. Enable staging flags on dedicated `VOICE_E2E_ORG_ID` VPS/staging (`VOICE_AI_PROVISIONING_STAGING_ENABLED`, native integration, MCP).
3. Provision Twilio subaccount + number + EL agent import for staging org.
4. Execute manual live inbound/outbound checklist (allowlist, ≤4 short calls).
5. Verify conversation correlation, usage ledger, MCP audit in control plane.
6. Run canary phase 0 (24–72h) then phase 1 on one test org.
7. Add billing entitlement guard before broad tenant enablement.
8. Fix Cloud Agent Prisma generate / document-intake compile so full `test:voice:security` runs clean.
9. Import Grafana voice panels; verify Prometheus alerts firing.
10. After ADR removal criteria: deprecate legacy Say paths.

---

## 26. Final Production Decision

### **NO-GO**

**Rationale (per prompt §22 rules):**

- Echter Inbound- und Outbound-Pfad **nicht nachgewiesen**
- Kritische Production-Konfiguration **deaktiviert** (native integration, MCP, webhooks)
- **Keine** produktiven Provider-Ressourcen
- Readiness-Report-Blocker **offen**
- Entitlement-Enforcement auf Routen **fehlt**

**CONDITIONAL GO is not applicable:** there is an immediate functional P0 (no AI telephony reality), not merely limited P1/P2 rest points after a working canary.

**GO criteria not met** despite strong mocked/automated test coverage in repository.

---

## 27. Evidence Index

| ID | Type | Location / command |
|----|------|-------------------|
| E-01 | Git | `git rev-parse HEAD`, VPS `git -C /opt/synqdrive/current rev-parse HEAD` |
| E-02 | Health | `curl https://app.synqdrive.eu/api/v1/health` |
| E-03 | VPS PM2 | `pm2 status synqdrive` |
| E-04 | VPS DB | Prisma client script on VPS (counts) |
| E-05 | VPS env | `grep ^VOICE_ /opt/synqdrive/shared/backend.env` (redacted) |
| E-06 | Migrations | VPS `npx prisma migrate status` |
| E-07 | Twilio probe | Unsigned POST `/api/v1/webhooks/twilio/voice` → 401 |
| E-08 | MCP probe | POST `/api/v1/mcp/voice/{orgId}` → disabled JSON-RPC |
| E-09 | EL API | VPS `GET /v1/convai/agents`, `/v1/convai/phone-numbers` |
| E-10 | Twilio API | VPS parent account numbers/subaccounts count |
| E-11 | Redis queue | `LLEN bull:voice.webhook.process:*` |
| E-12 | PM2 errors | `/root/.pm2/logs/synqdrive-error.log` (redacted) |
| E-13 | Tests | Cloud Agent `npm run test:voice:*` outputs |
| E-14 | Architecture | `VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` |
| E-15 | Readiness | `VOICE_AI_PRODUCTION_READINESS_REPORT_2026-07-17.md` |
| E-16 | Code — flags | `backend/src/modules/voice-call-orchestration/voice-feature-flags.config.ts` |
| E-17 | Code — legacy | `backend/src/modules/twilio/twilio-voice-twiml.util.ts` |
| E-18 | Code — plans | `backend/src/modules/voice-billing/voice-plan-catalog.ts` |
| E-19 | Code — MCP tools | `backend/src/modules/voice-mcp-gateway/voice-mcp-tools.registry.ts` |
| E-20 | Code — lifecycle | `backend/src/modules/voice-webhook-ingestion/voice-conversation-lifecycle-state.util.ts` |
| E-21 | Frontend E2E | `frontend/e2e/voice-control-plane-flow.spec.ts` |
| E-22 | Runbook | `docs/runbooks/voice-ai-production-release.md` |

---

*End of audit — no remediation performed in this change set.*
