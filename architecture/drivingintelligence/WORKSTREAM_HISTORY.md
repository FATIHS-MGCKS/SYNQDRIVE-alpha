# Driving Intelligence — Workstream History (2026-08-30 → 2026-09-06)

Technical chronology of the reconstruction workstream.  
**Companion registers:** `research/DI_EV_CHRONOLOGY.md`, `research/EXPERIMENT_REGISTER.md`, `research/PR_TIMELINE.md`

---

## 1. Why the audit started

Production Driving Intelligence had grown organically: post-trip HF enrichment, harsh-event detectors, Impact Engine V1 scoring, rental aggregation, and a parallel V2 durable pipeline (flag-gated). No single authority documented boundaries, signal assumptions, or the gap between **vehicle operational load** and **driver quality**.

**Trigger:** DI-EV-0001 master plan (2026-08-30) established phased forensic reconstruction before any scoring or HF policy changes.

---

## 2. Initial production state (Phase 1 — DI-EV-0002)

**Confirmed chain:**
```
VehicleTrip COMPLETED → trip.behavior.enrichment → fetchHighFrequency(interval:"1s")
  → hf-acceleration / hf-braking / hf-abuse → TripBehaviorEvent
  → trip.driving-impact.compute → DrivingImpactService v1.2.0 → TripDrivingImpact
```

**Key findings:**
- `drivingStressScore` = vehicle operational load (0–100), **not** driver skill
- `DriverScoreService` misnamed — aggregates stress, not driver quality
- No raw HF time series in Postgres; re-enrichment re-fetches DIMO
- V2 pipeline exists behind `DRIVING_INTELLIGENCE_V2_ENABLED=false`

**Defects surfaced (not fixed):** `profilesComparable()` dead code; detector ~1 Hz assumption undocumented.

---

## 3. DIMO signal surface audit (Phase 2 — DI-EV-0003–0010)

**Sequence executed:**
1. **2A** — Complete GraphQL query registry (41 fields, Q001–Q027)
2. **2B** — Four-vehicle capability matrix (Tiguan, C63, A4, Arteon; union 33 signals)
3. **2C** — Global schema 117 fields; three-layer separation
4. **2D** — Physics/value ranking; 8 Tier-A cadence-critical signals
5. **2E** — 33 canonical keys; redundancy groups; episode taxonomy (proposal)
6. **2F/2F.1** — Capability-first acquisition + frozen LTE_R1 manifest v1.1.0

**Status:** COMPLETED as forensic audits. Acquisition planner not production-deployed.

---

## 4. Flight Recorder necessity (Phase 3A.1 — DI-EV-0011)

**Problem:** Production post-trip HF is a single whole-trip fetch — cannot measure true signal cadence, late arrival, or ground-truth alignment.

**Decision:** Build `reference-capture` subsystem — autonomous 5s runner, incremental HF acquisition, observation persistence. Gated by `REFERENCE_CAPTURE_ENABLED=false` default.

**Architecture:** `architecture/DIMO_LTE_R1_FLIGHT_RECORDER_REFERENCE_CAPTURE_2026-08-31.md`

---

## 5. First reference drives

### RD001 (DI-EV-0016) — Tiguan, no video
- Real-motion STOP; HF late-arrival differential proven
- **Negative:** VIDEO_NOT_CAPTURED → GT alignment impossible
- Led to FAST PRE-ARM/GO (0020) and watermark remediation (0021)

### RD002 (DI-EV-0023) — KS MX 2024 C63, motion
- 351 cycles; HF Recovery V2 exercised
- **Critical finding:** `REQUESTED_INTERVAL_1S ≠ OBSERVED_1HZ` — median bucket ~2s
- Native behavior events NOT_OBSERVED on C63

### RD003 (DI-EV-0027) — Tiguan WOB L 7503, segmented video
- Session `0fa040aa-6105-4879-b2c-f8ad477009b8`
- 9 video clips; 198 sparse GT observations
- Confirmed 1s≠1Hz; idempotency runtime NOT_EXERCISED

---

## 6. RD003 full investigation

See `evidence/reference-capture/RD003_RETROSPECTIVE.md` for granular detail.

**Summary:**
- Flight Recorder: request timing, readiness latency, per-field availability documented
- Video GT: segmented clips only — continuous video assumption removed
- Signal quality (DI-EV-0034E): SPEED useful with gating; RPM secondary; gear timing NOT observable; synqReceivedAt unreliable
- Alignment chain (0034A–D): workbench → sparse GT → fingerprint discovery v1 (rejected) → v2 (joint DP, still GROUND_TRUTH_VALIDATED=NO)
- **Does NOT prove:** independent absolute speed accuracy; physical ECU 1 Hz sampling

---

## 7. Episode V2 reasoning (DI-EV-0034F)

**Why:** Point-pair detectors brittle under ~2s median cadence and gaps.

**Proposal:** Driving Episodes with reconstruction vs attribution confidence; 2.0s provisional max-gap for kinematic pairs.

**Status:** Design artifact + export JSON. **DEPLOYED=NO.** Production Impact V1 unchanged.

---

## 8. RD004 — Alignment + late buckets

### Segment A (KS MX, DI-EV-0035A→A.2)
Three methodology iterations corrected circular clock offset, drift, H-displacement semantics.

### Segment B (KS MX token 187336, DI-EV-0035B→B.6)
- **B.4 exact-window replay:** 75 replays; 53 late-arrival; 26 watermark-excluded
- **Root cause:** `PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP`
- **B.6:** Provisional 8s settlement / 6s overlap — live calibration still required

---

## 9. HF Recovery V2 (DI-EV-0035C)

**Why simple last-seen watermark failed:** Late-settling DIMO aggregate buckets arrive after first query; 2s overlap permanently misses them (RD004-B).

**Implementation:**
- Settlement delay (8s provisional)
- Recovery overlap (6s provisional)
- Separate DATA / QUERY_COVERAGE / RECOVERY watermarks
- Zero-result provenance ring (500 records)
- Optional deep recovery sweep (default OFF)

**Scope:** Reference Capture only. Production `trip-behavior-enrichment` unchanged.

---

## 10. Scalability — block polling (C.1–C.1e)

**Problem:** 5s runner × fleet = unsustainable DIMO API pressure.

**Hypothesis (NOT VALIDATED):** One HF_HISTORICAL request per ~30s preserves 1s/2s bucket density.

### C.1 — Block polling testbed
Configurable `HF_HISTORICAL_POLL_INTERVAL_MS`; runner still 5s; V2 skips HF until interval elapses.

### C.1a — Pre-canary hardening
- Canary fail-closed (empty allowlist → LEGACY)
- Bucket-age semantic fix
- Stagger deadline primitive

### C.1b — Dynamic canary contract
- Remove hardcoded KS MX / 187336 from runtime
- Operator selects vehicle pre-run

### C.1c — Multi-cadence calibration
- ONE physical drive, MULTIPLE phases (10/20/30/60s)
- Session-scoped poll override; transition windows

### C.1d — Phase atomicity
- **Defect:** Lost-update race on phase switch
- **Fix:** Control-plane vs data-plane; FOR UPDATE; REQUESTED vs EFFECTIVE

### C.1e — Pre-live-canary closure
- Stale precompute race fixed (`requestHfCalibrationPhaseAtomic`)
- Pending conflict → HTTP 409
- Terminal finalization on stop; stop quiescence barrier
- Real temporal bucket metrics; transition/recovery excluded from primary stats

---

## 11. Production deployment (PR #1533)

| Flag | Value |
|------|-------|
| **CODE_DEPLOYED** | YES — merge `3d5040b67` 2026-09-05 |
| **FEATURE_ENABLED** | NO — `HF_RECOVERY_POLICY_V2_ENABLED=false`; empty canary allowlist |
| **LIVE_CANARY_EXECUTED** | NO — zero calibration sessions |
| **PRODUCTION_HF_AUTHORITY** | LEGACY post-trip path |
| **HF_30S_BLOCK_POLLING_VALIDATED** | NO |

Infrastructure ready for operator-selected Flight Recorder calibration run.

---

## 12. Current state

- **Production scoring:** Impact V1 (`drivingStressScore` = vehicle load)
- **Production HF:** Whole-trip `fetchHighFrequency`; no recovery overlap
- **Reference Capture:** Code on main; all experimental gates OFF
- **Next scientific experiment:** Live 10/20/30/60s calibration on operator-selected vehicle

---

## Investigation sequence status (22 topics)

| # | Topic | Status |
|---|-------|--------|
| 1 | Forensic current-state audit | COMPLETED |
| 2 | Formulas/score/load audit | COMPLETED |
| 3 | DIMO query surface | COMPLETED |
| 4 | Signal availability inventory | COMPLETED |
| 5 | Signal cadence/density | COMPLETED |
| 6 | Snapshot/Live/HF/Native surfaces | COMPLETED |
| 7 | Flight Recorder | COMPLETED (code); live cal PENDING |
| 8 | Reference-drive methodology | COMPLETED |
| 9 | Video/tachometer GT | PARTIALLY COMPLETED (not validated) |
| 10 | Telemetry/video alignment | PARTIALLY COMPLETED |
| 11 | Detector validation | PARTIALLY COMPLETED |
| 12 | Sampling invariance | PARTIALLY COMPLETED (design) |
| 13 | Driver quality semantics | COMPLETED (understanding) |
| 14 | Vehicle operational load | COMPLETED |
| 15 | Braking/brake-load physics | PARTIALLY COMPLETED |
| 16 | Tire-load model | PARTIALLY COMPLETED |
| 17 | High-timeframe intelligence | PARTIAL (30d rolling only) |
| 18 | Replay/calibration | COMPLETED (tooling); live PENDING |
| 19 | Scalability | PARTIALLY COMPLETED (hypothesis untested) |
| 20 | Multi-replica/concurrency | PARTIALLY COMPLETED (tests) |
| 21 | Production cutover governance | COMPLETED (safe deploy) |
| 22 | API/UI semantic correctness | PARTIALLY COMPLETED |
