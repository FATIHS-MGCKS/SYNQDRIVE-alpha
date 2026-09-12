# Vehicle & Device Connectivity — Ground-Truth Gates (Phase 3)

**GT-R1-UNPLUG-001:** [../ground-truth/TEST_STRATEGY.md](../ground-truth/TEST_STRATEGY.md) — **NOT executed**.

## Decisions blocked or partially blocked until GT

| Decision / question | Status without GT | Why GT required |
|---------------------|-------------------|-----------------|
| **VDC-RB-001 / VDC-DEC-002 rollout** | **BLOCKED for production** | Equality change may suppress replug/snapshot evidence; must observe baseline on current behavior first |
| VDC-DEC-007 episode reliability default | PROPOSED | Operator UX with absent episodes |
| VDC-Q-003 false-positive rate at 24h/48h | PARTIALLY_ANSWERED | Runtime evaluation frequency |
| VDC-Q-011 jitter window runtime evaluation | PARTIALLY_ANSWERED | Demand-driven projection triggers |
| VDC-Q-014 adaptive polling calibration | OPEN | Safe backoff intervals per profile |
| `PHYSICAL_REPLUG_OBSERVED` | INFERRED only | No human-observed replug |
| `FULL_CONNECTIVITY_RECOVERED` instant | UNKNOWN | Strict advance correlation |
| **PLUG webhook as recovery path** | UNKNOWN | Aug 2026 had no PLUG webhook; must not be assumed mandatory (VDC-DEC-010) |
| Recovery without PLUG webhook | UNKNOWN | GT must prove snapshot/per-signal path |
| Per-signal advance vs top-level source advance | PARTIALLY known | VDC-HYP-004; GT must confirm replug ordering |
| Provider unplug → observedAt latency | PARTIAL (4.7s, n=1) | Controlled repeat |
| Episode/alert reaction latency | UNKNOWN | No SLA measurement |

## GT-R1-UNPLUG-001 must decide (LTE_R1)

1. Human-known unplug → provider `observedAt` latency (repeatable).
2. **Whether PLUG webhook is emitted** (and latency if yes).
3. **Whether `obdIsPluggedIn=true` appears before/with/after strict top-level source advance.**
4. **Whether per-signal timestamps advance independently** during recovery.
5. **Whether fresh telemetry can restore recovery without PLUG webhook.**
6. **Exact recovery ordering** (webhook vs snapshot vs strict advance).
7. First strict source advance after replug relative to physical replug.
8. Exact `FULL_CONNECTIVITY_RECOVERED` instant under controlled conditions.
9. Episode/alert bounds when projection is demand-driven.
10. Whether `enqueue_failed` delay is reproducible (VDC-Q-013).

## Decisions that do NOT require GT (architecture validated)

- VDC-DEC-003 provider link vs authorization semantics
- VDC-DEC-005 threshold taxonomy
- VDC-DEC-006 webhook failure taxonomy (design)
- VDC-DEC-008 diagnostic non-authoritative
- VDC-DEC-009 alert ownership
- VDC-DEC-010 recovery vocabulary **principles** (PLUG optional — GT validates provider behavior)
- VDC-DEC-011 adaptive polling **principle** (intervals via VDC-Q-014 + fleet/GT)

## Decisions requiring GT before production implementation

- **VDC-DEC-002 / VDC-RB-001** — per-signal safety + recovery evidence preservation
- **VDC-RB-018** — calibrated backoff intervals (VDC-Q-014)
