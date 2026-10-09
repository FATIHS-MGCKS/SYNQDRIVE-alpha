# EED-EV-0107 — RFRF OQ-014 R3A phase-aware settled-post scanner

**Classification:** CODE+TEST (pure offline scanner — **NOT_RUNTIME_AUTHORITATIVE**)  
**Date:** 2026-10-09  
**Status:** IMPLEMENTED + OFFLINE_PROVEN + **UNCALIBRATED** + **NOT_PRODUCTION_ACTIVE**

## Scope

Pure, deterministic phase scanner inside `raw-fuel-rise-detector`:

- Phases: `RISING` → `PEAK_REACHED` → `SETTLING` → `SETTLED`
- Inputs: normalized absolute samples, fresh pre-baseline, rise anchors, versioned structural symbols, explicit calibration bundle, F3 terminal context, provenance
- Outputs: phase transitions, peak vs settled median proposals, peak→settled drop metrics, continuity gaps, maturity/refusal/hold reasons
- **No** DB, queues, provider calls, interpolation, or runtime activation

Policy: `RFRF_RISE_PHASE_SCANNER_POLICY_VERSION=rfrf-rise-phase-scanner-v1`

## Calibration firewall

- Production numeric caps for `maxPeakToSettledDropLiters`, `maxPeakToSettledDropRatioOfRise`, `maxPeakToSettledContinuityGapMs` are **not** defaulted in production code
- Bounded maturity requires a **complete** versioned bundle; missing/malformed/NaN/infinite → fail closed
- Replay uses `REPLAY_HYPOTHESIS` classification only (3 L / 0.35 are **REPLAY_HYPOTHESIS_ONLY** in tests/replay — not Production defaults)
- Rise-path gaps, settled-window internal gaps, and peak→settled continuity gaps remain **separate** symbolic authorities

## Terminal F3 dominance

- Current F3 terminal safety rejections → scanner `REFUSED` / shadow-only `PHASE_AWARE_REINTERPRETATION` — **never** resurrects terminal REJECTED to Production READY
- Active `detectRawFuelRises` / `RFRF_RISE_DETECTION_VERSION=rfrf-rise-v1` unchanged

## Offline evidence

| Artifact | Role |
|----------|------|
| `raw-fuel-rise-phase-scanner.ts` | Core scanner |
| `raw-fuel-rise-phase-scanner.spec.ts` | T01–T20 adversarial unit matrix |
| `raw-fuel-rise-phase-scanner.replay.spec.ts` | KS MS 661 2026-09-30 + A1–A12 bridge |
| `raw-fuel-rise-phase-scanner.fleet-replay.spec.ts` | EED-EV-0104 fixture tier counts |
| `raw-fuel-rise-phase-scanner.r2-blocker.spec.ts` | Documents v2→v2 SAME_VERSION duplicate risk (**R3B blocker**; matcher unchanged) |
| `rfrf-f4-pr2-runtime-postgres-gate.sh` | Stage-3 runs R3A Jest + settled-post replay before PG migrate |

### KS MS 661 2026-09-30 (critical path)

| Field | Offline R3A |
|-------|-------------|
| F3 lifecycle | `OBSERVED` (unchanged) |
| R3A maturity | `MATURE_SHADOW_READY` (shadow only) |
| PRE | 6 L |
| PEAK | 20 L |
| SETTLED | 19 L |
| PROPOSED Δ | 13 L (telemetry proposal — not pump ground truth) |
| R2 canonical id | `b27124fb-64c3-478d-8077-200751af2863` (unchanged — R3A does not touch R2) |

## Fleet replay (fixture-bound)

- Calibration pack: **7** defensible natural rows; **5** replayable committed spines in repo
- EED-EV-0104 **N=6** drop-calibration population includes events outside committed fixture spines — **not** silently relabeled here
- `PRODUCTION_UPPER_BOUND_ESTABLISHED=NO`

## Explicit non-effects

| Attestation | Value |
|-------------|-------|
| `RFRF_RISE_DETECTION_VERSION` | `rfrf-rise-v1` (unchanged) |
| `RFRF_RISE_DETECTOR_VERSION` | `rfrf-rise-detector-v1` (unchanged) |
| Runtime call site added | **NO** |
| Schema / migration | **NO** |
| Production DB writes | **NO** |
| Deploy | **NO** |
| Hybrid Trust v2 | unchanged |
| R2 matcher / persistence | unchanged |

## Open questions

- **OQ-014** — **OPEN** (Production numeric calibration + activation path)
- **OQ-019** — **PARTIALLY_RESOLVED** (settled-post design + offline proof; not runtime authoritative)

## R3B follow-up

- v2→v2 rediscovery with changed settled post may still classify `SAME_PHYSICAL_RISE` under current matcher — duplicate candidate risk documented; **no** silent matcher change in R3A

## 2026-10-09 — Final safety closure (same PR)

- Anchored peak selection within `[riseOnsetAt, riseEndAt]`; second in-window material rise → `SECOND_REFUEL_SEPARATED` (T21)
- Per-event F3 pre-plateau median + `baselineRecencyClassification === FRESH'` (no hardcoded 6 L in fleet replay)
- Input/policy/calibration firewalls (`raw-fuel-rise-phase-scanner.validation.ts`); all `REJECTED` F3 lifecycles blocked
- Adversarial A1–A12 explicit scan accounting in replay spec
