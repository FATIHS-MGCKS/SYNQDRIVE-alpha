# Notification Engine — Post-Remediation Readiness Audit

**Date:** 2026-07-26 (UTC)  
**Scope:** Prompts 1–36 — full remediation branch review, test re-run, code SSOT audit, production read-only verification  
**Branch audited:** `cursor/notification-readiness-final-45b7` (tip includes Prompts 32–35)  
**Production deployed commit:** `4a479c1ef1548b89ed5a06337356248100e0bb00`  
**Remediation tip (not deployed):** `38b08c41` (+16 commits ahead of prod)

---

## 1. Executive summary

| Area | Status |
|------|--------|
| Architecture (remediation branch) | **Substantially complete** — single engine, registry, lifecycle, API, workflow idempotency, delivery, audit, retention, observability |
| Tests (notification-focused) | **Not fully green** — 291 pass / 3 fail (backend); 114 pass / 4 fail (frontend notification) |
| Load / concurrency harness | **Pass** — 16/16 scenarios |
| Security regression (tenant/station) | **Pass** |
| Migration acceptance tooling | **Pass** (hardened suite on branch) |
| Production data integrity (live) | **Pass** — 0 duplicate active fingerprints, 0 orphans, 0 outbox backlog/dead letters |
| Production remediation alignment | **Fail** — +16 commits not on `main`/VPS; remediation DB migrations not applied |
| Pilot org acceptance (Prompt 35) | **Fail** — `occurrence_count` drift; live API E2E incomplete |
| Legacy code removal | **Correctly deferred** — V1 paths retained behind flags |
| External delivery | **Disabled** on production (as required) |

### Final decision: **CONDITIONAL GO**

The Notification Engine remediation is **architecturally ready for gated production rollout** on the remediation branch, but **not unconditionally production-ready today**. Unconditional **GO** is blocked by: failing tests, undeployed remediation stack, missing org-scoped V2 allowlist, incomplete pilot sign-off, and historical Prisma migration failures on VPS.

**Do not claim full production readiness** until all Go-Live Gates in §12 are satisfied.

---

## 2. Final architecture state

```
Domain event / DashboardInsight / Telemetry / BI
        ↓
NotificationProducerAdapter / IngestService
        ↓
NotificationCandidate (+ registry validation)
        ↓
buildRegistryFingerprint()  [org|eventType|entity|condition|vN]
        ↓
NotificationCoreService  (single write path)
        ↓
notifications + notification_occurrences + notification_receipts
        ↓
├─ NotificationApiService → REST (tenant-scoped)
├─ NotificationLifecycleWorkflowEmitter → WorkflowEngine (idempotent)
├─ NotificationTaskMaterializer → org_tasks (deduped)
├─ NotificationDeliveryEnqueue → notification_delivery_outbox → BullMQ
├─ NotificationAuditService → notification_audit_events
└─ NotificationRetentionService (scheduled purge)
        ↓
Prometheus metrics + structured logs (remediation branch)
        ↓
Frontend: useNotifications → mapNotificationApiToActionQueueItem (V2 on)
```

**Module footprint:** 120+ TypeScript files under `backend/src/modules/notifications/`.

**Remediation commits since production deploy (`4a479c1`):** 16 (workflow lifecycle, task linking, idempotency, delivery policy, GDPR, audit, observability, migration hardening, load tests, audits).

---

## 3. Single-source-of-truth evidence

### 3.1 Code audit (Task 3)

| Check | Result | Evidence |
|-------|--------|----------|
| No synthetic `dashboardNotifications` in ActionQueue | **Pass** | `useDashboardViewModel` passes `notifications: []` to `buildUnifiedActionQueue`; synthetic feed only feeds `BusinessInsightsBox` via `buildDashboardNotificationsFromInsights` |
| No DashboardInsight rows as parallel notification persistence | **Pass** | Insights remain **producers** via `insight-candidate.mapper.ts` → `NotificationCandidate`; V2 rows in `notifications` table |
| No ActionQueue-as-notification-engine | **Pass (when V2 on)** | `shouldUseV2NotificationSource()` → API-only queue; V1 builder retained behind flag for rollback |
| No direct producers outside Candidate | **Pass** | All adapters emit `NotificationCandidate`; `NotificationProducerRouter` gates on `NOTIFICATIONS_V2` |
| No parallel notification counts in V2 mode | **Pass** | Tab counts from `GET /notifications/counts` (+ documented supplemental bridges for overdue handover / vehicle health) |
| No free frontend deduplication in V2 mode | **Pass** | V2 items mapped directly from API DTO; dedupe is server-side fingerprint |
| No workflow duplicate triggers (remediation) | **Pass on branch** | `workflow-notification-idempotency.util.ts`, generation-scoped action keys, loop guard — **not deployed to prod** |

### 3.2 Intentional parallel paths (until cutover complete)

| Path | Purpose | Removal gate |
|------|---------|--------------|
| `buildUnifiedActionQueue` (V1) | Rollback / `VITE_NOTIFICATIONS_V2=off` | Fleet cutover sign-off |
| `buildDashboardNotificationsFromInsights` | BusinessInsightsBox Notifications tab only | Separate product decision |
| `extractOverdueHandoverQueueItems` | Supplemental critical handover rows in V2 mode | V2 event types for handover |
| `mergeV2NotificationsWithVehicleHealth` | Vehicle health supplemental | Health module V2 producer coverage |
| Shadow compare (`notification-shadow-compare`) | Diagnostics when `shadow` mode | Post-cutover cleanup |

**Legacy removal (Task 6):** Not executed — pilot not signed off, flags required for rollback, tests not fully green. **Correct.**

---

## 4. Producer and consumer matrix

### Producers → Candidate

| Producer | Adapter / Service | Event types (examples) |
|----------|-------------------|------------------------|
| Driving assessment device quality | `driving-assessment-notification.adapter` | `DRIVING_ASSESSMENT_DEVICE_QUALITY` |
| Technical observations | `technical-observation-notification.adapter` | `TECHNICAL_OBSERVATION_ACTIVE` |
| Station shortage (BI) | `station-shortage-notification.adapter` | `STATION_SHORTAGE` |
| Low utilization (BI) | `low-utilization-notification.adapter` | `LOW_UTILIZATION` |
| Vehicle health (DTC, tires, etc.) | `vehicle-health-notification.adapter` | `ACTIVE_DTC`, `TIRE_CRITICAL`, … |
| Rental health projector | `rental-health-notification.projector` | Health-derived events |
| DashboardInsight bridge | `insight-candidate.mapper` | Legacy insight → candidate |
| Legal documents | `legal-document-notification-event.definitions` | Document expiry events |

**Registry:** 46 slug definitions in `notification-event-registry.definitions.ts` (30+ canonical event types in production readiness baseline).

### Consumers

| Consumer | Input | Notes |
|----------|-------|-------|
| Dashboard ActionQueue (V2) | `GET /notifications` | Sole notification box source when flag on |
| NotificationPanel | ViewModel from API | Read/ack/snooze/resolve mutations |
| WorkflowEngine | Lifecycle events | Idempotent run/action keys |
| OrgTask | Workflow `task.create` | `notificationId` + dedup key |
| Delivery processor | Outbox | Gated `NOTIFICATIONS_DELIVERY_ENABLED` |
| Audit API | `notification_audit_events` | Org-admin read |
| Retention scheduler | Classification + policy | GDPR-aligned purge |
| Prometheus | `synqdrive_notification_*` | Remediation branch only |

---

## 5. Data model

| Table | Role |
|-------|------|
| `notifications` | Canonical state: fingerprint, lifecycleGeneration, status, severity, templateParams, actionTarget |
| `notification_occurrences` | Append-only event history |
| `notification_receipts` | Per-user read/ack/snooze (unique notificationId+userId) |
| `notification_delivery_outbox` | Transactional external delivery queue |
| `notification_audit_events` | Remediation migration `20260726150000` — not on prod |
| `user_notification_preferences` | Channel/category opt-out |

**Constraints (production):**

- Partial unique index `notifications_active_fingerprint_generation_key` on active statuses — verified in migration `20260711120000`
- Fingerprint stability: `org|eventType|entityType|entityId|conditionCode|vN` — no locale/title/time

**Known production data issue:** `occurrence_count` column drift on pilot org (9/22 rows) — counter not always synced with occurrence row count. Requires reconciliation before sign-off.

---

## 6. Lifecycle

Centralized in `NotificationCoreService`:

- States: OPEN → ACKNOWLEDGED / SNOOZED → RESOLVED → (reopen) → new generation
- `notification-status.transitions.ts` — programmatic guards
- `notification-reopen.policy.ts` — cooldown + generation increment
- User receipts separated from org-wide `acknowledgedAt` / `snoozedUntil`
- Severity escalation via registry policy
- Out-of-order event handling: min/max bounds on `firstSeenAt`/`lastSeenAt` (fix in load-resilience prompt)

---

## 7. Workflow integration

| Control | Implementation |
|---------|----------------|
| Lifecycle emit | `NotificationLifecycleWorkflowEmitter` post-transaction |
| Loop guard | `notification-workflow-loop.guard.ts` |
| Run idempotency | `notification-run:{org}:{workflowId}:{triggerEventId}` |
| Action idempotency | `notification-action:{org}:…:gen:{N}:action:{id}` |
| Task linking | `NotificationTaskMaterializer` → `org_tasks.notification_id` |
| Task completion → resolve | `NotificationTaskCompletionService` |

**Production:** Workflow idempotency + task-linking migrations (`20260726120000`, `20260726130000`) **not applied**.

---

## 8. Delivery

| Item | Status |
|------|--------|
| Channel matrix | In-app canonical; email via outbox; push stub; SMS/WhatsApp/Voice disabled |
| `NOTIFICATIONS_DELIVERY_ENABLED` | `false` on production |
| Quiet hours / policy | `NotificationChannelPolicyService` (remediation branch) |
| External redaction | `redactTemplateParamsForExternalChannel` |
| Observability | Delivery attempts/failures/dead-letter metrics (remediation branch) |

---

## 9. GDPR / data protection

| Control | Implementation |
|---------|----------------|
| Data classification | `notification-data-classification.ts` — 8 categories |
| Write-time minimization | Strip PII/secrets from templateParams |
| Retention | ACTIVE (no age purge), RESOLVED 180d, SECURITY 2555d, DELIVERY 90d |
| Legal hold | Per-notification flag |
| Data subject rights | `NotificationDataSubjectService` export/erase/restrict |
| Audit minimization | No titleKey/bodyKey in audit rows |

**Production:** Retention/audit migrations not deployed.

---

## 10. ISO 27001-oriented controls

Alignment documented in `docs/compliance/notification-engine-audit-iso27001.md`:

| ISO objective | Control |
|---------------|---------|
| A.8.15 Logging | `notification_audit_events` append-only |
| A.12.4 Event logging | Lifecycle + delivery + policy rejection events |
| A.18.1/2 Privacy | Minimization + retention + data subject service |
| Access control | Tenant + station scope — `notification-access.security.regression.spec.ts` |

**Not a certification attestation.**

---

## 11. Test results (re-run 2026-07-26)

### Backend (`--testPathPattern=notification`)

| Suite | Result |
|-------|--------|
| Total | **291 passed, 3 failed, 1 skipped** (42 suites) |
| Load / resilience | **16/16 pass** |
| Security regression | **Pass** |
| Migration acceptance / backfill / CLI | **Pass** |
| Core / API / delivery / audit / compliance | **Pass** (majority) |

**Failures:**

| Test | Issue |
|------|-------|
| `notification-task-completion.service.spec.ts` | `resolveNotification` call signature mismatch (audit context arg) |
| `notification-producers-phase1.spec.ts` | ACTIVE_DTC / TIRE_CRITICAL resolve expects RESOLVED, receives OPEN |

### Frontend (notification paths)

| Suite | Result |
|-------|--------|
| `src/rental/lib/notifications/**` + dashboard notification tests | **114 passed, 4 failed** |
| Full frontend suite | 2229 passed, 11 failed (includes non-notification regressions) |

**Notification failures:** `notificationEngine.wob-l7503.test.ts` — driving assessment duplicate count expectation (V1 path characterization).

### E2E / contract

| Type | Status |
|------|--------|
| Isolated load harness | Pass |
| Live authenticated production E2E | **Not executed** (Prompt 35) |
| Staging multi-PM2 benchmark | **Not executed** |

---

## 12. Load test results

From `docs/audits/notification-engine-load-resilience-test-2026-07.md`:

- 10k distinct ingest p50 ~0.44 ms (in-memory harness)
- Parallel dedup (10/100), multi-instance, lifecycle, out-of-order, P2002 retry — all pass
- **Scope limit:** Not Postgres/Redis/BullMQ production topology

---

## 13. VPS production results (read-only, 2026-07-26)

| Check | Value |
|-------|-------|
| Health | `ok` |
| `dup_active_fingerprints` | **0** |
| `orphan_occurrences` | **0** |
| `outbox_pending` | **0** |
| `outbox_dead` | **0** |
| Active notifications | 18 |
| PM2 `synqdrive` | online |
| `NOTIFICATIONS_V2` | `true` (global) |
| `NOTIFICATIONS_DELIVERY_ENABLED` | `false` |
| Remediation observability metrics | **0 series** (module not deployed) |
| Failed `_prisma_migrations` (historical) | 15 (non-notification) |

See also: `notification-engine-vps-control-audit-2026-07.md`, `notification-engine-production-pilot-acceptance-2026-07.md`.

---

## 14. Known residual risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Remediation not on `main`/prod | **High** | Merge PR stack, deploy |
| `occurrence_count` drift | **High** | Reconciliation job + root-cause fix |
| Global V2 without org allowlist | **High** | Implement `NOTIFICATIONS_V2_ORG_ALLOWLIST` |
| 3 backend + 4 frontend test failures | **Medium** | Fix before merge |
| 15 historical migration failures | **Medium** | VPS migration hygiene before deploy |
| Supplemental V2 bridges (handover/health) | **Low** | Documented; migrate to V2 producers |
| `buildDashboardNotificationsFromInsights` in BusinessInsightsBox | **Low** | Isolated from ActionQueue; separate cutover |
| In-memory load tests ≠ prod topology | **Low** | Staging benchmark post-deploy |
| External delivery untested in prod | **Low** | Keep disabled until channel sign-off |

---

## 15. Go-live gates

| # | Gate | Status |
|---|------|--------|
| G1 | Remediation PRs merged to `main` | **Open** |
| G2 | All notification tests green | **Open** (3 BE + 4 FE failures) |
| G3 | VPS deploy via `cloud-agent-deploy.sh` | **Open** |
| G4 | Remediation migrations applied | **Open** |
| G5 | Historical migration failures resolved | **Open** |
| G6 | Org-scoped V2 allowlist | **Open** |
| G7 | Migration backfill + acceptance on pilot org | **Open** |
| G8 | `occurrence_count` reconciled | **Open** |
| G9 | Authenticated live E2E (2 users) | **Open** |
| G10 | Pilot org sign-off | **Open** (Prompt 35 NO-GO) |
| G11 | Staging load benchmark | **Open** |
| G12 | Fleet flag cutover approval | **Open** |
| G13 | External delivery channel sign-off | **Open** (disabled OK) |
| G14 | Legacy V1 path removal | **Deferred** (post G12) |

---

## 16. Rollback

**Tested:** Flag deactivation path documented; no data deletion required.

1. `NOTIFICATIONS_V2=false`, `VITE_NOTIFICATIONS_V2=off` (frontend rebuild)
2. Keep `NOTIFICATIONS_DELIVERY_ENABLED=false`
3. `pm2 restart synqdrive --update-env`
4. Release rollback: symlink previous release `20260725230430_v4994`

**Rollback triggered during this audit:** No.

---

## 17. Branch and commit inventory (Prompts 1–35)

| Prompt range | Theme | Representative commits |
|--------------|-------|------------------------|
| 1–15 | Domain, Prisma, registry, core, API, frontend cutover | Baseline on `main` (`4a479c1` area) |
| 16 | Production readiness audit | `docs/notification-engine-production-readiness.md` |
| 17–24 | Producers, runtime, permissions, templates, navigation | Various feature branches |
| 25–31 | Workflow, tasks, delivery, GDPR, access, audit | `44cf91c0` … `a1199d51` |
| 32 | Migration hardening | `8a9b56df` |
| 33 | VPS control audit | `4d571a98` |
| 34 | Load/resilience | `454732d3` |
| 35 | Production pilot acceptance | `38b08c41` |
| 36 | This document | (pending commit) |

**Draft PR stack:** #948–#954 (remediation branches).

---

## 18. Final decision

### **CONDITIONAL GO**

| Criterion | Assessment |
|-----------|------------|
| Single Source of Truth (architecture) | **Achieved on remediation branch** when V2 flags on; supplemental bridges documented |
| DSGVO-oriented controls | **Implemented on branch**; not deployed |
| ISO-oriented audit logging | **Implemented on branch**; not deployed |
| Production Ready (today) | **No** — deploy, tests, pilot, and gates remain |

**Unconditional GO is not supported by evidence.**

Proceed to production only after Go-Live Gates G1–G10 are closed and fleet cutover (G12) is explicitly approved.

---

## Related documents

| Document | Purpose |
|----------|---------|
| `docs/notification-engine-production-readiness.md` | Prompt 16 baseline |
| `docs/audits/notification-engine-vps-control-audit-2026-07.md` | Prompt 33 |
| `docs/audits/notification-engine-load-resilience-test-2026-07.md` | Prompt 34 |
| `docs/audits/notification-engine-production-pilot-acceptance-2026-07.md` | Prompt 35 |
| `docs/operations/notification-engine-migration-runbook.md` | Migration execution |
| `docs/compliance/notification-engine-audit-iso27001.md` | ISO alignment |
| `docs/compliance/notification-engine-data-protection.md` | GDPR |
| `docs/security/notification-engine-access-control.md` | Access matrix |
