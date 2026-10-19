# G5C-N16 — Estimated 12V battery health V1 (shadow)

**Model:** `LV_ESTIMATED_BATTERY_HEALTH_V1_2026-10-19`  
**Status:** Shadow-only; `customerPublicationEnabled: false`; `measuredSOH: UNKNOWN`

## Separation from N14

| Output | N14 `LvOperationalConditionV1` | N16 shadow |
|--------|--------------------------------|------------|
| Operational voltage / charge risk | `operationalRiskStatus` | Not reused as health |
| Startability | `startabilityStatus` | Load family input only |
| Estimated battery health | — | `estimatedHealthStatus` |

N16 consumes the same qualified REST episode machinery as N14 but applies a distinct multi-family policy (rest, longitudinal trend, validated crank, charging context).

## Ops harness

`backend/scripts/ops/lv-estimated-battery-health-evaluation-readonly.ts` — 120-day window, high observation limit, restore cutoff `2026-10-17T21:55:43Z`.

Production: use `synqdrive_battery_v2_forensic_ro` via `/opt/synqdrive/shared/ops/battery-v2-forensic-ro-psql.sh` wrapper pattern for `DATABASE_URL` (credentials on VPS only).

## P1 decision policy hardening (2026-10-19)

**Policy id:** `LV_ESTIMATED_BATTERY_HEALTH_V1_DECISION_POLICY_P1_2026-10-19`

- RED requires validated load critical, longitudinal decline with weak rests, or critical+warning mix **with** decline — not `CRITICAL >= 2` REST alone.
- `LONGITUDINAL_STABLE` and REST-only “charging context” are **not** independent corroboration (`HEALTH_CORRELATED_EVIDENCE_NOT_CORROBORATION`).
- `CHARGING_RECOVERY_CONTEXT` only when evaluable `REST_SELF_DISCHARGE_TREND` session features exist.
- Assessments include `decisionTrace` (episode ids, bands, `finalRuleId`, independent vs correlated families).

### P2 RED corroboration safety (2026-10-19)

- Removed `RULE_LONGITUDINAL_DECLINE_WITH_WEAK_REST` (same-episode trend cannot authorize RED).
- `LONGITUDINAL_STABILITY` is never counted as an independent supporting family (DECLINE or STABLE).
- REST-only RED without validated load requires `CRITICAL >= 2` **and** `WARNING >= 2` (`RULE_SUSTAINED_CRITICAL_WARNING_MIX`), not trend-gated.

Pilot expectation after P1 (same episode counts as pre-P1 fleet eval):

| Vehicle | N14 | N16 pre-P1 | N16 post-P1 (expected) | Rule |
|---------|-----|------------|------------------------|------|
| KS MS 661 | YELLOW | RED | YELLOW | `RULE_REST_WARNING_OR_DECLINE` — 3 CRITICAL without load/trend corroboration |
| WOB L 7503 | GREEN | YELLOW | GREEN | `RULE_REST_HEALTHY_MAJORITY` — ≥60% GOOD+WATCH, ≤2 WARNING |
