# Flight Recorder / HF Recovery — Evolution Record

Chronological implementation stages from ground-truth need → production-safe deploy (V2 OFF).

---

## Stage 0 — Need for ground truth (DI-EV-0016–0019)

| | |
|--|--|
| **Problem** | RD001: late HF arrivals; 151s gap; no video |
| **Finding** | Single watermark loses buckets permanently |
| **Decision** | Build alignment + denser capture methodology |

## Stage 1 — Capture infrastructure (DI-EV-0011–0014)

| | |
|--|--|
| **Implementation** | `reference-capture` module; envelope v1.0.0; `REFERENCE_CAPTURE_ENABLED` gate |
| **Runner** | 5s `REFERENCE_CAPTURE_CYCLE_INTERVAL_MS` default |
| **Tests** | Stationary canary 52 observations |
| **Uncertainty** | Motion HF behavior unproven |

## Stage 2 — Watermark remediation (DI-EV-0020–0021)

| | |
|--|--|
| **Problem** | RD001 39-exclusion; FAST GO timing |
| **Fix** | PRE-ARM/GO split; per-field data/query watermarks; V2 bucket fingerprint |
| **Validation** | RD002 motion canary; 0 duplicate fingerprints |

## Stage 3 — RD003 contradiction (DI-EV-0027–0034E)

| | |
|--|--|
| **Finding** | `interval:"1s"` → RD003 ~2.00s median physical samples; video GT partial |
| **Impact** | Production detectors **not changed** (DI-DEC-PROD-DET-UNCHANGED-001) |
| **Next** | Episode V2 design; RD004 validation |

## Stage 4 — RD004 late-bucket proof (DI-EV-0035B.4–B.6)

| | |
|--|--|
| **Finding** | 53 late-arrival; 26 watermark-excluded under 2s overlap |
| **Decision** | Settlement + overlap + separate watermarks (provisional 8s/6s) |

## Stage 5 — Recovery V2 implementation (DI-EV-0035C)

| Component | Detail |
|-----------|--------|
| `HF_RECOVERY_POLICY_V2_ENABLED` | default **false** |
| Settlement | `HF_SETTLEMENT_DELAY_MS` = 8000 (provisional) |
| Overlap | `HF_RECOVERY_OVERLAP_MS` = 6000 (provisional) |
| Watermarks | data watermark, query coverage, recovery watermark |
| Provenance | ring buffer for bucket revision tracking |
| Scope | Reference capture **only** |

**Why last-seen insufficient:** provider settlement delay + capture query advance race.

## Stage 6 — Scalability hypothesis (DI-EV-0035C.1)

| | |
|--|--|
| **Problem** | 5s runner × fleet = unsustainable API pressure |
| **Hypothesis** | 30s block poll preserves 1s aggregate bucket density |
| **Separation** | Poll cadence ≠ aggregation interval ≠ settlement ≠ overlap |
| **Status** | `HF_30S_BLOCK_POLLING_VALIDATED = NO` |

## Stage 7 — C.1a pre-canary hardening

| Defect | Fix |
|--------|-----|
| Canary fail-open | Empty allowlist → LEGACY (DI-DEF-008) |
| Bucket-age semantics | Corrected observability (DI-DEF-009) |
| Stagger deadline | Fleet poll storm prevention (DI-DEF-010) |

## Stage 8 — C.1b dynamic canary contract

- Remove fixed KS MX 2024 / token 187336 runtime assumption
- Operator selects eligible connected vehicle pre-run
- Same vehicle preferred within physical drive / calibration series

## Stage 9 — C.1c multi-cadence calibration design

- ONE physical drive → phases 10 / 20 / 30 / 60s poll
- Session-scoped override; durable phase identity
- Transition windows; **no trip reset**

## Stage 10 — C.1d phase atomicity

| Defect | Fix |
|--------|-----|
| Lost-update race | FOR UPDATE; control-plane vs data-plane (DI-DEF-011) |
| V2 gate missing | Fail-closed on phase API (DI-DEF-012) |
| REQUESTED vs EFFECTIVE | Phase evidence integrity |

## Stage 11 — C.1e pre-live-canary closure

| Defect | Fix |
|--------|-----|
| Stale precompute race | `requestHfCalibrationPhaseAtomic()` (DI-DEF-013) |
| Terminal phase not finalized | `finalizeTerminalCalibrationSeries()` (DI-DEF-014) |
| Synthetic bucket identity | Real ISO bucket-start timestamps (DI-DEF-015) |
| Transition contamination | Exclude TRANSITION + RECOVERY_SWEEP from primary stats (DI-DEF-016) |
| CI constructor mismatch | Test-only fix PR #1533 (DI-DEF-017) |

## Stage 12 — Production deploy (PR #1533, 2026-09-05)

| Flag | State |
|------|-------|
| CODE_DEPLOYED | **YES** |
| FEATURE_ENABLED (`HF_RECOVERY_POLICY_V2_ENABLED`) | **NO** |
| Canary allowlist | **empty** |
| LIVE_CANARY_EXECUTED | **NO** |
| Production HF authority | **LEGACY** whole-trip fetch |

## Remaining uncertainty

- Live 10/20/30/60 calibration on operator-selected vehicle
- Optimal settlement/overlap under fleet load
- Multi-replica calibration race at scale
- Production cutover criteria

**Detail:** `research/hf-request-cadence/C1_INDIVIDUAL_RETROSPECTIVE.md`
