# Architecture — Phase 3A.3.1 FAST PRE-ARM / GO Workflow

**Date:** 2026-09-02  
**Evidence:** DI-EV-0020

## Problem

RD001 monolithic ARM script blocked the operator for ~704s before first acquisition while session was already `RECORDING`.

## Solution

Split into two operational stages:

```
PRE-ARM (expensive, minutes OK)          FAST GO (seconds only)
─────────────────────────────           ────────────────────────
Nest bootstrap OK                       HTTP API only — NO Nest bootstrap
createSession + runPreflight            GET session + freshness gates
→ READY                                 POST /start (canonical startRecording)
no runner / no startedAt                poll ≤15s for cycleCount≥1 + observations
                                        → READY_TO_DRIVE banner
                                        timeout → POST /abort
```

## Components

| Component | Role |
|-----------|------|
| `reference-capture-fast-go.policy.ts` | **Shared predicates** — deadline math (15s cap), `countPersistedSignalPoints` (SIGNAL_POINT only), `isRunnerContinuityProven`, `shouldContinueFastGoWait`, compensation helpers |
| `reference-capture-fast-go.workflow.ts` | HTTP workflow — `evaluateRecordingSessionViaHttp`, `reconcileAmbiguousStartViaHttp`, `runBoundedSessionCleanup` |
| `reference-capture-lte-r1-prearm.ts` | Ops PRE-ARM command |
| `reference-capture-lte-r1-fast-go.ts` | **Production operational authority** — ops FAST GO via HTTP |
| `reference-capture-ops-http.client.ts` | Deadline-aware authenticated production API client (AbortSignal per request) |
| `ReferenceCaptureFastGoService` | In-process mirror of same invariant (tests; optional internal use) |
| `ReferenceCaptureSessionService.startRecording` | Canonical start authority (unchanged CAS) |

**Parity rule:** HTTP ops script and `ReferenceCaptureFastGoService` both call `reference-capture-fast-go.policy.ts` predicates and `shouldContinueFastGoWait()` — equivalent state-transition semantics, not merely shared final predicate.

## Config

| Env | Default | Purpose |
|-----|---------|---------|
| `REFERENCE_CAPTURE_PREARM_MAX_AGE_MS` | 900000 (15 min) | Max READY session age before re-PRE-ARM |
| `REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS` | 15000 | Hard first-cycle deadline (**max 15000** — RD002 freeze) |
| `REFERENCE_CAPTURE_OPS_API_BASE_URL` | — | Production API base for FAST GO |
| `REFERENCE_CAPTURE_OPS_BEARER_TOKEN` | — | Operator JWT (runtime secret) |

## Ambiguous START reconciliation — `AMBIGUOUS_START_SESSION_FENCING`

Mutating `POST /start` outcomes classified by `isAmbiguousMutatingStartHttpOutcome()`:

| Outcome | Reconcile? |
|---------|------------|
| `timedOut` / `budgetExhausted` | YES |
| HTTP 5xx | YES |
| HTTP 401/403 | NO (definitive auth failure) |
| HTTP 4xx (other) | NO unless proven ambiguous |

On ambiguous outcome, FAST GO:

1. Prints `READY_TO_DRIVE = NO`
2. Runs `reconcileAmbiguousStartViaHttp()` within 3s cleanup budget
3. **Fences** session if `READY`, `STARTING`, or `RECORDING` via canonical `abort`
4. Verifies terminal/non-active state with no runner artifacts

Delayed original `/start` cannot succeed after fence moves session to `ABORTED` (CAS `READY → STARTING` blocked).

Generic `runBoundedSessionCleanup()` semantics unchanged for non-ambiguous post-GO failures.

## STATE_MACHINE_COMPENSATION_OWNERSHIP

Compensation may revert only the transition it owns and only while the expected intermediate state remains current.

| Path | Owned transition | Mechanism |
|------|------------------|-----------|
| `startRecording()` failure rollback | `STARTING → READY` | `updateStatusIfCurrent(STARTING, READY)` — never unconditional |
| Ambiguous START fence | `READY/STARTING/RECORDING → ABORTED` | canonical `abortSession` |
| Generic post-GO cleanup | `STARTING/RECORDING → terminal` | `runBoundedSessionCleanup` |

If `STARTING → READY` compensation loses CAS (e.g. concurrent fence moved session to `ABORTED`), the stale start handler **must not** resurrect the session. Diagnostics report the actual latest status.

**Audit (3A.3.1 start lifecycle):** Only `startRecording()` catch used unconditional `updateStatus(..., READY)` — corrected. `abortSession` uses unconditional `ABORTED` as intentional fencing authority. `stopRecording` / preflight paths are outside ambiguous-START scope.

## SIGNAL_POINT gate

Ground Truth GO requires `observationKind === SIGNAL_POINT`. `PROBE_RESULT`, `SEGMENT`, `NATIVE_EVENT`, `SESSION_METADATA` are diagnostics only.

## Invariants preserved

- No second start state machine
- CAS `READY→STARTING` remains authoritative for concurrent GO
- HF watermark / `physicalSampleFingerprint` semantics unchanged (3A.3.2)
- Trip enrichment, scoring, Driver Quality, Vehicle Load untouched

## Status

- `PHASE_3A3_1_CODE_READY = YES`
- `PHASE_3A3_1_PRODUCTION_VALIDATED = NO` (canary required)
