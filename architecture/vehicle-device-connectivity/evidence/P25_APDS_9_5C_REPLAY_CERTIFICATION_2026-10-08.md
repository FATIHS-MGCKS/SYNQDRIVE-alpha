# P25 APDS 9.5C — Replay access recovery and final certification

| Field | Value |
|-------|--------|
| **PR** | #1938 |
| **Mode** | Read-only production + isolated engineering |
| **Certified CI head (pre-rebase)** | `10f80c76473973530f0d9bb09ad155e5a582dd14` |

## Replay access root cause

| Finding | Detail |
|---------|--------|
| Shadow-table grants | **Not required** for `_apd92c-exact-replay-readonly.ts` (source tables only) |
| Actual failure | Invalid Prisma unix-socket URL (`empty host in database URL`); `.env` **EACCES** when run as `synqdrive-admin` |
| Authorized path | `sudo -u postgres` peer auth + `DATABASE_URL=postgresql://postgres@localhost/synqdrive?host=/var/run/postgresql&options=-c%20role%3Dsynqdrive_apds_replay_ro` |
| `synqdrive_apds_replay_ro` | `SELECT` on `vehicles`, `vehicle_latest_states`, `vehicle_trips`, `dimo_poll_logs`, `battery_measurements` — **denied** on `apd_shadow_*` |

## Empirical certification (production read-only)

| Run | Result |
|-----|--------|
| 9.2C exact replay | `EXACT_REPLAY_CERTIFICATION=PASS` (5 / 57 / 24 / 33 / 533) |
| 9.5C V2 vs V2.1 execution replay | `V2_1_EMPIRICAL_REPLAY=PASS`, `EXPECTED_BOOTSTRAP_DIVERGENCES=4`, `UNEXPLAINED_EXECUTION_DIVERGENCES=0` |

Artifacts: `/opt/cursor/artifacts/apds-92c-prod-replay-9.5c.json`, `/opt/cursor/artifacts/apds-95c-v21-empirical-replay.json`.

## T+1h observation (`2026-10-08T20:13:28.270Z` → `2026-10-08T21:13:28.270Z`)

Read via `postgres` superuser (replay role blocked on shadow tables). `decision_at` membership.

| Metric | Value |
|--------|--------|
| NULL-epoch rows (preserved) | 366 |
| Window rows (all policies) | 126 (`P25_APD_SHADOW_EXECUTION_V2`) |
| Distinct opportunities / policy | 63 B2 + 63 B4 |
| DIMO 187336 epoch-bound in window | 0 |
| Forced-missing with visible LV persisted | 0 (expected pre-V2.1 deploy) |
