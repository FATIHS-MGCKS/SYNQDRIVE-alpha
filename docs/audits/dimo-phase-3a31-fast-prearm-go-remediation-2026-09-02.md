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

**RD002 freeze:** `MAX_FAST_GO_TIMEOUT_MS = 15_000`. Production env cannot extend FAST GO beyond 15 seconds. Invalid values (`<=0`, `NaN`, `Infinity`, `>15000`) resolve to the 15s default. Lower values are permitted when intentionally configured.

### One absolute operator-critical deadline

```
goRequestedAtMs = Date.now()   // BEFORE any HTTP work
goDeadlineAtMs  = goRequestedAtMs + timeoutMs
```

This single budget covers:

- initial session GET
- freshness gates
- `POST /start`
- RECORDING confirmation
- first autonomous cycle completion
- signal observation persistence
- **runner continuity proof**

There is **no** second timer started after `POST /start`.

### Deadline-aware HTTP

`ReferenceCaptureOpsHttpClient` accepts `goDeadlineAtMs` per request:

```
remainingMs = goDeadlineAtMs - Date.now()
requestTimeoutMs = min(defaultHttpMax, remainingMs)
```

If `remainingMs <= 0`, the client does not issue the request (`budgetExhausted`).

### Canonical GO success invariant

`isFastGoReadyToDrive()` / `assessFastGoReadiness()` require **all**:

| Requirement | Authority |
|-------------|-----------|
| `status === RECORDING` | session |
| `cycleCount >= 1` | acquisition state |
| `signalPointCount >= 1` (`observationKind === SIGNAL_POINT` only) | observations API |
| `runnerJobId != null` | session |
| runner continuity proven | `pendingCycleJobId` **or** `activeCycleJobId` |

**SIGNAL_POINT-only gate:** `PROBE_RESULT`, `SEGMENT`, `NATIVE_EVENT`, and `SESSION_METADATA` may be reported as diagnostics but **cannot** satisfy `SIGNAL_PERSISTENCE_REQUIRED`. Shared predicate: `countPersistedSignalPoints()`.

`isRunnerContinuityProven()` — after cycle N completes, `scheduleNextCycle` normally sets `pendingCycleJobId` to N+1. Legitimate transient: `activeCycleJobId` set while N+1 is already executing.

### Ambiguous POST /start timeout — `AMBIGUOUS_START_SESSION_FENCING`

`CLIENT_TIMEOUT != SERVER_DID_NOT_START`. A mutating `POST /start` may still be in flight server-side even when the HTTP client times out, loses connection, exhausts GO budget, or receives HTTP 5xx after partial mutation.

**Client timeout ≠ server cancellation.** A cleanup `GET` observing `READY` with no runner artifacts is an observation, not proof that no delayed mutation exists.

When `isAmbiguousMutatingStartHttpOutcome()` is true (`timedOut`, `budgetExhausted`, HTTP 5xx — not 401/403):

1. `READY_TO_DRIVE = NO` (never YES)
2. Immediate bounded reconciliation via `reconcileAmbiguousStartViaHttp()` (3s cleanup budget, separate from GO window)
3. `GET` session → if status is `READY`, `STARTING`, or `RECORDING`, call canonical authenticated `abort` (**session fencing**)
4. Verify terminal/non-active state: status ∉ `{READY, STARTING, RECORDING}`; `runnerJobId`, `pendingCycleJobId`, `activeCycleJobId` all null
5. Report `COMPENSATION_CONFIRMED` or `COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED`

A `READY` session after ambiguous START is **intentionally sacrificed** (`READY → ABORTED`) to establish a CAS fencing barrier. A delayed original `/start` can no longer win `READY → STARTING`. Operator must run a new PRE-ARM before another reference attempt.

`COMPENSATION_CONFIRMED` requires terminal non-running state — never while session remains `READY`.

Generic post-GO cleanup (`runBoundedSessionCleanup`) retains prior semantics for non-ambiguous failures.

Never silently return after ambiguous START.

### Idempotent RECORDING with bounded wait

`READY_TO_DRIVE = YES` on already-RECORDING sessions **only** when the full invariant above is proven. No duplicate runner enqueue.

When RECORDING but invariant not yet proven, both the HTTP ops script and `ReferenceCaptureFastGoService` continue bounded polling until the same absolute `goDeadlineAtMs` when `shouldContinueFastGoWait()` indicates plausibly progressing state (e.g. `cycleCount === 0` with valid runner pending/active; `cycleCount >= 1` awaiting signal visibility). Terminal/broken runner states return `NO` immediately.

### Timeout compensation

On deadline expiry:

1. Banner: `READY_TO_DRIVE = NO` (never YES)
2. Bounded cleanup (`FAST_GO_CLEANUP_TIMEOUT_MS` = 3s, separate from GO budget)
3. Report `COMPENSATION_CONFIRMED` or `COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED` — never `compensated: true` without verification

### Timestamp semantics

| Field | When set |
|-------|----------|
| `goRequestedAt` | Operator GO command start |
| `goDeadlineAt` | `goRequestedAt + timeout` |
| `startRequestStartedAt` | Before `POST /start` |
| `startAcceptedAt` | HTTP 200/201 on start only — **not** set on ambiguous timeout |
| `recordingEnteredAt` | Observed when session.status becomes RECORDING (HTTP poll); null if unobserved |
| `firstCycleStartedAt` | Observed when `activeCycleJobId` first seen; null if unobserved |
| `firstCycleCompletedAt` | Observed when `cycleCount >= 1` first seen; confirmation timestamp only |
| `runnerContinuityConfirmedAt` | When continuity invariant proven |
| `readyToDriveAt` | When full invariant proven |

Do not fabricate exact physical-event timestamps from later HTTP observations.

---

## Failure compensation

| Failure point | Safe path |
|---------------|-----------|
| STARTING CAS lost | Second GO rejected; no duplicate runner |
| BullMQ enqueue failure | `startRecording` reverts to `READY` (existing 3A.1 behavior) |
| Ambiguous POST /start timeout | `reconcileAmbiguousStartViaHttp()` → fence READY/STARTING/RECORDING via abort → verify terminal state |
| First-cycle timeout | `abortSession(fast_go_deadline_exceeded)` + bounded verify |
| Already RECORDING | Bounded wait until invariant proven or deadline; no second runner |

---

## Runtime health (HTTP path)

The HTTP-only FAST GO path does **not** call `ReferenceCaptureRuntimeHealthService` directly.

**Rationale:** Production `POST /start` already requires a live Nest process, BullMQ queue registration, and successful runner enqueue. First-cycle completion + runner continuity proof from session state is sufficient lightweight runtime evidence for the operator GO window. The in-process `ReferenceCaptureFastGoService` retains explicit queue/storage checks for unit/integration testing without HTTP.

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
| FAST GO policy (SIGNAL_POINT gate, 15s cap) | `reference-capture-fast-go.policy.spec.ts` |
| FAST GO workflow (ambiguous START compensation matrix) | `reference-capture-fast-go.workflow.spec.ts` |
| FAST GO service | `reference-capture-fast-go.service.spec.ts` |
| HTTP client (deadline + AbortSignal) | `reference-capture-ops-http.client.spec.ts` |
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
