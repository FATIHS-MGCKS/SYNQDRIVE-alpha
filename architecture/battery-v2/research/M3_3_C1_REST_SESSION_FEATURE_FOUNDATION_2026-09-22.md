# M3.3C C1 — Rest session feature foundation (schema + pure policy)

**Date:** 2026-09-22  
**Starting main:** `eca3673a85b7987f7bd2b9c9709af01271d9a168`  
**Authority:** `M3_3_C0_RETENTION_CHARGE_OPPORTUNITY_PREFLIGHT_2026-09-22.md`

## Scope delivered (C1)

| Item | Status |
|------|--------|
| `battery_rest_session_features` table + enums | **YES** |
| Unique constraints (input digest + semantic revision) | **YES** |
| `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` default **OFF** | **YES** |
| Pure retention policy + Theil-Sen | **YES** |
| Unit tests A–H + edge cases | **YES** |
| Ephemeral PostgreSQL migration verification | **YES** |

## Explicitly not in C1

- C2 charge-context extraction
- C3 digest generation / semantic revision allocation / repository writes
- C4 generalized-evidence or rest-session lifecycle hooks
- C5 metrics / customer surfaces
- Production deploy / migration / flag enable

## Schema summary

**Table:** `battery_rest_session_features` (append-only; no feature update service)

**Enums:**

- `BatteryRestSessionFeatureComputationPhase`: `INCREMENTAL`, `FINAL`
- `BatteryRestSessionFeatureSessionTrust`: `VALID`, `INVALIDATED`
- `BatteryRestSessionChargeOpportunityClass`: `SUFFICIENT`, `PARTIAL`, `INSUFFICIENT`, `UNKNOWN`

**Uniques:**

- `(organization_id, rest_session_id, feature_model_version, input_digest)`
- `(organization_id, rest_session_id, feature_model_version, retention_policy_version, charge_opportunity_policy_version, semantic_revision)`

**Policy versions (C1):** `M3_3C_C1_V1` for model, retention, and charge-opportunity policy fields.

## Pure policy

Path: `generalized-evidence/rest-session-features/`

- Temporal authority: **`actualRestAgeMs`**
- Slope: **Theil-Sen median pairwise** (`NO_HARD_POINT_DELETION_THEIL_SEN_ROBUST_ONLY`)
- Voltage internal unit: **mV** via `round(voltageV * 1000)`

## Validation commands

```bash
cd backend && npx prisma generate && npx prisma validate
npm run test -- rest-session-retention.policy.spec.ts
npm run test:battery:v2:rest-session-feature:migration  # requires ephemeral DATABASE_URL
bash architecture/battery-v2/scripts/validate-graph.sh
```

## Production

```
PRODUCTION_CHANGED=NO
SHADOW_FLAG_RUNTIME_WRITER_COUNT=0
```
