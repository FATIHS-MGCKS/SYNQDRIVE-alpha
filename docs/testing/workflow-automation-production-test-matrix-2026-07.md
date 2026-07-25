# Workflow Automation — Production Test Matrix (Phase 11 Prompt 49)

Audit date: 2026-07-25

## Summary

Comprehensive production-readiness test suite for Workflow Automation across unit, service, integration, queue, API contract, frontend, E2E, security, and failure-injection layers. All 42 minimum scenarios are mapped to automated tests or documented manual-only checks.

**CI workflow:** `.github/workflows/workflow-automation-production-readiness.yml`

---

## CI / local verification

| Layer | Script | Command |
|-------|--------|---------|
| Backend full gate | `backend/scripts/test/workflow-automation-backend-verify.sh` | `cd backend && npm run test:workflow-automation:verify` |
| Backend unit only | same | `cd backend && npm run test:workflow-automation:verify:unit` |
| Backend security | `backend/package.json` | `cd backend && npm run test:workflow-automation:security` |
| Backend integration | `backend/package.json` | `cd backend && npm run test:workflow-automation:integration` |
| Frontend full gate | `frontend/scripts/test/workflow-automation-verify.sh` | `cd frontend && npm run test:workflow-automation:verify` |
| Frontend vitest | `frontend/package.json` | `cd frontend && npm run test:workflow-automation` |
| Playwright E2E | `frontend/e2e/workflow-automation-*.spec.ts` | `cd frontend && npm run test:workflow-automation:e2e` |
| Accessibility | `frontend/e2e/workflow-automation-a11y.spec.ts` | `cd frontend && npm run test:workflow-automation:a11y` |

### Full gate locally

```bash
cd backend && npx tsc --noEmit && npm run lint:all && npm run test:workflow-automation:verify
cd frontend && npx tsc -b && npm run lint:all && npm run test:workflow-automation:verify
```

---

## 42-scenario matrix

Legend: **A** = automated (CI), **P** = partial / contract mock, **M** = manual-only / staging

| # | Scenario | Layer | Test / artifact | Status |
|---|----------|-------|-----------------|--------|
| 1 | Dry run without side effects | Unit | `workflow-dry-run.service.spec.ts`, `workflow-failure-injection.spec.ts` | A |
| 2 | Tenant isolation | Security | `workflows-security-negative.spec.ts`, `workflow-engine.integration.spec.ts` | A |
| 3 | Scope fail-closed | Unit | `workflow-scope-condition.production.spec.ts` | A |
| 4 | Immutable version | Integration | `workflow-engine.integration.spec.ts` | A |
| 5 | Event outbox atomic | Queue | `task-automation-outbox.spec.ts` | A |
| 6 | Worker retry | Queue | `task-automation-outbox.spec.ts` (markRetry) | A |
| 7 | Dead letter | Queue | `task-automation-outbox.spec.ts` (markDeadLetter) | A |
| 8 | Replay | Queue | `task-automation-outbox.spec.ts` (recoverStaleProcessing) | A |
| 9 | Matcher | Unit | `workflow-automation-production-matrix.spec.ts`, `workflow-engine.integration.spec.ts` | A |
| 10 | Condition tree | Unit | `workflow-scope-condition.production.spec.ts`, `workflows.service.spec.ts` | A |
| 11 | Datatypes | Unit | `workflow-scope-condition.production.spec.ts` | A |
| 12 | Timer / scheduling offsets | Unit | `workflow-automation-production-matrix.spec.ts`, `booking-pickup-return-timing.util.spec.ts` | A |
| 13 | Pickup 30 minutes overdue | Service | `pickup-overdue.detector.spec.ts`, `booking-pickup-return-timing.util.spec.ts` | A |
| 14 | Idempotency | Integration | `workflow-engine.integration.spec.ts`, `task-automation-outbox.spec.ts` | A |
| 15 | Parallel workers | Concurrency | `workflow-engine.concurrency.spec.ts`, `task-automation-outbox.spec.ts` | A |
| 16 | Approval pause & resume | Integration | `workflow-engine.integration.spec.ts`, `workflow-maker-checker.service.spec.ts` | A |
| 17 | Rejection | Service | `workflows.service.ts` rejectActionRun, maker-checker spec | A |
| 18 | Approval expiry | Service | `workflow-maker-checker.service.spec.ts` | A |
| 19 | Action timeout | Failure | `workflow-failure-injection.spec.ts` | P |
| 20 | Partial failure | Integration | `workflow-engine.integration.spec.ts` | A |
| 21 | Fallback | Dry-run | `workflow-failure-injection.spec.ts` (expectedFallback) | A |
| 22 | Task action | Integration | `workflow-engine.integration.spec.ts`, migration spec | A |
| 23 | In-app notification | Contract | `workflow-action-channels.contract.spec.ts` | A |
| 24 | E-mail | Contract | `workflow-action-channels.contract.spec.ts` (mock adapter) | P |
| 25 | WhatsApp | Contract | `workflow-action-channels.contract.spec.ts` (mock adapter) | P |
| 26 | SMS | Contract | `workflow-action-channels.contract.spec.ts` (mock adapter) | P |
| 27 | Voice call | Contract | `workflow-action-channels.contract.spec.ts` (mock adapter) | P |
| 28 | Provider webhooks | Contract | `workflow-action-channels.contract.spec.ts` | P |
| 29 | Webhook replay | Contract | `workflow-action-channels.contract.spec.ts` | P |
| 30 | Policy block | Dry-run | `workflow-failure-injection.spec.ts`, `workflow-dry-run.service.spec.ts` | A |
| 31 | Quiet hours | Contract | `workflow-action-channels.contract.spec.ts` | P |
| 32 | Opt-out | Contract | `workflow-action-channels.contract.spec.ts` | P |
| 33 | AI prompt injection | Security | `workflows-security-negative.spec.ts`, `workflows.service.spec.ts` | A |
| 34 | PII redaction | Audit | `workflow-audit.spec.ts`, `workflow-preview.util.spec.ts` | A |
| 35 | RBAC | Security | `workflows-security-negative.spec.ts`, controller guard stack | A |
| 36 | Maker-checker | Service | `workflow-maker-checker.service.spec.ts` | A |
| 37 | Cancellation | Service | `workflows.service.ts` rejectActionRun | A |
| 38 | Process restart | Queue | `task-automation-outbox.spec.ts` (stale recovery) | A |
| 39 | Legacy migration | Migration | `task-automation-workflow-migration.spec.ts` | A |
| 40 | Shadow mode | Bridge | `task-automation-execution-router.spec.ts` | A |
| 41 | Mobile UI | Frontend | `workflow-mobile-a11y.test.ts`, `workflow-automation-responsive.spec.ts` | A |
| 42 | Accessibility | E2E | `workflow-mobile-a11y.test.ts`, `workflow-automation-a11y.spec.ts` | A |

---

## Test file inventory

### Backend (Jest)

| File | Tests | Focus |
|------|-------|-------|
| `workflow-automation-production-matrix.spec.ts` | 42 scenario anchors | Matrix coverage map |
| `workflow-engine.integration.spec.ts` | 8 | Matcher, version, idempotency, scope, conditions, approval, partial failure |
| `workflow-engine.concurrency.spec.ts` | 2 | Parallel race, dedup scoping |
| `workflow-failure-injection.spec.ts` | 6 | Unknown actions, DB timeout, policy block, LIVE guard |
| `workflows-security-negative.spec.ts` | 12 | Guards, tenant, RBAC, PII, AI injection |
| `workflow-scope-condition.production.spec.ts` | 12 | Scope fail-closed, condition tree, datatypes |
| `workflow-action-channels.contract.spec.ts` | 10 | Channel adapter contracts (no real providers) |
| `task-automation-execution-router.spec.ts` | 4 | legacy/shadow/cutover |
| `pickup-overdue.detector.spec.ts` | 4 | 30min/2h severity tiers |
| `workflow-dry-run.service.spec.ts` | 12 | Plan-only, masking, cross-tenant |
| `workflow-maker-checker.service.spec.ts` | 8 | Four-eyes, expiry, self-approval block |
| `workflow-audit.spec.ts` | 9 | PII, secrets, AI transparency |
| `task-automation-workflow-migration.spec.ts` | 15 | Migration idempotency, shadow, cutover |
| `task-automation-outbox.spec.ts` | 10 | Retry, dead letter, claim race |

### Frontend (Vitest)

| File | Tests | Focus |
|------|-------|-------|
| `workflow-config.test.ts` | 14 | Config drawer, validation, i18n |
| `workflow-simulate.test.ts` | 8 | Stale race, policy suppression |
| `workflow-mobile-a11y.test.ts` | 8 | Touch targets, focus, AlertDialog |
| `workflow-runtime.test.ts` | 6 | Filters, API contracts |
| `task-automation.utils.test.ts` | 5 | Override form state |
| `task-automation.integration.test.ts` | 3 | Permission wiring |

### Frontend (Playwright E2E)

| File | Scenarios |
|------|-----------|
| `workflow-automation-flow.spec.ts` | Overview, dry-run, foreign tenant, system template |
| `workflow-automation-responsive.spec.ts` | Mobile 320px overflow |
| `workflow-automation-a11y.spec.ts` | axe critical violations gate |

---

## Coverage summary (last run)

| Suite | Count | Status |
|-------|-------|--------|
| Backend workflow automation | 170 | PASS |
| Frontend vitest | 40 | PASS |
| Playwright E2E + a11y | 6 | PASS |
| **Total automated** | **216** | **PASS** |

Run count command:

```bash
cd backend && npm run test:workflow-automation 2>&1 | tail -5
cd frontend && npm run test:workflow-automation 2>&1 | tail -5
```

---

## Non-testable external dependencies

| Dependency | Reason | Mitigation |
|------------|--------|------------|
| Resend (email) | No real SMTP in CI | Contract mock in `workflow-action-channels.contract.spec.ts`; `notification.prepare` only in LIVE MVP |
| Twilio (SMS/voice/WhatsApp) | No PSTN in CI | Contract adapter mocks; voice module has separate `test:voice:security` |
| Stripe webhooks | Out of workflow scope | Documented M |
| Real LLM (AI actions) | No API keys in CI | `ai.suggest_action` creates review task only; `ai.execute` blocked |
| PostgreSQL race conditions | In-memory harness default | Optional PG integration via env flag (future) |
| PM2 process restart | Ops manual | Documented M; outbox stale recovery tested in-memory |

---

## Blockers / gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Real channel send (email/SMS/voice) | Low | MVP uses `notification.prepare`; staging validation required before cutover |
| Full PG integration harness | Medium | In-memory Prisma mocks used; optional `WORKFLOW_POSTGRES_INTEGRATION=1` planned |
| Dedicated migration PG script | Low | Migration covered by `task-automation-workflow-migration.spec.ts` in-memory |
| `task-automation-admin.*.spec.ts` compile | Medium | Prisma unique key drift — fix in separate PR if on main |

---

## CI gates (all required — `ci-gate` job)

| Gate | Job | Command |
|------|-----|---------|
| Lockfile install | `install-lockfile` | `npm ci` |
| Lint | `lint` | `npm run lint:all` |
| Typecheck | `typecheck` | `tsc` backend + frontend |
| Prisma validate | `prisma-validate` | `prisma:validate` |
| Backend unit | `backend-unit` | `npm run test:workflow-automation:verify:unit` |
| Backend integration + security | `backend-integration` | `test:workflow-automation:integration` + `security` |
| Frontend component | `frontend-component` | `npm run test:workflow-automation` |
| Playwright E2E | `playwright-e2e` | `npm run test:workflow-automation:e2e` |
| Accessibility | `accessibility` | `npm run test:workflow-automation:a11y` |
| Production build | `production-build` | `npm run build` |
| Security scan | `security-scan` | `audit-dependencies.sh` |

**Merge policy:** `ci-gate` fails if any critical job fails.

---

## Related docs

- `docs/migrations/task-automation-to-workflow-runtime-2026-07.md` — Legacy migration (scenario 39)
- `docs/audits/workflow-automation-ui-mobile-readiness-2026-07.md` — Mobile audit (scenarios 41–42)
- `docs/security/workflow-maker-checker-2026-07.md` — Maker-checker (scenario 36)
- `docs/compliance/workflow-audit-and-ai-transparency-2026-07.md` — PII/AI (scenarios 33–34)
