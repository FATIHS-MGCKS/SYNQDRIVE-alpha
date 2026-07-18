# Voice AI Real Staging E2E Acceptance (Prompt 10A)

Date: 2026-07-18

## Scope

Controlled real voice E2E acceptance for the dedicated internal staging organization `org-voice-staging-e2e` only. No production customers, no production automations, tight live-call budget (max 2 inbound + 2 outbound).

## Prerequisite status

| Prompt | Decision | Impact on 10A |
|--------|----------|---------------|
| 9A Preflight | GO (with gaps) | Secrets/flags baseline OK |
| 9B Provisioning | **NO-GO** | Subaccount, phone, active deployment missing |

**Live PSTN chain cannot be evidenced until 9B blockers are resolved.**

## Execution

| Artifact | Purpose |
|----------|---------|
| `backend/scripts/ops/voice-staging-e2e-acceptance.ts` | Automated negative suites + DB snapshot + decision |
| `backend/scripts/ops/voice-staging-e2e-rollback.sh` | Close `VOICE_E2E_ALLOW_LIVE_CALLS`, clear allowlist |
| `voice-staging-e2e-readiness.util.ts` | Pure decision helpers (testable) |
| `docs/audits/voice-ai-real-staging-e2e-acceptance-report.md` | Machine-generated audit |

```bash
cd backend
npm run voice:staging:e2e-acceptance
bash scripts/ops/voice-staging-e2e-rollback.sh   # on VPS after any manual canary
```

## Live call budget (this run)

| Direction | Budget | Executed |
|-----------|--------|----------|
| Inbound | 2 | **0** |
| Outbound | 2 | **0** |

No live calls were placed — provisioning incomplete and `VOICE_E2E_ALLOW_LIVE_CALLS=false`.

## Inbound scenarios (blocked)

| # | Scenario | Status |
|---|----------|--------|
| 1 | Geschäftsfrage / Öffnungszeiten | BLOCKED — no staging number |
| 2 | Synthetische Buchungsabfrage | BLOCKED |
| 3 | Kontrollierter Rückruf / Support | BLOCKED |
| 4 | Mitarbeiterweiterleitung / Fallback | BLOCKED |

Required chain (not evidenced live): Twilio Call SID → ElevenLabs Conversation → `VoiceConversation` → MCP tool → post-call event → usage event.

## Outbound scenarios (blocked)

| # | Scenario | Status |
|---|----------|--------|
| 1 | Erlaubter kurzer Testcall | BLOCKED |
| 2 | No Answer / kontrolliertes Scheitern | BLOCKED |
| 3 | Idempotency retry ohne Doppelcall | AUTOMATED (specs) |

## Negative tests (no PSTN cost)

Automated suites executed in CI/agent workspace:

| Area | Suite | Result |
|------|-------|--------|
| Matrix + E2E gates | `test:voice:staging-e2e` | **PASS** (39 tests) |
| Security / isolation / webhooks / MCP | `test:voice:security` | **PASS** (49 tests) |

Coverage includes: cross-tenant, MCP token/replay, disallowed tools, budget blocks, webhook signatures, DLQ/replay, provider resilience, structured logs without secrets/PII.

## Data acceptance

| Check | Result |
|-------|--------|
| One conversation per call | N/A — 0 conversations |
| Twilio/ElevenLabs correlation | N/A |
| Lifecycle state machine | Automated specs PASS |
| ACTIVE+RESOLVED conflict | No violations (0 rows) |
| Tool / approval audit | 0 executions in staging org |
| Usage dedup | 0 usage events |
| Provider cost / customer price | Not exercised live |
| No secrets/PII in logs | Privacy/security specs PASS |

## Rollback

Post-acceptance state (verified):

- `VOICE_E2E_ALLOW_LIVE_CALLS=false`
- `VOICE_E2E_ALLOWLIST_E164` unset/cleared
- Staging org remains `rollout:STAGING`
- No production release
- No numbers released to production traffic

## Remediation before retry

1. Create Twilio staging subaccount via Console (IE1 parent cannot `accounts.create`).
2. Register subaccount via control-plane `credentials/register` with `env-json://` ref.
3. Re-run `npm run voice:staging:provision -- --apply` (phone + agent + EL import).
4. Set allowlisted test E.164 + `VOICE_E2E_ALLOW_LIVE_CALLS=true` only during manual canary.
5. Re-run acceptance with ≤2 inbound + ≤2 outbound, then rollback script.

## Decision

# **E2E NO-GO**

**Rationale:** Prompt 9B did not achieve Live E2E GO. Full voice chain (Twilio → ElevenLabs → SynqDrive → MCP → post-call → usage) was not proven with controlled live calls. Automated negative/policy coverage passes and rollback gates are safe, but that is insufficient for full E2E sign-off.

**Next decision after remediation:** expect **E2E CONDITIONAL GO** after infra ready + live canary, or **E2E GO** if all four inbound/outbound scenarios complete within budget with clean data acceptance.
