# Runbook: Tire Odometer Anchor Backfill

**Controlled backfill workflow** for legacy tire setups missing a traceable install odometer anchor.

| Field | Value |
|-------|------|
| **Valid from** | Backend ≥ commit with `TireOdometerAnchorBackfillService` (Prompt 8) |
| **Candidate version** | `tire-odometer-anchor-backfill-2026-07-v1` |
| **Schema version** | `20260716190000_tire_odometer_anchor` |
| **Audit script** | [`backend/scripts/ops/audit-tire-odometer-anchor-candidates.ts`](../../backend/scripts/ops/audit-tire-odometer-anchor-candidates.ts) |
| **Apply service** | [`backend/src/modules/vehicle-intelligence/tires/tire-odometer-anchor-backfill.service.ts`](../../backend/src/modules/vehicle-intelligence/tires/tire-odometer-anchor-backfill.service.ts) |
| **Prior audit report** | [`docs/audits/tire-odometer-anchor-backfill-candidates-2026-07.md`](../audits/tire-odometer-anchor-backfill-candidates-2026-07.md) |

> **Principle:** Audit is read-only. Apply is **DRY RUN by default**. Writes require explicit `--apply` plus operator confirmations. **No fleet-wide uncontrolled apply.**

---

## 1. Prerequisites

### 1.1 Required migrations

| Migration | Purpose |
|-----------|---------|
| `20260716190000_tire_odometer_anchor` | Anchor fields on `vehicle_tire_setups` + mount periods |
| `20260716200000_tire_odometer_anchor_backfill_event` | `TireEventType.ODOMETER_ANCHOR_BACKFILLED` |

```bash
cd backend
npx prisma migrate status
```

### 1.2 Environment variables

| Variable | Purpose | Audit | Apply |
|----------|---------|-------|-------|
| `DATABASE_URL` | Target PostgreSQL | ✓ | ✓ |
| `TIRE_ODOMETER_ANCHOR_AUDIT_ALLOW_REMOTE` | Non-local DB for read-only audit | ✓ | — |
| `TIRE_ODOMETER_ANCHOR_AUDIT_ALLOW_PROD` | Prod-like DB for read-only audit | ✓ | — |
| `TIRE_ODOMETER_ANCHOR_APPLY_ALLOW_REMOTE` | Non-local DB for apply | — | ✓ |
| `TIRE_ODOMETER_ANCHOR_APPLY_ALLOW_PROD` | Prod-like DB for apply (supervised only) | — | ✓ |

Production-like URLs are **blocked by default** for both audit and apply.

---

## 2. Phase A — Read-only audit (Prompt 7)

Generate candidate inventory without writes:

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts \
  --output-dir=../docs/audits/data \
  --report=../docs/audits/tire-odometer-anchor-backfill-candidates-2026-07.md
```

CI / local fixtures (no database):

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts --fixtures-only
```

Review output:

- `EXACT` / `HIGH_CONFIDENCE` → eligible for automated apply
- `MEDIUM_CONFIDENCE` / `LOW_CONFIDENCE` / `CONFLICTING_DATA` → **manual review only** (never auto-applied)
- `NO_SAFE_CANDIDATE` → no historical km invented; optional status-only path below

---

## 3. Phase B — Dry-run apply plan (default)

Scoped plan for one organization or explicit setup IDs. **No writes** unless `--apply` is passed.

```bash
cd backend
GIT_REF=$(git rev-parse HEAD)

npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts \
  --organization-id=<ORG_UUID> \
  --confirm-git-ref="$GIT_REF" \
  --confirm-schema-version=20260716190000_tire_odometer_anchor \
  --expected-candidate-version=tire-odometer-anchor-backfill-2026-07-v1 \
  --operator="<name>" \
  --reason="staging dry-run validation" \
  --max-batch-size=25
```

Or target explicit setups:

```bash
... --setup-id=<SETUP_UUID> --setup-id=<SETUP_UUID2> ...
```

Record from JSON output:

- `manifestHash` — required for apply
- `plan.autoApplicable` count — must be ≤ `max-batch-size`
- `manualReviewSetupIds` — operator review queue

---

## 4. Phase C — Controlled apply

### 4.1 Required flags (all mandatory)

| Flag | Purpose |
|------|---------|
| `--apply` | Enables writes (without it: dry run only) |
| `--organization-id=<uuid>` **or** `--setup-id=<uuid>` | Scope guard |
| `--expected-candidate-version=tire-odometer-anchor-backfill-2026-07-v1` | Algorithm version pin |
| `--expected-manifest-hash=<hash>` | Candidate set pin from dry-run plan |
| `--confirm-git-ref=<git-sha>` | Must match current `HEAD` |
| `--confirm-schema-version=20260716190000_tire_odometer_anchor` | Schema pin |
| `--confirm-backup` | Operator confirms DB backup |
| `--operator=<id>` | Audit attribution |
| `--reason=<text>` | Change reason |
| `--max-batch-size=<n>` | Hard cap on writes per run |

### 4.2 Example (staging)

```bash
cd backend
GIT_REF=$(git rev-parse HEAD)
MANIFEST_HASH="<from-dry-run-output>"

npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts \
  --organization-id=<ORG_UUID> \
  --apply \
  --confirm-backup \
  --confirm-git-ref="$GIT_REF" \
  --confirm-schema-version=20260716190000_tire_odometer_anchor \
  --expected-candidate-version=tire-odometer-anchor-backfill-2026-07-v1 \
  --expected-manifest-hash="$MANIFEST_HASH" \
  --operator="ops@synqdrive" \
  --reason="org staging anchor backfill batch 1" \
  --max-batch-size=10
```

### 4.3 What each apply writes

Per auto-applicable setup (`EXACT` or `HIGH_CONFIDENCE` only):

| Target | Fields |
|--------|--------|
| `vehicle_tire_setups` | `installed_odometer_km`, `installed_odometer_source`, `installed_odometer_captured_at`, `odometer_anchor_status=ANCHORED`, `odometer_anchor_confidence` |
| `vehicle_tire_setup_mount_periods` | Open period updated or created with same anchor fields |
| `tire_events` | `ODOMETER_ANCHOR_BACKFILLED` with candidate hash, evidence summary, operator, reason, audit log |

### 4.4 `NO_SAFE_CANDIDATE` path

Does **not** invent historical km. Optional status-only update:

```bash
... --apply-measurement-required-status ...
```

Sets `odometer_anchor_status = MEASUREMENT_REQUIRED` only. UI/API should prompt for a current measurement later.

### 4.5 Idempotency

Re-running apply with the same `setupId:candidateHash` skips with `SKIP_IDEMPOTENT`. Already `ANCHORED` setups are skipped. **No duplicate tire events** for the same candidate hash.

---

## 5. Optional recalculation (separate, explicit)

Tire health recalculation is **not** triggered by default.

```bash
... --recalculate --recalculate-max-vehicles=10
```

- Only vehicles touched in the current apply batch are eligible
- Capped by `--recalculate-max-vehicles` (default 10)
- Failures are recorded in `result.errors` without rolling back anchor writes

---

## 6. Safety invariants

| Invariant | Enforcement |
|-----------|-------------|
| No current km as install anchor | Audit excludes live latest-state-only inference |
| No mixing removed setup data | Terminal statuses (`REMOVED`, `RETIRED`, `DISCARDED`, `SOLD`) skipped |
| No stored-set misassignment | Scoped by `organizationId` / explicit `setupId`; cross-tenant rejected at execute |
| No fleet-wide apply | Requires org or setup scope + batch limit |
| Unsafe history stays unknown | `MEDIUM`/`LOW`/`CONFLICTING` never auto-applied |
| No accidental prod apply | Prod URL patterns blocked; `TIRE_ODOMETER_ANCHOR_APPLY_ALLOW_PROD=1` required |

---

## 7. Verification

```bash
cd backend
npm test -- tire-odometer-anchor-backfill
```

Post-apply SQL checks (example):

```sql
-- Anchored setups in scope
SELECT id, installed_odometer_km, installed_odometer_source, odometer_anchor_status
FROM vehicle_tire_setups
WHERE organization_id = '<ORG_UUID>'
  AND odometer_anchor_status = 'ANCHORED'
ORDER BY updated_at DESC
LIMIT 20;

-- Backfill events
SELECT tire_set_id, payload->>'candidateHash', created_at
FROM tire_events
WHERE type = 'ODOMETER_ANCHOR_BACKFILLED'
ORDER BY created_at DESC
LIMIT 20;
```

---

## 8. Rollback

There is **no automatic rollback**. Before apply:

1. Take a DB snapshot / backup (`--confirm-backup` attestation)
2. Keep dry-run `manifestHash` and CLI JSON output
3. To reverse a single setup: restore from backup or manually clear anchor fields and delete the `ODOMETER_ANCHOR_BACKFILLED` event (supervised DBA only)

---

## 9. Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `Manifest hash mismatch` | Candidates changed since dry-run | Re-run dry-run plan; use new hash |
| `Batch limit exceeded` | Too many auto-applicable rows | Lower scope or raise `--max-batch-size` deliberately |
| `Cross-tenant setup rejected` | Setup org ≠ `--organization-id` | Fix scope or setup selection |
| `production-like DATABASE_URL` | Safety guard | Use staging/local, or supervised prod override |
| `manualReview` non-empty | MEDIUM/LOW/CONFLICTING candidates | Manual review — do not force apply |
| `SKIP_IDEMPOTENT` on re-run | Expected | No action needed |

---

*Prompt 8 — controlled apply workflow. Do not run against production without change approval, backup, and explicit `TIRE_ODOMETER_ANCHOR_APPLY_ALLOW_PROD=1`.*
