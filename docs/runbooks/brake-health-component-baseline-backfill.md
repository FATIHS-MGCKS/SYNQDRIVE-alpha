# Runbook: Brake Component Baseline Backfill

**Controlled backfill workflow** for existing vehicles without reliable `BrakeHealthCurrent` baseline, migrating per-component `BrakeComponentInstallation` rows from audited evidence.

| Field | Value |
|-------|------|
| **Valid from** | Backend ≥ commit with `BrakeBaselineBackfillService` (Prompt 12) |
| **Audit version** | `brake-baseline-backfill-audit-2026-07-v1` |
| **Schema version** | `20260717140000_brake_component_installation_lifecycle` |
| **Audit / apply script** | [`backend/scripts/ops/audit-brake-health-baseline-candidates.ts`](../../backend/scripts/ops/audit-brake-health-baseline-candidates.ts) |
| **Apply service** | [`backend/src/modules/vehicle-intelligence/brakes/brake-baseline-backfill.service.ts`](../../backend/src/modules/vehicle-intelligence/brakes/brake-baseline-backfill.service.ts) |
| **Prior audit report** | [`docs/audits/brake-health-baseline-backfill-candidates-2026-07.md`](../audits/brake-health-baseline-backfill-candidates-2026-07.md) |

> **Principle:** Audit is read-only. Apply is **DRY RUN by default**. Only `EXACT_MEASURED`, `CONFIRMED_REPLACEMENT`, and policy-eligible `HIGH_CONFIDENCE_DOCUMENTED` components are auto-written. `SPEC_ONLY`, `REGISTRATION_ASSERTION_ONLY`, `CONFLICTING_DATA`, and `NO_SAFE_BASELINE` remain in **manual review**. No historical thickness is invented.

---

## 1. Prerequisites

### 1.1 Required migrations

| Migration | Purpose |
|-----------|---------|
| `20260717140000_brake_component_installation_lifecycle` | `brake_component_installations` + lifecycle constraints |
| `20260717170000_brake_wear_thresholds` | Component-specific minimum thickness fields |

```bash
cd backend
npx prisma migrate status
```

### 1.2 Environment variables

| Variable | Purpose | Audit | Apply |
|----------|---------|-------|-------|
| `DATABASE_URL` | Target PostgreSQL | ✓ | ✓ |
| `BRAKE_HEALTH_AUDIT_ALLOW_REMOTE` | Non-local DB for read-only audit | ✓ | — |
| `BRAKE_HEALTH_AUDIT_ALLOW_PROD` | Prod-like DB for read-only audit | ✓ | — |
| `BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_REMOTE` | Non-local DB for apply | — | ✓ |
| `BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_PROD` | Prod-like DB for apply (supervised only) | — | ✓ |

Production-like URLs are **blocked by default** for both audit and apply.

---

## 2. Phase A — Read-only candidate audit (Prompt 5)

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts \
  --organization-id=<ORG_UUID> --limit=100
```

Fixtures (no database):

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts --fixtures-only
```

Review per-component classification:

| Class | Auto-apply |
|-------|:----------:|
| `EXACT_MEASURED` | ✓ (with resolved odometer, no conflicts) |
| `CONFIRMED_REPLACEMENT` | ✓ (documented replacement + odometer) |
| `HIGH_CONFIDENCE_DOCUMENTED` | ✓ only when HIGH confidence + measured thickness + clean odometer |
| `SPEC_ONLY` | ✗ — measurement required |
| `REGISTRATION_ASSERTION_ONLY` | ✗ — confirm or measure |
| `CONFLICTING_DATA` | ✗ — manual reconciliation |
| `NO_SAFE_BASELINE` | ✗ — `UNKNOWN_HISTORY` / collect evidence |

Outputs:

- `docs/audits/brake-health-baseline-backfill-candidates-2026-07.md`
- `docs/audits/data/brake-health-baseline-backfill-candidates-2026-07.json` (anonymized)

---

## 3. Phase B — Dry-run apply plan (default)

Scoped plan for one organization or vehicle. **No writes** unless `--apply`.

```bash
cd backend
GIT_REF=$(git rev-parse HEAD)

npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts \
  --organization-id=<ORG_UUID> \
  --confirm-git-ref="$GIT_REF" \
  --confirm-schema-version=20260717140000_brake_component_installation_lifecycle \
  --operator=ops@example.com \
  --reason=staging-validation \
  --max-batch-size=25 \
  --expected-audit-version=brake-baseline-backfill-audit-2026-07-v1
```

Optional component filter:

```bash
  --component=FRONT_PADS --component=REAR_PADS
```

Note the `reportHash` in JSON output — required for apply.

Fixture dry-run plan (CI):

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts \
  --fixtures-only \
  --organization-id=org-fixture-1 \
  --confirm-git-ref="$GIT_REF" \
  --confirm-schema-version=20260717140000_brake_component_installation_lifecycle \
  --operator=ci --reason=fixture-plan --max-batch-size=10 \
  --expected-audit-version=brake-baseline-backfill-audit-2026-07-v1
```

---

## 4. Phase C — Controlled apply

**Do not run against production without explicit supervised override.**

Required flags:

| Flag | Purpose |
|------|---------|
| `--apply` | Enable writes |
| `--organization-id` or `--vehicle-id` | Scope guard |
| `--confirm-backup` | Operator confirms DB backup |
| `--expected-report-hash` | Pins plan to audited snapshot |
| `--confirm-git-ref` | Pins code version (`git rev-parse HEAD`) |
| `--confirm-schema-version` | Pins migration version |
| `--operator` | Accountability |
| `--reason` | Change ticket / justification |
| `--max-batch-size` | Caps auto-applicable components per run |

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts \
  --organization-id=<ORG_UUID> \
  --apply \
  --confirm-backup \
  --expected-report-hash=<from-phase-b> \
  --confirm-git-ref="$GIT_REF" \
  --confirm-schema-version=20260717140000_brake_component_installation_lifecycle \
  --operator=ops@example.com \
  --reason=prod-baseline-backfill-batch-1 \
  --max-batch-size=10 \
  --expected-audit-version=brake-baseline-backfill-audit-2026-07-v1
```

### 4.1 Per-component writes

Each auto-applied component creates:

- `BrakeComponentInstallation` (ACTIVE)
- Anchor source (`MEASURED` or `DOCUMENTED_REPLACEMENT`)
- Anchor thickness, odometer, timestamp
- Linked `VehicleServiceEvent` (BRAKE_SERVICE)
- Scoped `BrakeHealthCurrent` anchor update (affected components only)
- Audit log entry in apply result JSON

Existing `BrakeHealthCurrent` values are **not** blindly adopted. `BHC_EXISTING_ANCHOR` sources are skipped.

### 4.2 Idempotency

- Re-apply with same idempotency fingerprint → no-op (`SKIP_IDEMPOTENT`)
- Report hash mismatch → hard stop (stale plan protection)
- No duplicate active installations per component

### 4.3 Optional recalculation (separate batch step)

Recalculation is **not** automatic after every record. Enable explicitly:

```bash
  --recalculate --recalculate-max-vehicles=5
```

Only affected vehicles from the apply batch are recalculated, capped by `--recalculate-max-vehicles`.

---

## 5. Manual review checklist

Before promoting manual-review components:

1. Resolve odometer conflicts (`odometer_spread`, `odometer_rollback`)
2. Collect workshop measurement for `SPEC_ONLY` / `MEASUREMENT_REQUIRED`
3. Reconcile `CONFLICTING_DATA` measurement spreads
4. Do **not** invent historical thickness for `NO_SAFE_BASELINE` — mark `UNKNOWN_HISTORY` via supervised lifecycle if needed

---

## 6. Rollback

- Apply creates new `BrakeComponentInstallation` rows and service events — rollback requires supervised DB restore from backup or manual lifecycle correction.
- Always take `pg_dump` backup before `--confirm-backup` apply runs.

---

## 7. Verification

```bash
cd backend
npm test -- --testPathPattern='brake-baseline-backfill|brake-baseline-candidate-audit'
```

Post-apply spot checks:

```sql
SELECT vehicle_id, component_type, status, anchor_thickness_mm, anchor_source, installed_odometer_km
FROM brake_component_installations
WHERE vehicle_id = '<VEHICLE_UUID>'
ORDER BY component_type, installed_at DESC;
```
