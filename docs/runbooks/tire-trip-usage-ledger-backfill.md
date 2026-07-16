# Runbook: Tire Trip Usage Ledger Backfill

**Controlled backfill workflow** for historical `TireTripUsageLedger` rows from finalized trips with single-setup attribution.

| Field | Value |
|-------|------|
| **Valid from** | Backend ≥ commit with `TireTripUsageBackfillService` (Prompt 13) |
| **Audit version** | `tire-trip-usage-backfill-audit-2026-07-v1` |
| **Schema version** | `20260716230000_tire_trip_usage_replay_safety` |
| **Audit script** | [`backend/scripts/ops/audit-tire-trip-usage-backfill.ts`](../../backend/scripts/ops/audit-tire-trip-usage-backfill.ts) |
| **Apply service** | [`backend/src/modules/vehicle-intelligence/tires/tire-trip-usage-backfill.service.ts`](../../backend/src/modules/vehicle-intelligence/tires/tire-trip-usage-backfill.service.ts) |
| **Reconciliation** | [`backend/src/modules/vehicle-intelligence/tires/tire-trip-usage-ledger-reconciliation.service.ts`](../../backend/src/modules/vehicle-intelligence/tires/tire-trip-usage-ledger-reconciliation.service.ts) |
| **Prior dry-run report** | [`docs/audits/tire-trip-usage-backfill-dry-run-2026-07.md`](../audits/tire-trip-usage-backfill-dry-run-2026-07.md) |

> **Principle:** Audit is read-only. Apply is **DRY RUN by default**. Only `SINGLE_SETUP` trips without odometer conflicts are auto-written. Multi-setup / boundary / incomplete-history trips remain in **manual review**.

---

## 1. Prerequisites

### 1.1 Required migrations

| Migration | Purpose |
|-----------|---------|
| `20260716210000_tire_trip_usage_ledger` | Ledger table + unique `(tripId, tireSetupId)` |
| `20260716220000_tire_trip_usage_attribution` | Trip processing status fields |
| `20260716230000_tire_trip_usage_replay_safety` | Revision/invalidation + replay safety |

```bash
cd backend
npx prisma migrate status
```

### 1.2 Environment variables

| Variable | Purpose | Audit | Apply |
|----------|---------|-------|-------|
| `DATABASE_URL` | Target PostgreSQL | ✓ | ✓ |
| `TIRE_TRIP_USAGE_BACKFILL_AUDIT_ALLOW_REMOTE` | Non-local DB for read-only audit | ✓ | — |
| `TIRE_TRIP_USAGE_BACKFILL_AUDIT_ALLOW_PROD` | Prod-like DB for read-only audit | ✓ | — |
| `TIRE_TRIP_USAGE_BACKFILL_APPLY_ALLOW_REMOTE` | Non-local DB for apply | — | ✓ |
| `TIRE_TRIP_USAGE_BACKFILL_APPLY_ALLOW_PROD` | Prod-like DB for apply (supervised only) | — | ✓ |

Production-like URLs are **blocked by default** for both audit and apply.

---

## 2. Phase A — Read-only dry run (Prompt 12)

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts \
  --organization-id=<ORG_UUID> --days=60 --batch-size=200 --full-setup-history
```

Fixtures (no database):

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts --fixtures-only
```

Review:

- `SINGLE_SETUP` + no odometer conflict → eligible for automated apply
- `MULTIPLE_SETUPS` / `SETUP_CHANGE_IN_TRIP` / `INCOMPLETE_HISTORY` → **manual review only**
- `odometerConflict: yes` → resolve before apply

Outputs:

- `docs/audits/tire-trip-usage-backfill-dry-run-2026-07.md`
- `docs/audits/data/tire-trip-usage-backfill-dry-run-2026-07.json` (anonymized)

---

## 3. Phase B — Dry-run apply plan (default)

Scoped plan for one organization, vehicle, or explicit trip IDs. **No writes** unless `--apply`.

```bash
cd backend
GIT_REF=$(git rev-parse HEAD)

npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts \
  --organization-id=<ORG_UUID> \
  --days=60 \
  --full-setup-history \
  --confirm-git-ref="$GIT_REF" \
  --confirm-schema-version=20260716230000_tire_trip_usage_replay_safety \
  --operator=ops@example.com \
  --reason=staging-validation \
  --max-batch-size=25 \
  --expected-audit-version=tire-trip-usage-backfill-audit-2026-07-v1
```

Note the `reportHash` in JSON output — required for apply.

Fixture dry-run plan (CI):

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts \
  --fixtures-only \
  --organization-id=fixture-org \
  --confirm-git-ref="$GIT_REF" \
  --confirm-schema-version=20260716230000_tire_trip_usage_replay_safety \
  --operator=ci --reason=fixture-plan --max-batch-size=10 \
  --expected-audit-version=tire-trip-usage-backfill-audit-2026-07-v1
```

---

## 4. Phase C — Controlled apply

**Never run against production in this prompt series without explicit supervised override.**

Required flags:

| Flag | Purpose |
|------|---------|
| `--apply` | Enable writes |
| `--organization-id` or `--vehicle-id` or `--trip-id` | Scope guard |
| `--confirm-backup` | Operator confirms DB backup |
| `--expected-report-hash` | Must match dry-run plan hash |
| `--confirm-git-ref` | Must match deployed code |
| `--confirm-schema-version` | Schema migration guard |
| `--operator` / `--reason` | Audit trail |
| `--max-batch-size` | Batch limit (default 50) |

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts \
  --organization-id=<ORG_UUID> \
  --days=60 \
  --full-setup-history \
  --apply \
  --confirm-backup \
  --expected-report-hash=<HASH_FROM_DRY_RUN> \
  --confirm-git-ref="$GIT_REF" \
  --confirm-schema-version=20260716230000_tire_trip_usage_replay_safety \
  --operator=ops@example.com \
  --reason=controlled-historical-backfill \
  --max-batch-size=25 \
  --expected-audit-version=tire-trip-usage-backfill-audit-2026-07-v1
```

### Apply behaviour

1. Each auto-applicable trip → `TireTripUsageService.processCanonicalTripFinalization` (`trigger: historical_backfill`)
2. Idempotent: unchanged fingerprint → skip (no duplicate ledger row)
3. Post-batch → `TireTripUsageLedgerReconciliationService.repairSetupAggregates` rebuilds:
   - `totalKmOnSet`, `cityKm`, `ruralKm`, `highwayKm`
   - `harshAccelEvents`, `harshBrakeEvents`, `harshCornerEvents`
4. Conflicts never auto-applied

---

## 5. Optional — Tire health recalculation

Separate from ledger write; batch-limited to avoid fleet-wide recalc storm:

```bash
...apply flags above... \
  --recalculate \
  --recalculate-max-setups=10
```

Only vehicles touched by the apply batch are considered; capped by `--recalculate-max-setups`.

---

## 6. Aggregate reconciliation (standalone)

For drift between setup counters and ledger source of truth:

```typescript
// Dry run
await reconciliationService.dryRunReconcileSetupAggregates(['setup-uuid'], {
  operator: 'ops@example',
  reason: 'post-migration-check',
});

// Controlled repair
await reconciliationService.repairSetupAggregates(['setup-uuid'], {
  operator: 'ops@example',
  reason: 'ledger-reconcile',
});
```

- **Dry run:** diff only, no writes
- **Repair:** rebuild from active (non-invalidated) ledger rows + `TRIP_USAGE_REVISED` audit event
- **Idempotent:** matching aggregates → `NO_OP`

---

## 7. Rollback / recovery

| Situation | Action |
|-----------|--------|
| Wrong trip attributed | Do **not** delete ledger rows — use `invalidateTripUsageForTrip` (Prompt 11) |
| Aggregate drift after apply | Run reconciliation repair for affected setup IDs |
| Partial batch failure | Re-run dry-run plan; idempotent skips already-applied fingerprints |
| Conflict trips | Resolve manually; never force multi-setup split without signed-off policy |

---

## 8. Verification checklist

- [ ] Dry-run report reviewed (conflicts, odometer issues, km deviations)
- [ ] `reportHash` captured from scoped dry-run
- [ ] Backup confirmed before `--apply`
- [ ] Apply scoped to single org/vehicle
- [ ] `max-batch-size` appropriate for staging validation
- [ ] Post-apply reconciliation `repaired` count matches affected setups
- [ ] No conflict-class trips in `autoApplicable` list

---

*Do not execute apply against production as part of Prompt 13 development/acceptance.*
