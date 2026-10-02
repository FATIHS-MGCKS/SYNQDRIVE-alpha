# EXP-021 C0.5 — CG-01 `COLD_ENGINE_FULL_THROTTLE` containment (2026-09-24)

| Field | Value |
|-------|-------|
| **Workstream** | EXP-021 C0.5 |
| **Gap** | CG-01 (C0.4 contract compliance) |
| **Contract** | KEC-0.2.0-candidate — R1 historical OBD `INTERVAL_ONLY`; no point-time conjunction claims |
| **Status** | `VALIDATED` (code/tests) — draft PR, **not merged, not deployed** |

## Problem

`detectColdEngineFullThrottle` treats co-located bucket-labelled coolant + throttle samples as a simultaneous cold-engine full-throttle abuse event. For Ruptela R1 historical OBD, that temporal conjunction is not established (C0/C0.1/C0.4). Production held **326** persisted `COLD_ENGINE_FULL_THROTTLE` rows (`HF_DERIVED`), still visible on the unified behaviour read model at full event-list strength. Misuse escalation from uncertain OBD was already capped under C0.3; the event presentation was not.

## Change (narrow)

| Layer | Behaviour |
|-------|-----------|
| Future derivation | `COLD_ENGINE_FULL_THROTTLE` added to `R1_CONTAINED_HF_ABUSE_EVENT_TYPES` → `applyR1HfAbuseContainment` suppresses new R1 detections |
| Persisted rows | Unchanged in DB; excluded from replace scope on R1 re-enrichment (same as C0.3 types) |
| Read model | `isContainedHfAbuseEvent` omits R1 rows from `buildUnifiedBehaviorEvents` |
| Trip counters | `countContainedAbuseRowsForReadAdjustment` — marker-aware subtraction so v1-enriched trips still adjust CG-01 rows |
| Misuse rules | `ruleColdEngineAbuse` ignores contained `COLD_ENGINE_FULL_THROTTLE` on R1 (HIGH_RPM unchanged) |
| Marker | `R1_TEMPORAL_CONTAINMENT_VERSION` → `r1-temporal-containment-v2`; summary lists all four contained types |

## Non-effects

- `COLD_ENGINE_HIGH_RPM`, KICKDOWN, LAUNCH_LIKE_START, speeding, max speed, trip end, Tesla/API_SYNTHETIC, UNKNOWN guessing, historical delete/update, C1.

## Validation

- `r1-temporal-containment.spec.ts` (conjunction + marker-aware counts)
- `trip-behavior-enrichment.r1-containment.spec.ts`
- `unified-behavior-read-model.r1-containment.spec.ts`
- `trip-analytics-canonical.service.spec.ts` (v1 marker + CG-01 rows)
- `misuse-case-rules.service.spec.ts` (R1 vs API_SYNTHETIC)

## Production inventory (read-only, pre-deploy)

`R1_COLD_ENGINE_FULL_THROTTLE_PERSISTED_COUNT=326` on `e30de759…` — sample metadata `HF_DERIVED`.
