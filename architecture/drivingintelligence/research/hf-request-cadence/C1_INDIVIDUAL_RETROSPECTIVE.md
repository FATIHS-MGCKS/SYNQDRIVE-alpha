# C.1 – C.1e Individual Retrospective

Granular record — **do not collapse into single "block polling" row.**

Parent: `docs/audits/driving-intelligence-hf-block-polling-scalability-2026-09.md`  
Deploy: PR #1533 — CODE_DEPLOYED=YES, FEATURE_ENABLED=NO

---

## C.1 — Block polling / configurable cadence (DI-EV-0035C.1)

| Field | Detail |
|-------|--------|
| **Problem** | 5s runner × fleet HF requests unsustainable |
| **Hypothesis** | 30s `HF_HISTORICAL` poll preserves 1s aggregate bucket density |
| **Implementation** | `HF_HISTORICAL_POLL_INTERVAL_MS` default 30000; 1s aggregation unchanged |
| **Separation** | Runner cadence (5s) ≠ provider poll cadence (configurable) ≠ bucket interval (1s) |
| **Observability** | `hf_30s_block_polling_validated: false` in metrics |
| **Validation** | Unit tests; **live NOT executed** |
| **Status** | IMPLEMENTED testbed; hypothesis NOT_VALIDATED |

---

## C.1a — Pre-canary correctness hardening (DI-EV-0035C.1a)

| Field | Detail |
|-------|--------|
| **Problem** | Canary could fail-open; bucket-age wrong; no stagger primitive |
| **Fix** | Empty allowlist → LEGACY; bucket-age semantic correction; stagger deadline |
| **Defects** | DI-DEF-008, 009, 010 |
| **Metrics** | Canary metrics reconstructibility audit |
| **Validation** | Policy unit tests |

---

## C.1b — Dynamic canary contract (DI-EV-0035C.1b)

| Field | Detail |
|-------|--------|
| **Problem** | Hardcoded KS MX 2024 / token 187336 as implicit canary |
| **Decision** | Runtime vehicle-agnostic; operator pre-run selection |
| **Preference** | Same vehicle within physical drive / calibration series |
| **Example only** | KS MX 2024 token 187336 — not production authority |
| **Hypothesis rejected** | DI-HYP-008 |

---

## C.1c — Single-drive multi-cadence calibration (DI-EV-0035C.1c)

| Field | Detail |
|-------|--------|
| **Problem** | Cannot compare poll cadences across different drives |
| **Design** | ONE physical drive → phases 10 / 20 / 30 / 60s |
| **Mechanism** | Session-scoped poll override; durable phase identity |
| **Transitions** | Explicit transition windows; **no trip reset** |
| **Validation** | **NOT_YET_TESTED** live (DI-HYP-007) |

---

## C.1d — Phase transition atomicity (DI-EV-0035C.1d)

| Field | Detail |
|-------|--------|
| **Problem** | Lost-update race: cycle release overwrote operator phase |
| **Finding** | Control-plane vs data-plane ownership conflated |
| **Fix** | `FOR UPDATE`; pending-at-boundary; V2 activation gate |
| **Semantics** | REQUESTED vs EFFECTIVE phase state |
| **Defects** | DI-DEF-011, DI-DEF-012 |
| **Tests** | 103+ reference-capture HF tests at C.1d closeout |

---

## C.1e — Pre-live-canary closure (DI-EV-0035C.1e)

| Field | Detail |
|-------|--------|
| **Problem** | Remaining races blocked safe operator calibration |
| **Fixes** | `requestHfCalibrationPhaseAtomic()`; pending 409; terminal finalization; stop quiescence |
| **Metrics** | Real ISO bucket-start IDs; phase-wide cadence; FAST_LOOP + PHASE_NATIVE stats |
| **Exclusions** | Transition + RECOVERY_SWEEP excluded from primary cadence comparison |
| **Defects** | DI-DEF-013 through 017 |
| **PR** | #1533 merged 2026-09-05 |
| **Post-merge** | LEGACY authority; V2 OFF; no canary run |

---

## Subsequent events

| Event | Detail |
|-------|--------|
| Test-only CI fix | DI-DEF-017 constructor mismatch |
| Safe production deploy | Flags OFF per deploy discipline |
| Live calibration | **PENDING** |

---

## Links

- `evidence/reference-capture/HF_RECOVERY_EVOLUTION.md`
- `research/DEFECT_LEDGER.md`
- `research/EXPERIMENT_REGISTER.md` — EXP-C1-* entries
- `research/HYPOTHESIS_REGISTER.md` — DI-HYP-006, 007, 008, 015
