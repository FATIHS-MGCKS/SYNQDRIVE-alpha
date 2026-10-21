# G5C-N16 P4C — Tiguan forward-capture pilot (operator runbook)

**Status:** Design / local implementation only — **not** auto-executed.  
**Vehicle:** VW Tiguan WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`, DIMO token `192922`).

## 1. Preflight (owner + platform)

- Confirm **production deploy is out of scope** for this document unless separately authorized.
- Confirm **CI green** on the commit that contains P4H-R7 hardening.
- Confirm **no** `BATTERY_V2_PUBLICATION_ENABLED` and **no** customer SOH publication flags.
- Verify Tiguan is the **only** UUID in `BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST`.
- Set a new opaque `BATTERY_V2_START_PROXY_PILOT_EPOCH` (owner-approved string; new epoch = new budget).
- Set `BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT` to an ISO UTC instant **strictly before** the first intended pilot trip (exclusive semantics: trips starting exactly at cutoff are **rejected**).
- Set `BATTERY_V2_START_PROXY_PILOT_MAX_TOTAL_PROVIDER_REQUESTS` (hard fleet cap for epoch).
- Set `BATTERY_V2_START_PROXY_PILOT_MAX_REQUESTS_PER_TRIP=1`.
- Keep `BATTERY_V2_START_PROXY_PILOT_REQUEST_BUDGET_KILL_SWITCH=false` until ready; set `true` for emergency stop.

## 2. Controlled deploy with pilot OFF (mandatory before any activation)

Use the standard production VPS deploy runbook (`architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md`). **No pilot env vars are enabled in this phase.**

1. **Release delta** — Record production SHA and full GitHub diff vs `main`; confirm only P4C pilot tables/migration and battery start-proxy pilot code (no unrelated workstreams).
2. **CI gates** — Wait for green **CI gate (all critical jobs)** on the release commit, including Prisma validate/migrate checks and `battery-v2-g5c-n7-postgres-ci` when reconciliation paths change.
3. **Database backup + migration preflight** — Take owner-approved DB backup; run `prisma migrate deploy` preflight on a staging/ephemeral DB with the same migration chain; confirm migration `20261021150000_battery_start_proxy_pilot_forward_capture` is additive only.
4. **Deploy application with pilot OFF** — Ensure env remains:
   - `BATTERY_V2_START_PROXY_ENABLED=false`
   - `BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED=false`
   - No `BATTERY_V2_START_PROXY_PILOT_*` activation values on replicas.
5. **Apply schema migration** — Run controlled `prisma migrate deploy` per deploy script; verify success on both API replicas’ shared Postgres.
6. **Replica + scheduler health** — Rolling restart if required; confirm `/api/v1/health` on public URL; confirm scheduler LEADER/FOLLOWER roles unchanged.
7. **No pilot provider traffic** — Confirm logs/metrics show **no** `pilot_request_budget_*` reserves and **no** new rows in `battery_start_proxy_pilot_provider_requests` / `battery_start_proxy_pilot_raw_archives` (tables may exist empty).
8. **Table permissions** — Confirm application role can read/write new tables only when pilot is later enabled; no customer-facing UI exposes pilot data.
9. **Owner activation gate** — Do **not** set pilot scope or `BATTERY_V2_START_PROXY_ENABLED` until explicit owner sign-off (separate change window).
10. **Post-activation only** — Configure request budget, epoch, kill-switch, Tiguan allowlist, forward cutoff; run T+0 SHA-256 audit on first archives.
11. **Controlled Tiguan test drive** — Single vehicle, independent engine-start time reference; max one provider send per trip (`MAX_REQUESTS_PER_TRIP=1`).
12. **T+24** — Budget totals, DLQ, allowlist unchanged, raw retention intact.
13. **Abort / recovery** — Kill-switch `true`, pilot scope `false`, `BATTERY_V2_START_PROXY_ENABLED=false`, rolling restart; retain raw archives for forensics; do **not** enable N16 customer publication.

Deploy scripts must **not** auto-enable pilot flags.

## 3. Activation parameters (example — replace before use)

| Variable | Example |
|----------|---------|
| `BATTERY_V2_START_PROXY_ENABLED` | `true` (only after owner sign-off) |
| `BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED` | `true` |
| `BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| `BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT` | `2026-11-01T00:00:00.000Z` |
| `BATTERY_V2_START_PROXY_PILOT_EPOCH` | `owner-2026-11-01-tiguan-v1` |
| `BATTERY_V2_START_PROXY_PILOT_MAX_TOTAL_PROVIDER_REQUESTS` | `25` |
| `BATTERY_V2_START_PROXY_PILOT_MAX_REQUESTS_PER_TRIP` | `1` |
| `BATTERY_V2_START_PROXY_PILOT_RAW_RETENTION_DAYS` | `90` |

## 4. Safety checks before first trip

- Reconciliation **must not** enqueue start-proxy jobs when pilot scope is ON (trip-start producer only).
- Job retries for `BATTERY_START_PROXY_EXTRACT` are **1 attempt** when pilot runtime is ready.
- Raw archive row must exist in `battery_start_proxy_pilot_raw_archives` per trip before extractor proceeds.
- Provider ledger row in `battery_start_proxy_pilot_provider_requests` must show terminal state after each trip.

## 5. Ground-truth time reference (field test)

1. Park with engine off; note snapshot poll tier if known.
2. Record **independent** engine-start time (video / stopwatch).
3. Drive normally; do not claim CCA/SOH.
4. After trip, compare: ground truth, `VehicleTrip.startTime`, raw archive bucket timestamps, ingest timestamps in archive `timing` block.

## 6. Live monitoring

- Watch `battery_start_proxy_pilot_global_budget.total_attempts` vs `max_total_attempts`.
- Alert if kill-switch flipped or budget exhausted mid-campaign.
- DIMO global limiter metrics (unchanged for non-pilot traffic).

## 7. Kill-switch

Set `BATTERY_V2_START_PROXY_PILOT_REQUEST_BUDGET_KILL_SWITCH=true` → all pilot provider reserves denied (`pilot_request_budget_kill_switch`).

## 8. Rolling restart

- Budget and ledger are **durable in Postgres**; restarts do not reset counts for the same epoch.
- New epoch requires owner approval and new env values.

## 9. T+0 and T+24 audit

- T+0: SHA-256 verify each raw archive (`verifyP4cForwardRawArchive`).
- T+24: Re-check budget totals, dead-letter queue for `BATTERY_START_PROXY_EXTRACT`, no unexpected vehicles in allowlist.

## 10. Rollback

1. `BATTERY_V2_START_PROXY_ENABLED=false`
2. `BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED=false`
3. Kill-switch `true`
4. Rolling restart workers (per deploy runbook)
5. Raw archives retained per retention policy for forensics

## 11. Integrity verification

```bash
# Application-level: run offline replay harness on exported archive JSON (no DIMO)
cd backend && npx ts-node -r tsconfig-paths/register \
  scripts/research/g5c-n16-p4h-offline-replay-from-archive.ts
```

Pilot archives: table `battery_start_proxy_pilot_raw_archives` (`archive_json` + `integrity_sha256`).
