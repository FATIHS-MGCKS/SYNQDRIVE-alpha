# R1 Production read-only forensics — DIMO Integration

| Field | Value |
|-------|-------|
| **AUDIT_MODE** | `READ_ONLY` |
| **Observed at (UTC)** | `2026-10-11T18:50:00Z` |
| **SSH principal** | `synqdrive-admin@srv1374778.hstgr.cloud` |
| **origin/main @ audit start** | `0633d08311803b1473c6e7a274e5074e4cb69a08` |
| **Production release path** | `/opt/synqdrive/releases/20261011154442_v4994` |
| **Production SHA** | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| **Production commit subject** | `fix(battery-v2): G5C-N2 open REST CANDIDATE when post-anchor telemetry is still trip-phase (#1974)` |
| **Evidence ID** | `DIM-EV-R1-PROD-001` |

## Drift vs authority documents

| Baseline recorded in authority (pre-R1) | R1 observed | Classification |
|----------------------------------------|-------------|----------------|
| `8a1d9c658…` @ `20260925182907_v4994` | `2b89f746…` @ `20261011154442_v4994` | **CONFIRMED** repo/production drift — expected; authority stale until this record |
| `1393095f5…` as origin/main in `CURRENT_STATE.md` | `0633d0831…` on `origin/main` @ R1 | **CONFIRMED** documentation lag |

**Epistemic:** Production SHA and path are **CONFIRMED** from SSH `git rev-parse` on deployed release. Feature-level runtime behavior on Production beyond process list and env **names** was **not** re-probed in this pass (no deploy grep, no provider GET replay).

## Process topology

| PM2 app | Status (observed) |
|---------|-------------------|
| `synqdrive` | `online` |
| `synqdrive-b` | `online` |
| `pm2-logrotate` | `online` |

## DIMO-related environment variable **names** present on Production

Sanitized (`=***REDACTED***`); values not recorded.

- `DIMO_AGENT_USER_WALLET`, `DIMO_API_KEY`, `DIMO_API_URL`, `DIMO_CLIENT_ID`, `DIMO_DOCUMENT_AGENT_*`, `DIMO_DOMAIN`, `DIMO_ENV`, `DIMO_GLOBAL_BUDGET_ENABLED`, `DIMO_PRIVATE_KEY`, `DIMO_REDIRECT_URI`, `DIMO_REQUEST_TIMEOUT_MS`, `DIMO_TELEMETRY_API_URL`, `DIMO_VEHICLE_JWT_*`, `DIMO_WEBHOOK_BASE_URL`, `DIMO_WEBHOOK_SECRET`, `DIMO_WEBHOOK_VERIFICATION_TOKEN`
- `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED`, `WORKER_SNAPSHOT_CONCURRENCY`, `WORKER_SNAPSHOT_INTERVAL_MS`

**Gap:** Tier override variables (`WORKER_SNAPSHOT_TIER_*_MS`) were **not** observed in the grep slice — may be unset (code defaults apply) or live under a different env file. **UNKNOWN** until full env inventory with owner approval.

## Mutations

**None.**
