# Production HF Detectors — Audit Retrospective

**Status:** CURRENT PRODUCTION (unchanged after RD003/RD004)  
**Proposed alternative:** Episode V2 detectors (design only — `EPISODE_V2_DESIGN.md`)

---

## Shared preprocessing

| Component | File | Assumption |
|-----------|------|------------|
| Gap split | `hf-preprocessing.ts` | Splits on gaps; min 10 raw / 5 clean points |
| Window producer | `hf-window-producer.ts` | `HF_WINDOW_EXPECTED_INTERVAL_MS = 1000` (**semantic debt**) |
| Gap threshold | `hf-window-producer.ts` | `HF_WINDOW_GAP_THRESHOLD_MS = 3000` |

**Cadence sensitivity:** Detectors assume ~1 Hz; RD003 HF median ~2.00s; RD002 sealed P50 13.489s (`DI-CONTRA-HF-1HZ-001`).

---

## hf-acceleration.ts (PRODUCTION)

| Field | Value |
|-------|-------|
| Source signals | speed (derived longitudinal accel from point pairs) |
| Algorithm | Point-pair Δv/Δt with hysteresis continuation |
| Thresholds | Hard/extreme acceleration tiers (m/s²) |
| Min samples | Episode open/close hysteresis |
| Gap handling | Via preprocessing gap split |
| Severity | Classification tier per event |
| Validation | Unit tests; **no video GT validation at production thresholds** |
| Production status | **ACTIVE** |

**Learning:** Works as trip-level summary under sparse cadence; not short-event authority for LTE_R1.

---

## hf-braking.ts (PRODUCTION)

| Field | Value |
|-------|-------|
| Source signals | speed → deceleration |
| Algorithm | Point-pair braking intensity; normalized to EXTREME threshold 7.0 m/s² |
| Thresholds | Hard / extreme braking classes |
| Validation status | Unit tests only |

---

## hf-abuse.ts (PRODUCTION)

| Field | Value |
|-------|-------|
| Source signals | speed, rpm, throttle, coolant, etc. (vehicle-config thresholds) |
| Event types | `KICKDOWN`, `LAUNCH_LIKE_START`, `FULL_BRAKING`, `POSSIBLE_IMPACT`, `COLD_ENGINE_*`, `LONG_IDLE`, etc. |
| Thresholds | Vehicle-specific `maxRpm`, throttle %, braking m/s² (abuse stricter than classification) |
| Temporal assumptions | Multi-sample persistence; hysteresis on several detectors |
| Gap handling | Single-sample spikes rejected (e.g. GPS glitch tests) |
| Validation | Extensive unit tests (`hf-abuse.spec.ts`); RD003 derived jerk = WEAK |

**FULL_BRAKING vs braking classification:** Abuse threshold 7.5 m/s² stricter than braking event threshold 7.0 m/s².

---

## Native path (not HF-reconstructed)

See `NATIVE_DIMO_EVENTS.md` — authoritative for LTE_R1 short misuse events.

---

## Episode V2 (PROPOSED — NOT PRODUCTION)

| Aspect | Design intent (DI-EV-0034F) |
|--------|----------------------------|
| Problem | Point-pair counting brittle under sparse cadence (RD003 ~2.00s) + gaps |
| Model | Episodes with start/continue/end; reconstruction vs attribution confidence |
| Gap policy | Provisional 2.0s max-gap anchor from RD003 |
| Cutover | Requires validation contract + RD004-class evidence |
| Deployed | **NO** |

---

## Why production detectors were NOT changed after RD003

| Rationale | Evidence |
|-----------|----------|
| Changing thresholds without GT-validated replacement risked false positives/negatives | DI-DEC-PROD-DET-UNCHANGED-001 |
| RD003 proved cadence issue but not a calibrated replacement detector set | DI-EVID-RD003-CADENCE-001 |
| Episode V2 proposed as structured successor, not threshold tweak | DI-EV-0034F |

---

## Links

- `evidence/signal-inventory/CADENCE_DENSITY.md`
- `research/scoring-models/EPISODE_V2_DESIGN.md`
- `research/HYPOTHESIS_REGISTER.md` — DI-HYP-001, DI-HYP-002
- `research/EXPERIMENT_REGISTER.md` — EXP-RD003-SQ
