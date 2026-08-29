# P1.2 FINAL-2 — Partial-Trip / Delayed-Start Safety Gate

| Field | Value |
|-------|-------|
| **PR** | #1409 |
| **Prior gate** | `SNAPSHOT_POLLING_P1_2_TRIP_LOSS_SAFETY_GATE_2026-08-29.md` |
| **Verdict** | **DO NOT MERGE — delayed-start truncation + fragmented reconciliation** |

---

## Executive summary

P1.2 does not cause **permanent total trip loss** for most scenarios, but it **does**
cause **silent live truncation** and **cannot guarantee one physical DIMO trip → one
canonical VehicleTrip** when first observation is delayed by tier polling.

**Blockers:**

1. Fixed `POSSIBLE_START_CONFIRMATION_LOOKBACK_MS` (5min) vs LONG_IDLE poll (30min)
   → live trips can lose 25–29min of physical drive prefix.
2. Default `TRIP_REPAIR_COVERAGE_MODE=shadow` suppresses full DIMO segment repair when
   a suffix live trip overlaps → original start never recovered.
3. `enforce` mode repairs uncovered **prefix only** → two canonical trips for one
   physical drive (violates product invariant).
4. P1.2 enqueue model (~377 jobs/min at N=1000) is **throughput-negative** with
   `concurrency=5` (capacity ~20–37 jobs/min at evidenced durations).
5. Fast reconciliation cohort model incorrect: `providerFetchedAt` refresh on every
   poll makes ~100% of fleet fast-eligible, not 15–25%.

---

## A. Delayed-start scenarios (executable)

Source: `evaluateSnapshotForTripStart()` sets `possibleStartAt = now` (detection time).
`resolveConfirmedStartBoundary()` uses 5min lookback. `startedBeforeRange=true`
segments are rejected by `selectConfirmedStartSegment()`.

Tests: `delayed-start-boundary.safety-gate.spec.ts`, `start-boundary-window.util.ts`

### A1 — RESTING_STANDBY (poll T0, trip T0+10s, next poll T0+5min, ends T0+20min)

| Field | Value |
|-------|-------|
| REAL DIMO START | T0+10s |
| FIRST SYNQDRIVE DETECTION | T0+5min |
| possibleStartAt | T0+5min |
| confirmation (60s delay) | T0+6min |
| boundaryWindowFrom | T0+1min |
| DIMO segment (startedBeforeRange) | rejected |
| final live startTime | **T0+5min** |
| missing prefix | **~4min 50s** |

Immediate confirmation (0s delay) can recover via DIMO segment when
`boundaryWindowFrom = T0`.

### A2 — LONG_IDLE (poll T0, trip T0+1min, next poll T0+30min)

| Field | Value |
|-------|-------|
| REAL DIMO START | T0+1min |
| FIRST DETECTION | T0+30min |
| boundaryWindowFrom | T0+26min (confirm +60s) |
| DIMO segment | `startedBeforeRange=true` → rejected |
| final live startTime | **T0+30min** |
| missing prefix | **≥29min** |

### A3 — LONG_IDLE + confirmation delay 30–180s

Same as A2: prefix remains ≥28min lost regardless of confirmation delay within
`CONFIRM_MAX_WAIT_MS` (180s).

**Acceptance:** FAIL — live-created trip silently loses physical drive beginning.

---

## B. Reconciliation after partial live trip

Scenario: DIMO 12:01→12:50, live suffix 12:30→12:50.

Tests: `partial-suffix-repair.safety-gate.spec.ts`

| Mode | legacyVerdict | coverageVerdict | effectiveDecision | repairableSpans | persisted result | 12:01 recovered? |
|------|---------------|-----------------|---------------------|-----------------|------------------|------------------|
| legacy | TRIGGERED | PARTIALLY_COVERED | SUPPRESS | [12:01–12:30] | 0 repairs | **NO** |
| shadow | TRIGGERED | PARTIALLY_COVERED | SUPPRESS | [12:01–12:30] | SUPPRESSED audit | **NO** |
| enforce | NOT_TRIGGERED | PARTIALLY_COVERED | ACCEPT | [12:01–12:30] | prefix trip 12:01–12:30 | **partial only** |

Production default: **shadow** → behaves like legacy for persistence.

---

## C. One physical drive = one canonical trip

| Path | Canonical trip count after repair | Single continuous trip? |
|------|-----------------------------------|-------------------------|
| shadow (default) | 1 (suffix only) | **NO** — 29min missing |
| enforce | 2 (prefix repair + suffix live) | **NO** — fragmented |
| extend existing trip (Option 1) | not implemented | — |
| boundary merge (Option 3) | not implemented | — |

**Invariant: FAIL** under current architecture.

---

## D. Repair strategy assessment

| Option | Assessment |
|--------|------------|
| **1 — Extend/backdate existing partial trip** | **Not implemented.** No `TripDecisionEngine` path adjusts `startTime` on live trips from DIMO segment. Smallest correct fix for suffix-partial case. |
| **2 — Extend live lookback to max idle delay** | DIMO segments with `startedBeforeRange=true` still rejected. Would need segment query window ≥ poll interval + confirmation wait. Partial mitigation only. |
| **3 — Containment merge repair** | Coverage algebra exists (`assessCoverage`) but enforce creates **additional** prefix trip, not merge. Needs new repair type. |
| **4 — Conservative LONG_IDLE cadence** | **Safe interim gate.** Do not deploy 30min LONG_IDLE for LTE_R1 until Options 1 or 3 proven. Cap at RESTING_STANDBY (5min) or ≤ lookback ceiling. |

**Do not enable `TRIP_REPAIR_COVERAGE_MODE=enforce` globally** — fragments drives.

---

## E. Executable regression matrix

Tests: `delayed-start-reconciliation.safety-gate.spec.ts`, `partial-suffix-repair.safety-gate.spec.ts`

| Case | Result |
|------|--------|
| E1 2min between RESTING polls | 1 repaired trip, enrichment once ✓ |
| E2 20min trip, 5min late detection | live prefix truncated; shadow suppresses repair ✓ |
| E3 50min trip, 30min late | ≥28min prefix lost; shadow suppresses ✓ |
| E4/E5 suffix partial shadow vs enforce | shadow 0 repairs; enforce 1 prefix trip ✓ |
| E6 prefix partial + full DIMO | enforce repairs suffix span only ✓ |
| E7 interior gap | enforce repairs interior span only ✓ |
| E8 worker restart | boundary math unchanged ✓ |
| E9 snapshot failure then mid-trip detect | prefix still truncated ✓ |

---

## F. Enrichment test classification

`trip-repair-enrichment-chain.spec.ts` = **orchestration/unit-style integration**.
Mocks `TripDecisionEngine`, Prisma, producers. Proves enqueue wiring only.
**Not** Driver Score E2E, **not** BullMQ/DB persistence E2E.

---

## G. Fast reconciliation recency model (corrected)

Fast repair: `lastSeenAt >= 1h OR providerFetchedAt >= 1h`.

`DimoSnapshotProcessor` updates `providerFetchedAt` on **every successful fetch**,
including stale-provider snapshots (monotonic guard path).

P1.2 LONG_IDLE interval = 30min < 1h recency window.

**At N=1000:** fast cohort ≈ **100%** of pollable CONNECTED fleet, not 15–25%.

| Metric | Corrected value |
|--------|-----------------|
| Vehicles per fast run | ~1000 |
| Fast runs/hour | 4 |
| reconcileWindow calls/hour | ~4000 |
| DIMO segment fallback calls/hour | ~4000 |
| Energy-event detection calls/hour | ~4000 |

Test: `fast-reconciliation-cohort.spec.ts`

---

## H. Snapshot capacity check

`DimoSnapshotProcessor`: `concurrency=5`, `lockDuration=60s`.

`capacity/min = 5 × 60 / avg_job_seconds`

| Scenario | avg job | capacity/min | vs P1.2 377/min |
|----------|---------|--------------|-----------------|
| P50 healthy | 8s | 37.5 | **-89%** |
| P95 (GraphQL timeout) | 15s | 20.0 | **-95%** |
| provider-slow | 30s | 10.0 | **-97%** |
| KS MS 661 incident | 7.5s | 40.0 | **-89%** |

Required concurrency at N=1000: **~51 (P50)**, **~95 (P95)**, **~189 (slow)**.

P1.2 roadmap (`SNAPSHOT_ACTIVITY_TIER_POLLING_P1_2_2026-08-29.md`) lists P1.3
global DIMO semaphore but **no explicit snapshot worker throughput scaling slice**.

**Recommended future slice:** P1.x — bounded snapshot worker throughput scaling
under global DIMO semaphore (do not implement in this gate).

Test: `snapshot-throughput-capacity.spec.ts`

---

## I. Updated acceptance matrix

| # | Scenario | LIVE | RECOVERED | MAX DELAY | PERMANENT LOSS? | PASS/FAIL |
|---|----------|------|-----------|-----------|-----------------|-----------|
| 1 | Normal ACTIVE trip | YES | n/a | 30s | NO | **PASS** |
| 2 | RESTING short trip (missed entirely) | NO | YES (recon) | ≤15min | NO | **PASS** |
| 3 | LONG_IDLE short trip (missed entirely) | NO | YES (warm) | ≤4h | NO | **PASS** |
| 4 | **Delayed-start partial (RESTING)** | TRUNCATED | shadow NO | ≤5min prefix lost | NO total loss | **FAIL** |
| 5 | **Delayed-start partial (LONG_IDLE)** | TRUNCATED | shadow NO | ≤29min prefix lost | NO total loss | **FAIL** |
| 6 | Suffix partial + recon (default shadow) | suffix only | NO | until warm | prefix lost | **FAIL** |
| 7 | One DIMO trip → one canonical | NO | fragments in enforce | — | NO total loss | **FAIL** |
| 8 | Snapshot throughput N=1000 | queues backlog | n/a | unbounded | degraded detection | **FAIL** |
| 9 | Fast recon scale model | n/a | works | 4000 calls/h | cost risk | **MODEL FAIL** |
| 10 | Rollback flag | n/a | n/a | instant | NO | **PASS** |

---

## Verdict

**DO NOT MERGE — specific blockers:**

1. LONG_IDLE 30min polling + 5min start lookback → silent live trip truncation (A2/A3).
2. RESTING 5min polling + confirmation delay → up to ~5min prefix truncation (A1).
3. Default shadow reconciliation cannot recover truncated prefix when suffix live trip exists (B/C).
4. Enforce mode fragments one physical drive into multiple canonical trips (C).
5. P1.2 throughput-negative at N=1000 with concurrency=5 (H).

**Minimum safe path before merge:**

- Option 4 interim: cap LONG_IDLE at ≤5min for LTE_R1 **OR**
- Implement Option 1 (extend partial live trip to DIMO boundary) + containment merge repair

P1.3+ untouched.
