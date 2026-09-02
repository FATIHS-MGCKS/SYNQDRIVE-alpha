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
| `reference-capture-lte-r1-prearm.ts` | Ops PRE-ARM command |
| `reference-capture-lte-r1-fast-go.ts` | Ops FAST GO command (HTTP client) |
| `reference-capture-ops-http.client.ts` | Authenticated production API client |
| `reference-capture-prearm.policy.ts` | Freshness + status rejection rules |
| `ReferenceCaptureFastGoService` | In-process GO orchestration (tests + future internal use) |
| `ReferenceCaptureSessionService.startRecording` | Canonical start authority (unchanged CAS) |

## Config

| Env | Default | Purpose |
|-----|---------|---------|
| `REFERENCE_CAPTURE_PREARM_MAX_AGE_MS` | 900000 (15 min) | Max READY session age before re-PRE-ARM |
| `REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS` | 15000 | Hard first-cycle deadline |
| `REFERENCE_CAPTURE_OPS_API_BASE_URL` | — | Production API base for FAST GO |
| `REFERENCE_CAPTURE_OPS_BEARER_TOKEN` | — | Operator JWT (runtime secret) |

## Invariants preserved

- No second start state machine
- CAS `READY→STARTING` remains authoritative for concurrent GO
- HF watermark / `physicalSampleFingerprint` semantics unchanged (3A.3.2)
- Trip enrichment, scoring, Driver Quality, Vehicle Load untouched

## Status

- `PHASE_3A3_1_CODE_READY = YES`
- `PHASE_3A3_1_PRODUCTION_VALIDATED = NO` (canary required)
