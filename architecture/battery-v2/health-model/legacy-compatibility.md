# Battery V2 — Legacy Compatibility

**Epistemic status:** INFERRED — principle documented; full mapping incomplete

## Principle

Battery V2 knowledge must **not collapse**:

1. **Legacy compatibility behavior** (e.g. `battery_features`, legacy crank paths, old UI adapters)
2. **Canonical Battery V2 authority** (sessions, measurements, assessments under new pipeline)

into a single model.

## Known legacy bridge (partially verified)

| Legacy surface | Bridge behavior | Canonical requirement |
|----------------|-----------------|---------------------|
| `battery_features.restWindowStartedAt` | `reconcileLegacyRestTargets()` | Requires matching `LV_REST_WINDOW` session |
| `BatteryV2Service.onSnapshot()` | Separate `battery_features` persistence | Parallel to shadow ingestion bridge |
| Legacy `rest-target:*` keys | **Rejected** — must use `BatteryV2RestTargetProducer` + `restWindowId` | Contract fix 2026-08-26 |

## Reconciliation rule

Legacy reconciliation **does not** enqueue bare REST jobs without `restWindowId`. It schedules via canonical producer when session exists.

**Evidence:** `BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md`, `battery-v2-reconciliation.service.ts`

## Consumer caution

UI may still read legacy summaries while shadow pipeline populates canonical tables. Which surface is authoritative per screen is **not fully reconstructed** (`BAT-V2-GAP-CONSUMER-READ-001`).

## Agent rule

When changing legacy or canonical paths, update **both** the compatibility note here and the canonical graph nodes — do not silently redirect legacy callers without documenting non-effects.
