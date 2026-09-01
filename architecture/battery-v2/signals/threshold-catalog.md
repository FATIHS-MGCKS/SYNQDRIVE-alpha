# Battery V2 — Threshold & Calibration Catalog

**Gap:** `BAT-V2-GAP-THRESHOLD-PROVENANCE-001`  
**Legend:** CODE FACT = verified constant in repo; rationale may still be UNKNOWN

## LV REST / opening

| Threshold | Value | Classification | Source |
|-----------|-------|----------------|--------|
| Speed at rest | ≤ 0.5 km/h | CODE FACT | `lv-rest-window.policy.ts` |
| Engine load running proxy | > 5% | CODE FACT | `lv-rest-window.policy.ts`, ingestion |
| LV charging voltage | ≥ 13.25 V | CODE FACT | `DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V` |
| Wake threshold | max(resting+0.5, 13.8) V | CODE FACT | `lv-rest-window.policy.ts` |
| Plausible LV voltage | 9.0–16.0 V | CODE FACT | ingestion + policy |
| Stability dwell | 5 min | CODE FACT | `lv-rest-window.policy.ts` |
| Max rest window | 24 h | CODE FACT | `lv-rest-window.policy.ts` |
| Trip bridge tolerance | 120 s | CODE FACT | `lv-rest-window.policy.ts` |
| REST_60M delay | 60 min (env) | CODE FACT | `battery-health-v2.config.ts` |
| REST_6H delay | 6 h (env) | CODE FACT | `battery-health-v2.config.ts` |
| REST target grace | 30 min (env) | CODE FACT | `battery-health-v2.config.ts` |
| REST_60M quality window | ±15 min | CODE FACT | `battery-rest-target-evaluation.ts` |
| REST_6H quality window | ±30 min | CODE FACT | `battery-rest-target-evaluation.ts` |

## REST_60M window history

**Current code:** ±15 min half-width (`REST_60M_QUALITY_WINDOW_MS = 15 * 60_000`).

**Historical search:** No unresolved contradiction found between architecture memos and current code for REST_60M window. Older ±30 min references in unrelated domains (energy events, UI freshness) — not REST target quality.

**Verdict:** Current ±15 min is **CONFIRMED** code fact; intentional change PR not identified in Phase 2 search — provenance **UNKNOWN**.

## Execution

| Threshold | Value | Classification |
|-----------|-------|----------------|
| Redis lock TTL | 120 s | CODE FACT |
| Start proxy delay | 90 s | CODE FACT |
| Provider obs future skew | 60 s | CODE FACT |
| Snapshot stale | 5 min | CODE FACT |
| Capability stale | 6 h | CODE FACT |
| Capability loss count | 3 | CODE FACT |
| Capability degraded grace | 24 h | CODE FACT |

## HV M2/M3

See `health-model/hv-capacity.md` — all listed constants are CODE FACT; physical calibration rationale **UNKNOWN**.

## LV assessment / publication

| Threshold | Value | Classification |
|-----------|-------|----------------|
| REST_AFTER_SHUTDOWN weight | 0.05 | CODE FACT |
| Publication EWMA alpha | 0.05 | CODE FACT |

Rationale for scoring weights — **UNKNOWN** (domain reasoning not documented in repo).
