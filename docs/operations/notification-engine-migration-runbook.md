# Notification Engine — Legacy → V2 Migration Runbook (V4.9.877)

**Audience:** Platform ops / on-call  
**Scope:** Per-organization migration from `dashboard_insights` to `notifications` (V2)

---

## 1. Principles

| Property | Guarantee |
|----------|-----------|
| Tenant isolation | `--org <uuid>` required for backfill; queries always org-scoped |
| Dry-run safety | `--dry-run` performs **zero** DB writes and **does not** persist checkpoints |
| Idempotency | `legacy_insight_id` bridge + active fingerprint merge |
| Deterministic mapping | Event registry via `resolveInsightFingerprint` — never title/dedupeKey alone |
| Timestamp preservation | `firstSeenAt` / `lastSeenAt` from insight `createdAt` / `updatedAt` |
| Resume | `--checkpoint` JSON with cursor (`lastInsightId`, `lastInsightUpdatedAt`) |
| Rollback | **Flag deactivation only** — do not delete V2 rows after cutover |

---

## 2. Pre-flight

1. Confirm target org exists in production DB.
2. Ensure `NOTIFICATIONS_V2` producers are deployed (shadow ingest may already run).
3. Take org-scoped DB snapshot or verify recent backup.
4. Run architecture audit (included in dry-run script).

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/notification-migration-dry-run.ts \
  --org <ORG_ID> \
  --out /tmp/notification-dry-run-<ORG_ID>.json
```

Review JSON report:

- `report.duplicates` — legacy rows consolidating to same fingerprint
- `report.unmigratable` / `report.missingEntityIds` — blockers
- `report.projected` — expected migrated/merged/skipped/unresolved counts

---

## 3. Backfill execution

### Dry-run (mandatory)

```bash
npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts \
  --org <ORG_ID> \
  --dry-run \
  --batch-size 100 \
  --out /tmp/notification-backfill-dry-<ORG_ID>.json
```

### Apply

```bash
npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts \
  --org <ORG_ID> \
  --apply \
  --batch-size 100 \
  --checkpoint /tmp/notification-backfill-<ORG_ID>.json \
  --out /tmp/notification-backfill-apply-<ORG_ID>.json
```

**Resume after interruption:** re-run the same command with the same `--checkpoint` path. Checkpoint org must match `--org`.

**Optional:** `--include-inactive` migrates resolved/inactive insights when no active V2 fingerprint exists.

### Per-record failures

Failed insights are logged (`notification.migration.backfill_record_failed`) and listed in JSON `failures[]` with `insightId`, `insightType`, `error`. The batch continues; exit code is non-zero if any failures occurred.

---

## 4. Acceptance

```bash
npx ts-node -r tsconfig-paths/register scripts/notification-migration-acceptance.ts \
  --org <ORG_ID> \
  --out /tmp/notification-acceptance-<ORG_ID>.json
```

### Critical checks (must pass)

| Check | Description |
|-------|-------------|
| `no_duplicate_active_fingerprints` | No two OPEN/ACK/SNOOZED rows share fingerprint |
| `notifications_have_entity_ids` | No empty/unknown `entityId` |
| `no_orphan_occurrences` | Occurrences reference existing notifications |
| `no_orphan_receipts` | Receipts reference existing notifications |
| `no_invalid_entity_references` | Vehicle/station FK resolves in org |
| `migration_count_consistent` | Active migratable insights bridged via `legacy_insight_id` or occurrence `source_ref` |
| `no_unresolved_mapping_errors` | Active insights map to registry candidates |
| `delivery_dead_letter_reviewed` | No DEAD_LETTER outbox rows |
| `no_orphan_outbox_rows` | Outbox references existing notifications |
| `no_outbox_org_mismatch` | Outbox `organization_id` matches notification |

### Warning checks

| Check | Threshold |
|-------|-----------|
| `delivery_backlog_acceptable` | PENDING/FAILED outbox &lt; 500 |

Exit code `0` = all critical + warning checks passed.

---

## 5. Cutover

After acceptance passes for pilot org:

1. `NOTIFICATIONS_V2=true` (backend)
2. `VITE_NOTIFICATIONS_V2=on` (frontend, pilot org)
3. Monitor [observability runbook](./notification-engine-observability-runbook.md) 48h
4. `NOTIFICATIONS_DELIVERY_ENABLED=true` when ready

---

## 6. Rollback / deactivation

**Do not delete migrated `notifications` rows for rollback.**

| Action | Effect |
|--------|--------|
| `NOTIFICATIONS_V2=false` | API + ingest revert to V1 paths; V2 data remains |
| `VITE_NOTIFICATIONS_V2=off` | Frontend shows V1 action queue |
| `NOTIFICATIONS_DELIVERY_ENABLED=false` | Stops outbound delivery; outbox retained |

Re-enable flags after fixing root cause. Re-run backfill is safe (idempotent).

To **stop mid-backfill:** kill process; do not delete checkpoint. Resume with same `--checkpoint` file.

To **reset backfill cursor:** delete checkpoint file and re-run from start (idempotent skips already migrated).

---

## 7. Script reference

| Script | Required flags | Optional flags |
|--------|----------------|----------------|
| `notification-migration-dry-run.ts` | — | `--org`, `--out` |
| `notification-migration-backfill.ts` | `--org` | `--dry-run` (default), `--apply`, `--batch-size`, `--checkpoint`, `--include-inactive`, `--out` |
| `notification-migration-acceptance.ts` | — (org strongly recommended) | `--org`, `--out` |

All scripts emit **schemaVersion `1.0`** JSON when `--out` is set.

---

## Related

- `docs/notification-engine-production-readiness.md`
- `docs/notification-engine-migration-plan.md`
- `docs/operations/notification-engine-observability-runbook.md`
