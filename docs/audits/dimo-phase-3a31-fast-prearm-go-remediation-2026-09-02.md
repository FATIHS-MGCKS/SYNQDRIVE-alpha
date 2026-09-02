# Phase 3A.3.1 — FAST PRE-ARM / GO Workflow Remediation

**Date:** 2026-09-02  
**Evidence ID:** DI-EV-0020  
**Status:** `PHASE_3A3_1_CODE_READY = YES` · `PHASE_3A3_1_PRODUCTION_VALIDATED = NO`

---

## RD001 defect authority

Reference Drive #001 exposed an unacceptable operator workflow:

| Field | Value |
|-------|-------|
| `sessionStartedAt` | `2026-09-01T19:00:43.252Z` |
| First successful acquisition | `2026-09-01T19:12:27.239Z` |
| Gap | **703.987 s** |

The owner could not wait for a trustworthy GO signal and left without starting Ground Truth video. Root cause: the monolithic ARM script performed expensive work on the operator-critical path (full `AppModule` bootstrap, vehicle resolution, session creation, full preflight, start, and long wait for first acquisition).

`ARM_WORKFLOW_REMEDIATION_REQUIRED = YES` (addressed in this phase at code level; production canary pending).

---

## Old workflow (superseded)

`backend/scripts/ops/reference-capture-lte-r1-reference-drive-arm.ts` — single command:

1. `AppModule.forRootAsync()` + `NestFactory.createApplicationContext`
2. Vehicle resolution
3. Session create + full preflight + **start recording**
4. Poll up to ~12 minutes for first acquisition

**Problem:** Operator must be physically ready during minutes of bootstrap and preflight.

---

## New two-stage workflow

### STAGE A — PRE-ARM

**Script:** `backend/scripts/ops/reference-capture-lte-r1-prearm.ts`

May run minutes before departure. Expensive work allowed:

- Vehicle resolution (exactly one LTE_R1)
- Dependency health via production preflight
- Session create + full preflight
- Capability discovery + broad manifest compile
- Readiness assessment

**Stops at:** `SESSION_STATUS = READY` — no runner, no acquisition cycles, no `startedAt`.

**Output:** `PREARM_READY = YES/NO` + machine-readable session metadata.

**Args:** `--organization-id`, `--vehicle-id` OR `--license-plate`, `--reference-drive-id`, `--confirm-prearm`

### STAGE B — FAST GO

**Script:** `backend/scripts/ops/reference-capture-lte-r1-fast-go.ts`

Executed only when owner is physically ready.

**Does NOT:** create session, rerun full preflight, bootstrap Nest, perform broad capability discovery, or wait minutes.

**Args:** `--organization-id`, `--vehicle-id`, `--session-id`, `--confirm-fast-go`

**Env:**

- `REFERENCE_CAPTURE_OPS_API_BASE_URL` (or `SYNQDRIVE_API_BASE_URL`)
- `REFERENCE_CAPTURE_OPS_BEARER_TOKEN` (operator JWT with `fleet-condition:write`)

---

## Authority path

FAST GO invokes the **canonical production HTTP route**:

```
POST /organizations/:orgId/vehicles/:vehicleId/reference-capture/sessions/:sessionId/start
```

This delegates to `ReferenceCaptureSessionService.startRecording()`:

- `READY` → `STARTING` (CAS)
- `runnerService.startRunner()` + first BullMQ job enqueue
- `STARTING` → `RECORDING`

No second divergent start-state machine. In-process `ReferenceCaptureFastGoService` mirrors the same domain primitives for unit/integration testing without HTTP.

---

## Security model

| Requirement | Implementation |
|-------------|----------------|
| No unauthenticated production endpoint | FAST GO uses existing guarded controller |
| No hardcoded JWT/cookie/API key in repo | `REFERENCE_CAPTURE_OPS_BEARER_TOKEN` runtime env only |
| No credential logging | HTTP client sets `Authorization` header only; never logs it |
| Permission enforcement | `OrgScopingGuard` + `RolesGuard` + `PermissionsGuard`; `fleet-condition:write` for start/abort |

Unauthorized requests receive **401/403** from production API (operator must supply valid scoped JWT).

---

## PRE-ARM freshness contract

Configurable via `REFERENCE_CAPTURE_PREARM_MAX_AGE_MS` (default **15 minutes**).

FAST GO lightweight gates (no silent full preflight rerun):

- Session still `READY`
- `deploymentPreflightReady === true`
- Preflight/readiness assessedAt present and within max age
- Manifest version matches frozen manifest
- Vehicle matches session
- `REFERENCE_CAPTURE_ENABLED=true`
- Runtime queue/storage reachable (lightweight health)

Stale pre-arm → `READY_TO_DRIVE = NO` + `prearm_stale_requires_new_prearm`.

---

## Hard 15s GO gate

`REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS` (default **15000**).

FAST GO must confirm within deadline:

1. Session enters `RECORDING`
2. First autonomous cycle completes (`cycleCount >= 1`)
3. Signal observations persist
4. Next cycle scheduled (`pendingCycleJobId` set)

If timeout: `READY_TO_DRIVE = NO` + **abort compensation** via production `POST .../abort` — no zombie `RECORDING` session.

**Operator output order (safety):** banner first (`READY_TO_DRIVE = YES/NO`), technical metadata only after.

---

## Failure compensation

| Failure point | Safe path |
|---------------|-----------|
| STARTING CAS lost | Second GO rejected; no duplicate runner |
| BullMQ enqueue failure | `startRecording` reverts to `READY` (existing 3A.1 behavior) |
| First-cycle timeout | `abortSession(fast_go_first_cycle_timeout)` |
| Already RECORDING | Idempotent status if `cycleCount >= 1`; no second runner |

---

## Observability timestamps

Operational SynqDrive timestamps (not provider timestamps):

- `prearmCompletedAt` (PRE-ARM JSON output)
- `goRequestedAt`, `startAcceptedAt`, `recordingEnteredAt`
- `firstCycleStartedAt`, `firstCycleCompletedAt`, `readyToDriveAt`

Enables later calculation of `PREARM_DURATION`, `GO_TO_RECORDING`, `GO_TO_FIRST_CYCLE`, `GO_TO_READY_TO_DRIVE`.

Session view extended with `operational` block: `cycleCount`, `runnerJobId`, `pendingCycleJobId`, `preflightAssessedAt`, `activeCycleJobId`.

---

## Test evidence (code/CI)

| Area | Tests |
|------|-------|
| Prearm freshness policy | `reference-capture-prearm.policy.spec.ts` |
| FAST GO service | `reference-capture-fast-go.service.spec.ts` |
| Controller security | `reference-capture-controller.security.spec.ts` |
| Ops script contract | Static analysis in fast-go spec (no Nest bootstrap on GO path) |
| Concurrent start CAS | Session service + fast-go spec |

**Not claimed:** `CONFIRMED_FROM_RUNTIME` — requires production canary (Phase 3A.3.1 A+B).

---

## Limitations

- FAST GO HTTP path requires running production API + valid operator JWT at GO time.
- PRE-ARM still bootstraps Nest (acceptable — not operator-critical).
- HF watermark / aggregate fingerprint semantics **unchanged** (Phase 3A.3.2).
- RD002 **not started**; `READY_FOR_RD002 = NO`.

---

## Production canary requirement

Before `PHASE_3A3_1_PRODUCTION_VALIDATED = YES`:

1. Run PRE-ARM on production LTE_R1 vehicle → verify `PREARM_READY=YES`, status `READY`.
2. Run FAST GO within freshness window → verify `READY_TO_DRIVE=YES` within 15s.
3. Record operational timestamps for canary evidence (DI-EV-0021+).

---

## Related artifacts

| Artifact | ID |
|----------|-----|
| This report | DI-EV-0020 |
| RD001 capture report | DI-EV-0016 |
| Architecture record | `architecture/DIMO_LTE_R1_PHASE_3A31_FAST_PREARM_GO_2026-09-02.md` |
