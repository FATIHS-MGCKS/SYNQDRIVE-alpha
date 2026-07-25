# Workflow Automation — Production Readiness Test Matrix

**Phase 11, Prompt 49** · **Version V4.9.859** · **Date 2026-07-25**

This document is the canonical traceability matrix for Workflow Automation production readiness. It maps the 42 minimum scenarios to automated tests, documents coverage gaps, and records CI verification results.

## Scope

| Area | Paths |
|------|-------|
| Workflow runtime | `backend/src/modules/workflows/**` |
| Task automation & outbox | `backend/src/modules/tasks/task-automation*`, `outbox/**`, `automation/**` |
| Booking lifecycle timing | `booking-pickup-return-timing.util.ts`, `booking-task.pipeline.integration.spec.ts` |
| Migration bridge | `workflows/migration/**`, `workflows/task-automation-bridge/**` |
| Frontend surfaces | `frontend/src/rental/components/workflow-automation/**` |

## Test levels

| Level | Backend | Frontend |
|-------|---------|----------|
| Unit | Evaluators, mappers, validators, timing utils | `task-automation.utils.test.ts` |
| Service | Dry-run, engine, maker-checker, migration, admin | `workflow-runtime.test.ts`, `workflow-config.test.ts` |
| Repository | Outbox repository (in-memory + unit) | — |
| Integration | Engine production, booking pipeline, migration | `task-automation.integration.test.ts` |
| Queue | Outbox processor, retry, DLQ, parallel workers | — |
| Database | Prisma invariants via in-memory harness (no live Postgres in CI) | — |
| API | Admin controller characterization, RBAC guards | Contract tests via API client mocks |
| Frontend component | — | Simulate, config, mobile/a11y, production-readiness |
| E2E | In-memory pipeline matrix (not Playwright for workflow UI in this prompt) | Vitest component integration |
| Security | Injection, tenant isolation, audit PII redaction | a11y + mobile contracts |
| Failure injection | Partial failure, DLQ, replay, deterministic clocks | — |

## CI commands

```bash
# Backend — unified verify (unit + security + integration + typecheck)
cd backend && npm run test:workflow-automation:verify

# Backend — subsets
npm run test:workflow-automation              # unit & service
npm run test:workflow-automation:integration  # harness integration
npm run test:workflow-automation:security     # security & audit

# Frontend
cd frontend && npm run test:workflow-automation:verify

# Builds
cd backend && npm run build
cd frontend && npm run build
```

Canonical scenario registry (machine-readable):  
`backend/src/modules/workflows/testing/workflow-production-readiness.scenarios.ts`

## Scenario matrix (42 minimum)

| # | Scenario | Status | Layer | Primary test reference |
|---|----------|--------|-------|------------------------|
| 1 | Dry run without side effects | automated | service | `workflow-dry-run.service.spec.ts` |
| 2 | Tenant isolation | automated | security | `workflow-production-readiness.spec.ts`, `workflow-security.production.spec.ts` |
| 3 | Scope fail-closed | automated | unit | `workflow-scope.evaluator.spec.ts` |
| 4 | Immutable version | automated | service | `workflow-maker-checker.service.spec.ts` |
| 5 | Event outbox atomic | automated | repository | `task-automation-outbox.spec.ts` |
| 6 | Worker retry | automated | queue | `task-automation-outbox.spec.ts` |
| 7 | Dead letter | automated | queue | `task-automation-outbox.spec.ts` |
| 8 | Replay | automated | service | `task-automation-admin.service.spec.ts` |
| 9 | Matcher | automated | integration | `workflow-engine.production.spec.ts` |
| 10 | Condition tree | automated | unit | `workflow-condition.evaluator.spec.ts` |
| 11 | Data types | automated | unit | `workflow-condition.evaluator.spec.ts` |
| 12 | Timer | partial | service | `task-automation.service.spec.ts` — task `activatesAt`/`dueDate`; no workflow-native delay executor |
| 13 | Pickup 30 min overdue | automated | service | `workflow-production-readiness.spec.ts`, `booking-task.pipeline.integration.spec.ts` |
| 14 | Idempotency | automated | integration | `workflow-engine.production.spec.ts`, `booking-task.pipeline.integration.spec.ts` |
| 15 | Parallel workers | automated | queue | `task-automation-outbox.spec.ts` |
| 16 | Approval pause & resume | automated | service | `workflow-engine.production.spec.ts` |
| 17 | Rejection | automated | service | `workflow-maker-checker.service.spec.ts` |
| 18 | Approval expiry | automated | service | `workflow-maker-checker.service.spec.ts` |
| 19 | Action timeout | partial | failure-injection | Outbox exponential backoff; no per-action wall-clock timeout in executor |
| 20 | Partial failure | automated | integration | `workflow-engine.production.spec.ts` |
| 21 | Fallback | partial | service | `workflow-dry-run.service.spec.ts` — `notification.prepare` expected fallback in preview |
| 22 | Task action | automated | integration | `workflow-dry-run.service.spec.ts`, `workflow-engine.production.spec.ts` |
| 23 | In-app notification | automated | service | `workflow-communication-contract.spec.ts` |
| 24 | Email | partial | service | Contract mock only; `channel.email.send` not in LIVE executor |
| 25 | WhatsApp | partial | service | Policy/risk catalog; preview-only in workflow runtime |
| 26 | SMS | partial | service | Contract mock only |
| 27 | Voice call | not-applicable | service | Separate Voice AI stack; workflow catalog references only |
| 28 | Provider webhooks | not-applicable | integration | Tested in `voice-webhook-ingestion` module |
| 29 | Webhook replay | not-applicable | service | Voice webhook ingestion module |
| 30 | Policy block | automated | service | `workflow-dry-run.service.spec.ts` |
| 31 | Quiet hours | partial | service | Policy hook stub in communication contract |
| 32 | Opt-out | partial | service | Recipient resolution respects opt-out in contract mock |
| 33 | AI prompt injection | automated | security | `workflow-security.production.spec.ts` |
| 34 | PII redaction | automated | security | `workflow-audit.spec.ts` |
| 35 | RBAC | automated | api | `task-automation-admin.controller.spec.ts` |
| 36 | Maker-checker | automated | service | `workflow-maker-checker.service.spec.ts` |
| 37 | Cancellation | automated | integration | `workflow-engine.production.spec.ts`, booking pipeline |
| 38 | Process restart | automated | queue | `task-automation-outbox.spec.ts` |
| 39 | Legacy migration | automated | integration | `task-automation-workflow-migration.spec.ts` |
| 40 | Shadow mode | automated | integration | `task-automation-workflow-migration.spec.ts` |
| 41 | Mobile UI | automated | frontend | `workflow-mobile-a11y.test.ts`, `workflow-production-readiness.test.ts` |
| 42 | Accessibility | automated | frontend | `workflow-mobile-a11y.test.ts`, `workflow-production-readiness.test.ts` |

### Coverage distribution

| Status | Count |
|--------|------:|
| automated | 31 |
| partial | 8 |
| not-applicable | 3 |
| **Total** | **42** |

## New production readiness suites (Prompt 49)

| File | Tests | Focus |
|------|------:|-------|
| `workflow-production-readiness.spec.ts` | 5 | Matrix registry, pickup overdue, timeout stub |
| `workflow-scope.evaluator.spec.ts` | — | Scope fail-closed |
| `workflow-condition.evaluator.spec.ts` | — | Condition tree + datatypes |
| `workflow-engine.production.spec.ts` | 7 | Matcher, idempotency, approval, partial failure, cancellation |
| `workflow-communication-contract.spec.ts` | — | Channel contract mocks (no live providers) |
| `workflow-security.production.spec.ts` | 3 | AI injection + tenant isolation |
| `workflow-production-readiness.test.ts` (frontend) | 5 | Mobile + a11y contracts |

**New suite total:** 37 backend tests across 6 files + 5 frontend tests.

## Backend test inventory

### Verify script results (2026-07-25)

| Stage | Suites | Tests | Result |
|-------|-------:|------:|--------|
| Unit & service (`test:workflow-automation`) | 27 | 198 | PASS |
| Security & audit | 4 | 23 | PASS |
| Integration harnesses | 6 | 66 | PASS |
| **Combined unique (full matrix command)** | **31** | **245** | **PASS** |

### Key existing suites (pre-Prompt 49)

| Suite | Tests (approx.) | Scenarios covered |
|-------|----------------:|-------------------|
| `task-automation-outbox.spec.ts` | 20+ | 5–8, 15, 19, 38 |
| `workflow-maker-checker.service.spec.ts` | 15+ | 4, 17, 18, 36 |
| `workflow-dry-run.service.spec.ts` | 10+ | 1, 21, 22, 30 |
| `task-automation-workflow-migration.spec.ts` | 12 | 39, 40 |
| `booking-task.pipeline.integration.spec.ts` | 18+ | 12–14, 37 |
| `task-automation-admin.service.spec.ts` | 10+ | 8, 35 |

## Frontend test inventory

| File | Tests | Result |
|------|------:|--------|
| `workflow-simulate.test.ts` | 8 | PASS |
| `workflow-config.test.ts` | 11 | PASS |
| `workflow-runtime.test.ts` | 6 | PASS |
| `workflow-mobile-a11y.test.ts` | 8 | PASS |
| `workflow-production-readiness.test.ts` | 5 | PASS |
| `task-automation.integration.test.ts` | 2 | PASS |
| `task-automation.utils.test.ts` | 5 | PASS |
| **Total** | **45** | **PASS** |

## Build & lint

| Check | Result | Notes |
|-------|--------|-------|
| `backend npm run build` | PASS | Fixed `WorkflowActionDef[]` → `JsonArray` cast in `workflows.service.ts` |
| `frontend npm run build` | PASS | `tsc -b && vite build` |
| Backend lint (workflow scope) | Not in dedicated script | Project lint targets document-extraction subset only |
| Flaky test fix | PASS | `booking-task.pipeline.integration.spec.ts` — deterministic `BOOKING_TASK_FIXED_NOW` for pickup/return handover |

## Test design principles (enforced)

1. **Behavioral assertions** — tests verify outcomes (task rows, run status, policy blocks), not private method calls.
2. **No live external providers** — email/SMS/WhatsApp/voice use contract mocks; Resend/Twilio/Meta not called in CI.
3. **Deterministic time** — `BOOKING_TASK_FIXED_NOW`, injected `now` in timing syncs, fixed ISO dates in evaluators.
4. **Strict tenant separation** — fixture org IDs (`org-a` / `org-b`, `org-booking-task-a` / `org-booking-task-b`) never cross-read.
5. **No real secrets** — all credentials mocked or omitted.
6. **Parallelism & races** — outbox concurrent enqueue, duplicate workflow run skip, concurrent `ensureBookingLifecycleTasks`.

## Non-testable external dependencies

| Dependency | Reason | Mitigation |
|------------|--------|------------|
| Resend / SMTP live send | No network in CI | `workflow-communication-contract.spec.ts` mock adapter |
| Twilio SMS / Voice PSTN | Billable + network | Voice module has separate staging matrix; workflow catalog only |
| Meta WhatsApp Cloud API | OAuth + network | Contract mock; WhatsApp module tested separately |
| Postgres transactional outbox | CI uses in-memory harness | `LEGAL_DOCUMENTS_POSTGRES_INTEGRATION` pattern available for future |
| BullMQ Redis worker process | Unit tests mock queue | Processor logic tested via `task-automation-outbox.spec.ts` |
| ElevenLabs / DIMO live | Out of workflow scope | Not invoked by workflow executor LIVE path |

## Known gaps & blockers

| Gap | Severity | Tracking |
|-----|----------|----------|
| `channel.email.send` / SMS / WhatsApp not in LIVE workflow executor | Medium | Catalog + dry-run only; channel dispatch via separate comms stack |
| Workflow-native delay/timer action | Low | Task-level `activatesAt` covers booking lifecycle |
| Per-action wall-clock timeout | Low | Outbox retry/backoff surrogate tested |
| Full quiet-hours engine | Low | Policy hook stub in contract tests |
| Playwright E2E for workflow UI | Low | Component tests + mobile/a11y contracts sufficient for this prompt |
| AI module unrelated `tsc` errors in some spec files | Info | Pre-existing; does not block `nest build` |

## Maintenance

- Update `workflow-production-readiness.scenarios.ts` when adding scenarios or changing status.
- Re-run `npm run test:workflow-automation:verify` before release.
- After meaningful changes: update SynqDrive **Changes** (V4.9.x) and **Architektur** Workflow Automation entry.
