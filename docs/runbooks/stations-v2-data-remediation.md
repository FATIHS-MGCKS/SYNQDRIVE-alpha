# Stations V2 — Data Remediation Runbook

Read-only diagnostic CLI for Stations V2 data quality issues. **No production writes** — remediation steps below use supported product workflows or controlled ops scripts.

## Quick start

```bash
cd backend

# Local / test database only (DATABASE_URL must look local unless overridden)
npm run stations:v2:diagnose

# Scoped to one tenant
npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts \
  --dry-run --organization-id=<uuid>

# Human-readable report
npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts \
  --dry-run --format=markdown --output=./tmp/stations-v2-diagnose.md

# Include masked finding rows (limited by --limit)
npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts \
  --dry-run --include-findings --limit=25
```

### Safety guards

| Guard | Purpose |
|-------|---------|
| `--dry-run` (required) | Confirms read-only intent; CLI performs **no writes** |
| `STATIONS_V2_DIAGNOSTIC_ALLOW_PROD=1` | Override production DB pattern block (discouraged) |
| `--allow-remote-db` or `STATIONS_V2_DIAGNOSTIC_ALLOW_REMOTE=1` | Allow non-local `DATABASE_URL` when not production |

Exit code `2` means **error-severity** findings exist (report still written). Exit code `1` is configuration/runtime failure.

### Output contract

- **Counts** per check and category
- **Anonymized IDs** (`abcd…wxyz`) in samples and org summaries
- **Severity** (`error` / `warning` / `info`)
- **Remediation** text per check (also in JSON `checks[].remediation`)
- **No writes** — diagnostic only

---

## Check catalog → remediation

### Primary invariant

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `primary_none` | warning | Org has stations but no non-archived primary | Set one ACTIVE station as primary via UI or `POST /organizations/:orgId/stations/:id/set-primary` |
| `primary_multiple` | error | More than one non-archived primary | Run `stations-v2-primary-diagnose.ts`, reconcile to one canonical primary, clear others |
| `primary_on_archived_or_inactive` | error | Primary flag on ARCHIVED/INACTIVE station | Activate successor station, set primary there, clear primary on archived/inactive row |

Related script (primary only): `backend/scripts/ops/stations-v2-primary-diagnose.ts`

### Lifecycle & capabilities

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `archived_active_capabilities` | error | ARCHIVED station still has pickup/return enabled | Restore → disable capabilities → re-archive, or patch capabilities off via supported API |

### Location master data

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `invalid_coordinates` | warning | Partial or out-of-range lat/lng | Edit station address/coordinates in UI; run coordinate backfill if address is correct |
| `invalid_timezone` | error | Non-IANA timezone string | Set valid IANA timezone (e.g. `Europe/Berlin`) on station |

### Opening hours

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `invalid_opening_hours` | warning | Opening hours JSON fails contract validation | Open station form, fix slots/overlaps/midnight intervals, save |

### Vehicle positioning

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `home_current_coupling_suspect` | info | `homeStationId === currentStationId` without `currentStationSource` | Review fleet positioning; use handover completion or `correct-current-station` with explicit source |
| `current_without_source` | warning | `currentStationId` set but `currentStationSource` null | Backfill provenance or `POST .../vehicles/correct-current-station` with `MANUAL` source |

### Expected station

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `expected_without_valid_context` | error | Expected station without source/timestamp | Set via transfer plan, one-way return, or repositioning workflow — never direct DB writes |
| `expected_stale_context` | warning | Expected set but no active transfer/booking return matches | Verify transfer/booking state; reconcile via supported lifecycle command |

### Archived station links

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `vehicles_on_archived_stations` | error | Vehicle home/current/expected points to ARCHIVED station | Reassign via home-assignment or current-correction workflows |

### Booking rules

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `booking_rule_violation` | error / warning | Upcoming booking evaluates to `BLOCKED` or `MANUAL_CONFIRMATION_REQUIRED` | Reschedule, change stations, fix hours/capabilities, or apply audited manual override where permitted |

Scan window: bookings with status `PENDING` / `CONFIRMED` / `ACTIVE` and `endDate` within lookahead (default 90 days).

### Access scope

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `stale_scope_station_ids` | warning | Membership, role, or user preference references unknown or archived station ID | Update `stationIds` / `stationScope` / `default_station_ids` / `default_station_id` to valid ACTIVE UUIDs |

### KPI consistency

| Check ID | Severity | Meaning | Remediation |
|----------|----------|---------|-------------|
| `kpi_home_fleet_deviation` | warning | Direct `homeStationId` count ≠ KPI resolver home fleet | Refresh station summaries; investigate cross-org or filtered vehicles |
| `kpi_current_on_site_deviation` | warning | Direct `currentStationId` count ≠ KPI resolver on-site | Reconcile current assignments against fleet tab ground truth |

---

## Recommended workflow

1. **Baseline** — Run diagnostic on local/staging copy of prod data (never mutate prod during audit).
2. **Triage** — Sort by severity (`error` first), then by check count.
3. **Per org** — Use `--organization-id` for tenant-scoped reruns after fixes.
4. **Verify** — Re-run diagnostic until error count is zero; track warnings separately.
5. **Primary-only shortcut** — For duplicate-primary only, `stations-v2-primary-diagnose.ts` remains available.

---

## What this CLI does **not** do

- No automatic repairs or migrations
- No customer PII in output
- No calendar-exception hydration for booking rules (uses station master data + default policy)
- Does not replace frontend validation — catches historical / import / manual DB drift

---

## Files

| Path | Role |
|------|------|
| `backend/scripts/ops/stations-v2-diagnose.ts` | CLI entry (`--dry-run` required) |
| `backend/src/modules/stations/diagnostic/stations-v2-diagnostic.service.ts` | Orchestrator |
| `backend/src/modules/stations/diagnostic/stations-v2-diagnostic-check-meta.ts` | Check labels + remediation text |
| `backend/src/modules/stations/diagnostic/stations-v2-diagnostic.safety.util.ts` | Dry-run + DB safety guards |
| `docs/architecture/stations-v2-prisma-migration-rollout-plan.md` | Rollout plan reference (§8.1) |
