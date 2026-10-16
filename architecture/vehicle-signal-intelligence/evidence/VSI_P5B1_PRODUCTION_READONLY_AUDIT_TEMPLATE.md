# VSI P5B.1 — Production read-only audit template (NOT EXECUTED)

| Field | Value |
|-------|-------|
| **Purpose** | SELECT-only inventory before operator offline replay against Production |
| **Execution** | Manual, out-of-band; **not** part of P5B.1 code deploy |
| **Mutations** | Forbidden |

## Preconditions

- Existing DB access controls and audit logging.
- No `VSI_P5B1_EVIDENCE_STORE_WRITE_*` flags on Production.
- Scope one `organizationId` and bounded `decision_at` window per run.

## Required outputs

1. Total `apd_shadow_reconciliation_decisions` in window (scoped org).
2. Counts by `policy_version` (B2 vs B4 separate).
3. Distinct `vehicle_id` count.
4. Breakdown by `profile_class` / `reason` (top-N).
5. Fraction with **no** `vehicle_signal_capability_profiles` row for historically attributable link at `decision_at` (report limitation — do not synthesize profiles).
6. UNKNOWN attribution proxy: vehicles with >1 link active at `decision_at` (lifecycle SQL or offline replay sample).
7. Domain approval / consumer demand breakdown via offline replay JSON (`scientificMetrics`), not ad-hoc SQL alone.

## Example SELECT snippets (illustrative)

```sql
-- 1) Decision volume (single org, bounded window)
SELECT policy_version, COUNT(*) AS n
FROM apd_shadow_reconciliation_decisions
WHERE organization_id = :org_id
  AND decision_at >= :from_ts
  AND decision_at < :to_ts
GROUP BY policy_version
ORDER BY policy_version;
```

```sql
-- 2) Vehicles in scope
SELECT COUNT(DISTINCT vehicle_id) AS vehicles
FROM apd_shadow_reconciliation_decisions
WHERE organization_id = :org_id
  AND decision_at >= :from_ts
  AND decision_at < :to_ts;
```

If decision-time profile authority cannot be established from persisted timestamps, record **`HISTORICAL_PROFILE_UNAVAILABLE`** in the audit notes — do not construct evidence.
