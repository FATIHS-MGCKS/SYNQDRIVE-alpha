# Document Intake V2 — Final Audit (Prompt 84 of 84)

| Field | Value |
|-------|-------|
| **Audit date (UTC)** | 2026-07-17 |
| **Mode** | Read-only audit → P0/P1 fixes only → validation |
| **Branch** | `cursor/document-intake-v2-final-audit-7ddc` |
| **Basis** | [document-intake-v2-implementation-inventory.md](./document-intake-v2-implementation-inventory.md), [document-intake-production-reality.md](./document-intake-production-reality.md), Prompts 82–83 (metrics, runbooks) |
| **Runbooks** | [document-intake-v2-deployment.md](../runbooks/document-intake-v2-deployment.md), [document-intake-v2-shadow-validation.md](../runbooks/document-intake-v2-shadow-validation.md) |

---

## 1. Executive Summary

Document Intake V2 is **architecturally complete** for shadow operation: org-first upload, AUTO classification, structured extraction, entity candidate resolution (suggestion-only), action-plan preview with fingerprint, partial apply lifecycle, follow-up suggestions (no auto-contact), archive read-model, Prometheus/Grafana V2 metrics, and recovery schedulers.

**This audit fixed 7 proven P0/P1 code gaps** (recovery for AUTO, confirm plausibility freshness, org confirm API, drawer awaiting-type UI, action-recovery vehicle guard, processor build regression, org-scoped confirm in frontend hook).

**Production apply at scale remains gated** by rollout flags (documented but not all implemented), shadow validation sampling, and malware-scan configuration discipline.

---

## 2. Findings by Audit Area

Severity: **P0** = blocks safe production; **P1** = material correctness/ops gap; **P2** = polish, test debt, or documented limitation.

### 2.1 PM2 / Worker Stability

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| W-01 | BullMQ `document.extraction` + recovery schedulers (120s pipeline, action apply) wired; `WORKERS_ENABLED` + Redis gate via `canEnqueueQueue` | — | OK |
| W-02 | `recoveryIntervalMs` in config unused (hardcoded `@Interval(120_000)`) | P2 | Open |
| W-03 | Docs mention `WORKERS_ENABLED`; runtime also requires Redis — mismatch in ops messaging | P2 | Open |
| W-04 | PM2 process list not verifiable in Cloud Agent (no VPS SSH in this run) | — | Manual on VPS |

### 2.2 Upload Without Vehicle

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| U-01 | `POST /organizations/:orgId/document-extractions/upload` — `vehicleId` optional, tenant-scoped | — | OK |
| U-02 | Frontend `DocumentUploadView` — upload-first, no vehicle required at idle | — | OK |
| U-03 | Confirm/apply requires vehicle assignment (action plan blocks + `confirmForOrg` validates) | — | By design |

### 2.3 AUTO in All Flows

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| A-01 | Central page + drawer default `AUTO` | — | OK |
| A-02 | Operator `OperatorAiUploadFlow` still shows type picker before OCR | P1 | Open (P2 scope — operator surface) |
| A-03 | E2E fixtures default `SERVICE` not `AUTO` | P2 | Open |

### 2.4 Fields Hidden Before OCR

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| F-01 | Review fields / entity panels gated to `ready` / post-OCR flows | — | OK |
| F-02 | `DocumentIntakeUploadZone` idle — no schema fields | — | OK |

### 2.5 AWAITING_DOCUMENT_TYPE

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| T-01 | Processor sets `AWAITING_DOCUMENT_TYPE` on `AWAIT_USER` classification decision | — | OK |
| T-02 | `DocumentUploadView` — `DocumentClassificationResultPanel` in `awaiting_type` mode | — | OK |
| T-03 | `VehicleDocumentUploadDrawer` lacked awaiting-type panel | P0 | **Fixed** (this PR) |
| T-04 | Org `POST .../document-type` for type correction without vehicle | — | OK |

### 2.6 Content Hash & Deduplication

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| D-01 | `contentSha256` on upload; duplicate assessment in service | — | OK |
| D-02 | Business duplicate warning vs hard block paths | — | OK |
| D-03 | `planContext` not in action-plan fingerprint (TOCTOU on concurrent preference change) | P2 | Open |

### 2.7 BLOCKER Server-Side

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| B-01 | `confirm()` rejects `plausibility.overallStatus === 'BLOCKER'` | — | OK |
| B-02 | Action-plan preview `canConfirm: false` when required actions blocked | — | OK |
| B-03 | Confirm used **stale** persisted plausibility for preview/fingerprint gate | P1 | **Fixed** (fresh plausibility merged before `buildForRecord`) |

### 2.8 Dangerous Defaults

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| DD-01 | `DOCUMENT_MALWARE_SCAN_ENABLED=true` + `DOCUMENT_MALWARE_SCANNER_PROVIDER=unavailable` bricks uploads unless `mock` or `fail-open` | P0 | **Config** — document; default remains `false` |
| DD-02 | `DOCUMENT_RETENTION_ENABLED=false`, `DOCUMENT_RETENTION_DRY_RUN=true` | — | Safe |
| DD-03 | V2 rollout flags (`DOCUMENT_INTAKE_V2_APPLY_ENABLED`, etc.) documented but not all in code | P1 | Open (runbook workaround) |

### 2.9 Real Action Plan

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| P-01 | `DocumentActionOrchestratorService.buildPreviewPlan` — typed executors per document type | — | OK |
| P-02 | Legacy path for non-orchestrated types (`planOutcome: LEGACY`) | — | OK |

### 2.10 Preview & Apply Identical Plan

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| PA-01 | Fingerprint required on confirm for executor path | — | OK |
| PA-02 | Stale plausibility could skew preview vs confirm gate | P1 | **Fixed** |

### 2.11 APPLIED Integrity

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| I-01 | `applyLifecycle` state machine; downstream probe in recovery | — | OK |
| I-02 | Reconciliation CLI reports `APPLIED_WITHOUT_DOWNSTREAM` | — | OK |
| I-03 | UI `canShowApplyDone` — no false success without `applyResult` | — | OK |

### 2.12 Partial Actions

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| PA-03 | `PARTIALLY_APPLIED` + `retry-failed-actions` org/vehicle routes | — | OK |

### 2.13 Idempotency (Downstream Types)

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| ID-01 | Per-action `idempotencyKey` in executors (fine, invoice, damage, service, archive, link) | — | OK |
| ID-02 | Unit specs per executor + `document-extraction.service.queue.spec` confirm idempotency | — | OK (some mocks need observability stubs — pre-existing test debt) |

### 2.14 Fine / Invoice / Damage / Service Links

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| L-01 | Dedicated action executors with downstream keys | — | OK |
| L-02 | `serviceEventId` persisted on apply | — | OK |

### 2.15 Entity Candidate Resolver

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| E-01 | `PartnerCandidateResolverService` + ranking in processor | — | OK |
| E-02 | `DOCUMENT_INTAKE_V2_ENTITY_AUTO_SELECT_ENABLED` not in code — no auto-select | — | OK (default safe) |
| E-03 | Org save-review without vehicle uses degraded plausibility context | P1 | Open (acceptable for org-inbox pre-assign) |

### 2.16 Customer vs Driver

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| C-01 | Separate candidate arrays; UI distinguishes in entity review | — | OK |

### 2.17 Follow-Up Suggestions

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| FU-01 | List/accept/dismiss org routes | — | OK |
| FU-02 | Contact prepare/send requires explicit user action | — | OK |

### 2.18 No Automatic Contact

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| NC-01 | No auto-email on apply; follow-up send is explicit POST | — | OK |
| NC-02 | Tests use mocks; no live Resend in verify harness | — | OK |

### 2.19 Archive & Filters

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| AR-01 | `GET .../archive` with query DTO (5 filter dimensions) | — | OK |
| AR-02 | `DocumentArchivePanel` exposes 2/5 filters in UI | P2 | Open |

### 2.20 Tenant Isolation

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| TI-01 | `OrgScopingGuard` + `getForOrg` / `loadRecordOrThrow` | — | OK |
| TI-02 | `document-intake-v2-tenant-isolation.spec.ts` | — | OK |

### 2.21 Security & Storage

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| S-01 | Private object keys; download via authorized stream | — | OK |
| S-02 | Upload rate limits (org + IP throttle) | — | OK |
| S-03 | Malware scan integration optional | — | OK with DD-01 config discipline |

### 2.22 Monitoring

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| M-01 | 17 V2 Prometheus counters + Grafana dashboard + alert group | — | OK |
| M-02 | `prometheus-config.spec.ts` — 14 tests green | — | OK |
| M-03 | No document IDs / plates in metric labels | — | OK |

### 2.23 Tests

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| TS-01 | Golden corpus spec (T01–T40 matrix dry-run) | — | OK |
| TS-02 | E2E `document-intake-v2-flow.spec.ts` — **9/9 skipped** in CI agent env | P1 | Open |
| TS-03 | ~10 backend unit suites fail on missing `observability` mock methods (metrics branch debt) | P1 | Open |
| TS-04 | Frontend `tsc` build has pre-existing errors unrelated to this PR | P2 | Open |

### 2.24 Legacy Stubs & Parallel Flows

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| LS-01 | `InvoiceExtractionUpload.tsx` unused legacy | P2 | Open |
| LS-02 | `FinesView.AIUploadFlow` parallel (not canonical extraction) | P2 | Documented |
| LS-03 | `createLegacy` disabled on vehicle POST | — | OK |

### 2.25 Queue Recovery (AUTO)

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| QR-01 | Recovery scheduler skipped `QUEUED`/`PROCESSING` when `effectiveDocumentType` null (AUTO) | P1 | **Fixed** |
| QR-02 | Action recovery passed null `vehicleId` to orchestrator | P1 | **Fixed** (`SKIPPED_NO_VEHICLE`) |

### 2.26 Org Confirm API

| ID | Finding | Sev | Status |
|----|---------|-----|--------|
| OC-01 | No `POST .../organizations/:orgId/.../confirm` | P1 | **Fixed** |
| OC-02 | Frontend `handleConfirm` vehicle-only | P1 | **Fixed** (org route when `canUseOrgScope`) |

---

## 3. Fixes Applied (This PR)

| Fix | Files |
|-----|-------|
| Recovery re-enqueue for AUTO / unresolved effective type | `document-extraction-recovery.scheduler.ts`, spec |
| Fresh plausibility on confirm preview/fingerprint | `document-extraction.service.ts` |
| `confirmForOrg` + org controller route | `document-extraction.service.ts`, `document-extraction-org.controller.ts` |
| Action recovery skip without vehicle | `document-intake-action-recovery.service.ts`, `document-intake-reconciliation.types.ts` |
| Drawer `awaiting_type` UI parity | `VehicleDocumentUploadDrawer.tsx` |
| `handleSetDocumentType` + org confirm in intake hook | `useDocumentIntakeFlow.ts`, `useDocumentUploadPage.ts`, `api.ts` |
| Processor syntax + `objectKey` narrowing (build) | `document-extraction.processor.ts` |

---

## 4. Validation Results

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Prisma format/validate | **PASS** | `npm run prisma:validate`, `prisma format` |
| 2 | Migration SQL timestamps | **PASS** | `verify-prisma-migration-timestamps.sh` |
| 3 | Backend tests | **PARTIAL** | Golden corpus, recovery, prometheus, retention: PASS. Broader module suite: observability mock debt (~10 suites) |
| 4 | Backend build | **PASS** | `npm run build` |
| 5 | Frontend tests | **PASS** | `useDocumentIntakeFlow`, classification UI (11 tests) |
| 6 | Frontend build | **FAIL** | Pre-existing `tsc` errors (not introduced by this PR) |
| 7 | E2E | **SKIPPED** | 9/9 tests skipped in agent environment |
| 8 | Queue/recovery smoke | **PASS** | Recovery scheduler unit tests incl. AUTO row |
| 9 | Action-plan dry-run | **PASS** | Golden matrix + `document-action-plan-preview.service.spec` |
| 10 | Apply idempotency | **PASS** | Executor specs + queue confirm spec (with mock caveats) |
| 11 | Reconciliation dry-run | **BLOCKED** | CLI requires live Postgres (`P1001` in agent) |
| 12 | Retention dry-run | **PASS** | `document-retention.service.spec.ts` (8/8) |
| 13 | Golden fixture matrix | **PASS** | `document-intake-golden-corpus.spec.ts` + matrix dry-run |
| 14 | Grafana/Prometheus | **PASS** | Dashboard JSON present; `prometheus-config.spec.ts` |
| 15 | No real email | **PASS** | Follow-up send not invoked in tests; Resend not called in verify |
| 16 | No invented downstream | **PASS** | Golden corpus uses mocks; apply executors probed in unit tests |

---

## 5. Readiness Ratings

| Gate | Rating | Rationale |
|------|--------|-----------|
| **FILE_INTAKE_READY** | **YES** | Org + vehicle upload, dedup, rate limits, storage |
| **OCR_READY** | **YES** (shadow) | Mistral OCR + cache; live integration opt-in |
| **CLASSIFICATION_READY** | **YES** (shadow) | AUTO + `AWAITING_DOCUMENT_TYPE`; drawer parity fixed |
| **EXTRACTION_READY** | **YES** (shadow) | Structured extraction + plausibility |
| **ENTITY_ROUTING_READY** | **PARTIAL** | Candidates + manual confirm; no auto-select |
| **ACTION_PLANNING_READY** | **YES** | Preview + fingerprint; fresh plausibility on confirm |
| **APPLY_READY** | **CONDITIONAL** | Needs vehicle, rollout flags, shadow sampling |
| **FOLLOW_UP_READY** | **YES** | Suggestions; explicit contact only |
| **ARCHIVE_READY** | **YES** | Index + list; UI filters incomplete (P2) |
| **SECURITY_READY** | **CONDITIONAL** | Safe defaults; malware enablement is ops risk |
| **OVERALL_READY** | **NOT_READY** | Full production apply + E2E green + flag implementation |
| **READY_FOR_SHADOW_ONLY** | **YES** | Upload → review → preview without broad apply |
| **NOT_READY** | — | Use for full multi-tenant apply rollout |

---

## 6. Active Feature Flags

### Implemented (code)

| Variable | Default | Effect |
|----------|---------|--------|
| `DOCUMENT_EXTRACTION_QUEUE_ENABLED` | `true` | Queue producer/consumer |
| `DOCUMENT_AI_EXTRACTION_ENABLED` | `true` | Mistral extraction |
| `DOCUMENT_MALWARE_SCAN_ENABLED` | `false` | Malware gate |
| `DOCUMENT_MALWARE_SCANNER_PROVIDER` | `unavailable` | Provider selection |
| `DOCUMENT_MALWARE_SCAN_FAIL_OPEN` | `false` | Fail-closed on scan errors |
| `DOCUMENT_UPLOAD_RATE_LIMIT_ENABLED` | `true` | Rate limits |
| `DOCUMENT_EXTRACTION_ACTION_RECOVERY_ENABLED` | `true` | Action recovery scheduler |
| `DOCUMENT_RETENTION_ENABLED` | `false` | Retention off |
| `DOCUMENT_RETENTION_DRY_RUN` | `true` | Dry-run when enabled |
| `WORKERS_ENABLED` | `true` | Worker processes |

### Documented target contract (not all in code yet)

| Variable | Phase-0 default |
|----------|-----------------|
| `DOCUMENT_INTAKE_V2_APPLY_ENABLED` | `false` |
| `DOCUMENT_INTAKE_V2_LEGACY_APPLY_ENABLED` | `true` |
| `DOCUMENT_INTAKE_V2_EXECUTOR_ALLOWLIST` | empty |
| `DOCUMENT_INTAKE_V2_FOLLOW_UP_MATERIALIZE_ENABLED` | `false` |
| `DOCUMENT_INTAKE_V2_ARCHIVE_APPLY_ENABLED` | `false` |
| `DOCUMENT_INTAKE_V2_ORG_UPLOAD_ENABLED` | `true` |
| `DOCUMENT_INTAKE_V2_ENTITY_AUTO_SELECT_ENABLED` | `false` |

---

## 7. Remaining Limitations

1. V2 rollout flags not fully implemented — use runbook workaround (restrict confirm to ops accounts).
2. E2E flow spec entirely skipped in CI agent — enable before production sign-off.
3. Backend unit test mocks need `observability` stubs after metrics instrumentation.
4. Operator upload not AUTO-first.
5. Archive UI exposes subset of server filters.
6. Org pipeline `retry` still vehicle-scoped only.
7. Reconciliation CLI requires DB connectivity for runtime dry-run.

---

## 8. Safe Production Activation Order

1. Deploy code with **apply disabled** (workaround or future `DOCUMENT_INTAKE_V2_APPLY_ENABLED=false`).
2. Verify PM2 workers + Redis + queue recovery (Grafana V2 dashboard).
3. Enable org upload (already default); monitor upload funnel metrics.
4. Shadow validation: PDF + image + type sample per [shadow runbook](../runbooks/document-intake-v2-shadow-validation.md).
5. Enable classification/extraction (queue + Mistral) — no confirm for end users.
6. Entity resolution in **suggestion-only** mode.
7. Action-plan preview only (no confirm).
8. Compare shadow metrics vs human decisions.
9. Enable executor allowlist one semantic action at a time.
10. Canary follow-up accept on internal org.
11. Enable archive apply executor.
12. Malware scan canary (`mock` or real provider + fail-open policy).
13. Retention dry-run on staging DB; never `DOCUMENT_RETENTION_DRY_RUN=false` without DBA.
14. Disable legacy apply for orchestrated types when V2 path proven.

---

## 9. Changes & Architektur

- **Changes:** V4.9.659 entry added.
- **Architektur:** Final-audit recovery/confirm/org-route notes added.

---

*End of Document Intake V2 Final Audit (Prompt 84/84).*
