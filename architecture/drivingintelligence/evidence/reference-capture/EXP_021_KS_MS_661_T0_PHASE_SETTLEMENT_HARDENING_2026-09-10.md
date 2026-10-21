# EXP-021 — KS MS 661 T0 / Phase Boundary / Settlement Deadline Hardening (2026-09-10)

**Vehicle:** KS MS 661 · Audi A4 · token **187361** · `c10351f8-b6a2-4258-947f-631aeaa6d359`  
**Session:** `8374c2fc-9a62-47cd-97af-3d013338218d`  
**Orchestrator run:** `exp021-1789016631152`  
**Status:** **PARTIAL_EXP021_TELEMETRY_ONLY_RUN** — forensic root cause confirmed; hardening implemented (draft PR, not deployed)

> No new physical drive. No merge/deploy. Production trace treated as sealed evidence input.

---

## Production failure trace (confirmed)

| Finding | Value |
|---------|-------|
| `T0_DETECTED` (orchestrator log) | **NO** — no `PHYSICAL_DRIVE_START_DETECTED` in JSONL |
| Orchestrator fatal | `2026-09-10T05:43:31.291Z` — `Requested calibration phase 60000ms matches current effective phase` |
| RC session | `COMPLETED` at `05:43:31` (started `05:04:09`) |
| Stationary phase-60 pre-arm | `05:07:22` — **12/12 PRE-T0 settlement probes** (all `ZERO_RESULT`) |
| Movement in RC obs | 18 speed samples ≥8 km/h, `05:42:11`–`05:42:56` (~45s) |
| Cadence 60→30→20→10 | **Never ran** |
| PDI | **0/6** |
| WHOLE_TRIP | **6/6** via `SESSION_ENVELOPE_FALLBACK` after session stopped |
| `PRIMARY_GAP_SETTLEMENT_ANALYSIS_VALID` | **NO** |

**Evidence paths (production):**
- `/opt/synqdrive/shared/reference-evidence/exp-021-autonomous-orchestrator.jsonl`
- `/opt/synqdrive/shared/reference-evidence/exp021-orchestrator-20260910T050348Z.log`

---

## Root cause

1. **PRE_ROLL phase 60** was effective from stationary pre-arm (~35 min before movement).
2. `PhysicalStartDetector` likely confirmed movement internally.
3. Orchestrator called `switchHfCalibrationPhase(60000)` **before** durable T0 logging.
4. Policy threw on duplicate 60→60 (`requestHfCalibrationPhase`).
5. Fatal propagated → `FATAL_SESSION_CLEANUP` → RC session stopped.
6. `PHYSICAL_DRIVE_START_DETECTED` was logged **after** the fallible phase switch (wrong order).

**Why silent 60→60 no-op is insufficient:** Accepting duplicate interval without physical re-anchor would leave phase-60 scientific start at stationary pre-arm, crediting ~35 min of stationary time to the physical cadence and maturing settlement probes before T0.

---

## Hardening semantics (post-fix)

### PRE_ROLL ≠ PHYSICAL PHASE

| Before T0 | Behavior |
|-----------|----------|
| Raw RC recording | Allowed (pre-roll evidence preserved) |
| Physical phase accrual | **NO** |
| Phase-bound FIXED_INTERVAL settlement | **NO** (`PRE_T0_PHASE_BOUND_SETTLEMENT_COUNTS_AS_PHYSICAL = NO`) |
| PDI | **NO** |

`HfCalibrationPhaseProvenance`: `PRE_ROLL` | `PHYSICAL_T0` | `PHYSICAL_TRANSITION`

### T0 durable ordering

```
1. PhysicalStartDetector confirms
2. persistExp021CanonicalT0 (preflightJson.exp021PhysicalAuthority) — ATOMIC
3. PHYSICAL_DRIVE_START_DETECTED log
4. activatePhysicalPhaseAtT0 → reanchorPhysicalCalibrationPhaseAtT0
5. settlement sync / phase tracker
```

Invariant: `PHASE_60_PHYSICAL_STARTED_AT >= CANONICAL_T0`

### PDI vs WHOLE_TRIP

| Channel | Authority | Trip FSM dependency |
|---------|-----------|---------------------|
| **PDI** | `PhysicalEndDetector` boundary | **Independent** — schedules +30…+600 from physical end |
| **WHOLE_TRIP** | Canonical `VehicleTrip` `COMPLETED` + `endTime` | **Required** — late reconstruction only |

Maturation analysis uses **actual query age** (`actualAgeMs`, `scheduleDriftMs`), not nominal age alone.

### Degraded vs fatal

| Class | Examples | RC recording |
|-------|----------|--------------|
| **Integrity** | Lock loss, ownership conflict | Fail-closed, session terminalized |
| **Orchestration** | Phase activation rejected, settlement scheduling error | `ORCHESTRATION_STATE=DEGRADED`, raw RC continues |

---

## Implementation

| Component | Change |
|-----------|--------|
| `reference-capture-exp-021-physical-authority.lib.ts` | T0 authority, provenance types, failure classification |
| `reference-capture-hf-calibration-phase.policy.ts` | `phaseProvenance`, `reanchorPhysicalCalibrationPhaseAtT0`, `isPhaseEligibleForPhysicalSettlement` |
| `reference-capture-session.repository.ts` | `persistExp021CanonicalT0Atomic`, `activatePhysicalPhaseAtT0Atomic`, `markExp021OrchestrationDegradedAtomic` |
| `reference-capture-settlement-shadow.service.ts` | Gate settlement sync on physical provenance |
| `reference-capture-exp-021-autonomous-orchestrator.ts` | T0 order, re-anchor, degraded mode, T0 recovery on attach |
| `reference-capture-exp-021-stationary-certification.ts` | Explicit `PRE_ROLL` phase provenance |

---

## Tests

`reference-capture-exp-021-t0-hardening.spec.ts` — scenarios A–J + full operator journey simulation.

---

## Unresolved UNKNOWNs

- Whether movement confirmation occurred in-process before fatal (inferred from speed samples, not logged).
- Exact BullMQ delay distribution for WHOLE_TRIP nominal vs actual ages on this run (partially logged post-fatal).
