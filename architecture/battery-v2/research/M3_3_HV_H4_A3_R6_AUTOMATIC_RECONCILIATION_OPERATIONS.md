# M3.3-HV-H4-A3 R6 — Automatic reconciliation operations (code-ready)

## Purpose

Enable continuous, bounded A3.5 reconciliation for **explicitly allowlisted** tenant/vehicle pairs only. Default runtime remains **OFF**.

## Activation (production — owner-authorized only)

1. Set `BATTERY_HV_H4_A3_RECONCILIATION_ENABLED=true`
2. Set `BATTERY_HV_H4_A3_RECONCILIATION_COHORT_JSON` to a JSON document:

```json
{
  "version": "M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1",
  "members": [
    {
      "organizationId": "<tenant-uuid>",
      "vehicleId": "<vehicle-uuid>"
    }
  ]
}
```

3. Restart both PM2 backend replicas (`synqdrive`, `synqdrive-b`) with `--update-env`.

If the master flag is ON but cohort JSON is missing, invalid, empty, or unsupported, the scheduler performs **no fleet scan and no evidence writes** (`SKIPPED_COHORT_NOT_CONFIGURED`).

## Safety properties

- Leader guard: `battery_hv_h4_a3_reconciliation` (single writer per tick cluster-wide).
- Redis fleet cursor: `battery:hv:h4:a3:reconciliation:cursor:v1` (resume after restart).
- Idempotent revision + ACK inserts (scientific identity unique constraints).
- `isOngoing` sessions are inspected but **not** materialized until closed.
- Cohort scope restricts `hv_charge_sessions` scans to allowlisted `(organizationId, vehicleId)` pairs only.
- Does not modify EED projection, LV longitudinal reconciliation, or publication paths.

## Observability

- Logs: `hv_h4_a3_reconciliation_tick` (includes `blocked_cohort`, `skipped_ongoing`).
- Prometheus: `synqdrive_battery_hv_h4_a3_reconciliation_*` scheduler/tick counters.
- Scheduler tick result `COHORT_NOT_CONFIGURED` when allowlist is not READY.

## Deactivation

Remove or set `BATTERY_HV_H4_A3_RECONCILIATION_ENABLED=false`, remove cohort JSON override if added, restart both replicas. Append-only evidence rows are retained.
