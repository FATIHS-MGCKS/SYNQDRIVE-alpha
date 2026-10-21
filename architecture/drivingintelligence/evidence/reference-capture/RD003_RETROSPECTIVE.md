# RD003 — Full Retrospective

**Evidence IDs:** DI-EV-0027–0032, DI-EV-0033–0034F  
**Session:** `0fa040aa-6105-4879-b2c-f8ad477009b8`  
**Vehicle:** VW Tiguan WOB L 7503 · `19fedd4b-…` (ICE_GASOLINE, DIMO_LTE_R1)  
**Epistemic:** CONFIRMED_FROM_PRODUCTION_RUNTIME + CONFIRMED_FROM_VEHICLE_OBSERVATION

---

## Capture context

| Field | Value |
|-------|-------|
| Protocol | `DIMO_LTE_R1_REFERENCE_DRIVE_003` |
| Video | 9 segmented clips (NOT continuous) |
| GT observations | 198 sparse external observations |
| HF query | `interval:"1s"` |
| Idempotency runtime | NOT_EXERCISED |
| Duplicate bucket identities | NOT observed |

---

## Flight Recorder behavior (RD003)

- FAST PRE-ARM/GO validated (post 3A.3.1)
- Per-field watermarks active (post 3A.3.2)
- Distinct timing metrics vs RD001 (ARM gap eliminated per DI-EV-0030)
- Acquisition-order runtime validation performed

---

## Signal availability (per DI-EV-0034E)

| Signal | Rating | Key limitation |
|--------|--------|----------------|
| SPEED (HF) | USEFUL_WITH_GATING | ~2s median cadence |
| RPM | USEFUL_WITH_GATING | Not direct video GT |
| THROTTLE / TPS | SECONDARY_DEMAND_CONTEXT | Separate fields |
| ENGINE_LOAD | POWERTRAIN_DEMAND_CONTEXT_ONLY | Not mass/payload |
| ACTUAL_GEAR | CONTEXT_ONLY | State yes; shift timing NO |
| DERIVED_ACCELERATION | USEFUL_WITH_GATING | 63% reliable @ 2s gap |
| DERIVED_JERK | WEAK | Episode context only |
| PROVIDER_TIMESTAMP | BEST event-time authority | — |
| SYNQ_RECEIVED_AT | NOT_RELIABLE | Ingress only |

---

## Cadence findings (negative knowledge preserved)

| Claim | Status |
|-------|--------|
| `REQUESTED_INTERVAL_1S` | CONFIRMED — query uses 1s aggregation |
| `PROVEN_PHYSICAL_1HZ` | **NOT PROVEN** — median ~2s bucket spacing |
| `OBSERVED_UPDATE_FREQUENCY` | ~2.0s median new physical samples (HF) |
| `LATEST_LIVE` direct video validation | INSUFFICIENT (1 matched point) |

**Provisional analysis anchor:** 2.0s max-gap for kinematic pairs (NOT production policy).

---

## Video / alignment chain

1. **0034A** — Workbench v1.2; multi-clock model
2. **0034B** — 9 clips, 198 obs; GROUND_TRUTH_VALIDATED=NO
3. **0034C** — Fingerprint v1 REJECTED (clock-prior defects)
4. **0034D/D.1/D.2** — V2 joint DP; static-minute geometry corrected
5. **0034E/E.1** — Signal quality interpretation; alignment-fit ≠ independent accuracy

**Alignment confidence:** Candidate basins only. `INDEPENDENT_ABSOLUTE_ACCURACY_VALIDATED=NO`.

Speed alignment-fit MAE ~8.5 km/h (109 matched points) — **in-sample fit, not independent proof**.

---

## Detector implications

- Point-pair harsh detectors assume denser cadence than observed
- Short-event misuse for LTE_R1 → native DIMO events (not HF alone)
- Production detectors **not changed** after RD003 (intentional)

---

## Conclusions carried into RD004

- Need independent speed/event validation on different drive (KS MX Segment B)
- Late-bucket / watermark gap hypothesis to test with exact-window replay
- Episode V2 design uses RD003 as authority input

## What RD003 does NOT support

- Independent absolute DIMO speed accuracy globally
- Exact jerk/acceleration thresholds without GT
- LATEST_LIVE freshness by surface name alone
- Exact gear-change timing
- Physical ECU sampling at exactly 1 Hz
