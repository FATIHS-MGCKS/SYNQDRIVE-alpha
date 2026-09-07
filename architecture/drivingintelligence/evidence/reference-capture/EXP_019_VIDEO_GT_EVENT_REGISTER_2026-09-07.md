# EXP-019 — Video Ground-Truth Event Register

**Date:** 2026-09-07  
**Session:** `2508b697-f101-4155-a0d3-8436e46bb779`  
**Vehicle:** KS MX 2024 · token `187336`  
**Time authority:** Video **CEST (UTC+02:00)** → UTC = local − 2h  
**HF layer:** `TRUE_T30_SETTLED` · **VPS JSON:** `/tmp/exp-019-video-alignment/video-gt-event-register.json`

> Video GT is **independent** human evidence. Telemetry findings are correlated separately — not re-derived from video.

---

## Clock mapping

```
VIDEO LOCAL TIME (CEST) - 2h = UTC
VIDEO_GT_TIMEZONE_MAPPING_VALID = YES
```

Settled DIMO gap boundaries align to video UTC within ≤1s (sub-second settlement timestamps preserved in correlation).

---

## Event register + telemetry correlation

### GT-10-P0 · 10s phase

| Field | Value |
|-------|-------|
| Video local | `2026-09-07 06:35:29` → `06:35:52` |
| UTC | `2026-09-07T04:35:29Z` → `04:35:52Z` |
| Settled gap UTC | `04:35:29.538Z` → `04:35:52.304Z` |
| Physical behavior | **DECELERATION_TO_STOP** |
| Visible speed anchors | ~36 → ~34 → ~16 → ~0 km/h |
| Confidence | HIGH |
| Video continuity | CONTINUOUS_VISIBLE |

**Telemetry correlation**

| Authority | Result |
|-----------|--------|
| HF interior samples in gap | **0** |
| HF gap boundaries (speed) | start **0** km/h · end **0** km/h |
| RPM / throttle / load at boundaries | load **0** at start; sparse |
| Coordinates | NOT_AVAILABLE |
| Native DIMO events in window | NO |
| TripBehaviorEvent | NO |
| Braking detector | NO |
| Acceleration detector | NO |
| DrivingImpact / trip score | Trip aggregate exists; **no window-level input** |

| Metric | Value |
|--------|-------|
| VIDEO_DYNAMIC_EVENT_PRESENT | YES |
| HF_SPEED_COVERAGE (gap interior) | **NONE** |
| HF_SPEED (boundaries) | PARTIAL — end matches 0; **start contradicts video (0 vs ~36)** |
| NATIVE_EVENT_PRESENT | NO |
| DI_DERIVED_EVENT_PRESENT | NO |
| DRIVING_IMPACT_CHANGED | UNKNOWN |
| Gap impact on DI | **MAJOR_DYNAMIC_LOSS** — decel trajectory absent; flat zero boundaries |
| SCORE_INPUT_LOSS | YES |
| **Recovery** | **PARTIALLY_OBSERVED_BY_HF** (end anchor only; interior void) |

**Speed trajectory (boundary anchors)**

| Video local | UTC | Video km/h | Nearest HF ts | HF km/h | Δt ms | Δ speed |
|-------------|-----|------------|---------------|---------|-------|---------|
| 06:35:29 | 04:35:29Z | 36 | `04:35:29.538Z` | 0 | +538 | +36 |
| 06:35:52 | 04:35:52Z | 0 | `04:35:52.304Z` | 0 | +304 | 0 |

---

### GT-20-P0 · 20s phase

| Field | Value |
|-------|-------|
| Video local | `06:37:14` → `06:40:02` |
| UTC | `04:37:14Z` → `04:40:02Z` |
| Settled gap UTC | `04:37:13.913Z` → `04:40:02.534Z` |
| Physical behavior | **MULTIPLE_DYNAMIC_EVENTS** (decel, strong accel, highway transition) |
| Speed anchors (representative) | ~54→51→34→…→119→115→112→111 km/h |
| Confidence | HIGH |
| Video continuity | CONTINUOUS_VISIBLE |

**Telemetry correlation**

| Authority | Result |
|-----------|--------|
| HF interior samples | **0** |
| HF gap boundaries | start **54** km/h · end **36** km/h |
| Native in window | NO |
| TripBehaviorEvent | NO |
| Braking / accel detectors | NO |

| Metric | Value |
|--------|-------|
| HF_SPEED interior | **NONE** |
| HF_SPEED boundaries | **PARTIAL** — start **matches video ~54**; end **misses** (~111 video vs 36 HF) |
| Gap impact | **TOTAL_DYNAMIC_LOSS** — 168.6s void; interior multi-state absent |
| SCORE_INPUT_LOSS | YES |
| **Recovery** | **PARTIALLY_OBSERVED_BY_HF** (start boundary only) |

**Boundary comparison**

| UTC | Video km/h | HF km/h | Δ speed |
|-----|------------|---------|---------|
| 04:37:14Z | 54 | 54 | 0 |
| 04:40:02Z | 111 | 36 | **+75** |

---

### GT-30-P0 · 30s phase

| Field | Value |
|-------|-------|
| Video local | `06:42:55` → `06:44:52` |
| UTC | `04:42:55Z` → `04:44:52Z` |
| Settled gap UTC | `04:42:54.742Z` → `04:44:52.054Z` |
| Physical behavior | **MIXED_DYNAMIC; DECELERATION_TO_STOP** (visible segments) |
| Visible anchors | ~63→51→20→0 km/h (late visible segment) |
| Confidence | MEDIUM-HIGH visible; **UNKNOWN** for cut interval |
| Video continuity | **PARTIAL_CUTS_REPORTED** |

**VIDEO_GT_UNOBSERVED:** intermediate interval between manual cuts — not claimed continuous.

**Telemetry correlation**

| Authority | Result |
|-----------|--------|
| HF interior | **0** |
| HF boundaries | start **0** · end **22** km/h |
| Native / DI detectors | NO |

| Metric | Value |
|--------|-------|
| Gap impact | **NOT_ASSESSABLE** (video) / **MAJOR_DYNAMIC_LOSS** (telemetry void) |
| **Recovery** | **NOT_ASSESSABLE** |

---

### GT-30-P1 · 30s phase

| Field | Value |
|-------|-------|
| Video local | `06:46:16` → `06:47:36` |
| UTC | `04:46:16Z` → `04:47:36Z` |
| Settled gap UTC | `04:46:16.344Z` → `04:47:35.968Z` |
| Physical behavior | **STOP_TO_ACCELERATION; CONTINUED_DRIVING** |
| Speed anchors | ~3→0→32→49→~59→(40–57) km/h |
| Confidence | HIGH |
| Video continuity | CONTINUOUS_VISIBLE |

**Telemetry correlation**

| Authority | Result |
|-----------|--------|
| HF interior | **0** |
| HF boundaries | start **0** · end **4** km/h |
| Native / DI | NO |

| Metric | Value |
|--------|-------|
| HF boundaries | PARTIAL — start ~matches stop; **end misses accel (~59 video vs 4 HF)** |
| Gap impact | **MAJOR_DYNAMIC_LOSS** |
| **Recovery** | **PARTIALLY_OBSERVED_BY_HF** |

---

### GT-60-P0 · 60s phase

| Field | Value |
|-------|-------|
| Video local | `06:54:30` → `06:56:57` |
| UTC | `04:54:30Z` → `04:56:57Z` |
| Settled gap UTC | `04:54:29.814Z` → `04:56:56.693Z` |
| Physical behavior | **URBAN_STOP_GO; FINAL_STOP** |
| Speed anchors | ~14→34→42→24→31→27→19→10→0 km/h |
| Confidence | HIGH |
| Video continuity | CONTINUOUS_VISIBLE |

**Telemetry correlation**

| Authority | Result |
|-----------|--------|
| HF interior | **0** |
| HF boundaries | start **12** · end **14** km/h |
| Native in window | NO (`behavior.harshAcceleration` at `04:54:00Z` — **before** window) |
| TripBehaviorEvent | NO |

| Metric | Value |
|--------|-------|
| HF boundaries | PARTIAL — start close (14 vs 12); **end misses stop (0 video vs 14 HF)** |
| Gap impact | **TOTAL_DYNAMIC_LOSS** for interior stop/go sequence |
| **Recovery** | **PARTIALLY_OBSERVED_BY_HF** |

---

## Scientific table (M)

| GT event | Phase | Physical event | HF | Native | DI |
|----------|-------|----------------|-----|--------|-----|
| GT-10-P0 | 10s | decel to stop | PARTIAL | NO | MISSED |
| GT-20-P0 | 20s | multi dynamic | PARTIAL | NO | MISSED |
| GT-30-P0 | 30s | decel to stop (partial video) | PARTIAL | NO | N_A |
| GT-30-P1 | 30s | stop → accel | PARTIAL | NO | MISSED |
| GT-60-P0 | 60s | urban stop/go | PARTIAL | NO | MISSED |

**Legend:** HF = boundary-only unless interior samples exist (all gaps: **0 interior**). DI = production `TripBehaviorEvent` path. Native = DIMO `events()` in window.

---

## Cadence reassessment (H)

| Cadence | Events in gaps | Fully recovered | Partially recovered | Missed | Native mitigation | DI risk |
|---------|----------------|-----------------|---------------------|--------|---------------------|---------|
| **10s** | 1 | 0 | 1 | 0 | 0 | **CRITICAL** |
| **20s** | 1 | 0 | 1 | 0 | 0 | **CRITICAL** |
| **30s** | 2 | 0 | 1 | 0 | 0 | **CRITICAL** |
| **60s** | 1 | 0 | 1 | 0 | 0 | **CRITICAL** |

---

## Architecture hypothesis (I)

```
HF_SOLE_AUTHORITY_SUFFICIENT = NO
NATIVE_EVENTS_MITIGATE_HF_GAPS = NO
OTHER_AUTHORITY_MITIGATES_HF_GAPS = NO
```

Video-confirmed dynamics occur inside persistent HF gaps at **all** cadences including 10s. No native or DI detector recovery at GT windows (N=1).

---

## Session context

| Item | Value |
|------|-------|
| VehicleTrip | `5c788a26-c9ec-4b57-9abb-71d9cbc257a7` |
| Trip drivingStressScore | 16 |
| brakingStressScore | 0 |
| Session native events | 1 × `behavior.harshAcceleration` @ `04:54:00Z` (outside GT windows) |
| TripBehaviorEvent (session) | 0 |
| DI V2 stage output | NOT_AVAILABLE |
| LATEST_LIVE (session) | NOT_AVAILABLE in settlement export |

---

## Cross-links

- Alignment windows: `EXP_019_VIDEO_GT_ALIGNMENT_WINDOWS_2026-09-07.md`
- Prior correlation pass: `EXP_019_VIDEO_GT_VS_TELEMETRY_CORRELATION_2026-09-07.md` (superseded GT-10 classification — now decel not accel)
- Script: `exp-019-video-gt-event-register-export.cjs`
