# DIMO Integration — Production Baseline (Read-Only + Scoped Bootstrap Session)

**Latest session:** `2026-09-07T22:10:00Z`
**Access:** `VERIFIED_READ_ONLY` + authorized provider mutations (rolled back) via SSH (`sudo` on VPS)

## Release

| Field | Value |
|-------|-------|
| Path | `/opt/synqdrive/releases/20260907204434_v4994` |
| SHA | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` |
| Symlink | `/opt/synqdrive/current` → above release |

## Process topology

| PM2 app | Status (observed) |
|---------|-------------------|
| synqdrive | online |
| synqdrive-b | online |

## DIMO runtime observations

| Check | Result |
|-------|--------|
| `GET /api/v1/health` | HTTP 200 |
| Webhook controller route in deployed JS | present |
| R9 wake runtime (`SnapshotWakeIntakeService`) | **present** post-deploy @ `0ba96e03…` |
| R9 speed/ignition trigger definitions | **2** (five-vehicle canary PASS @ `2026-09-07T22:35:00Z`) |
| Legacy OBD/RPM webhooks at callback | **unchanged** (3 definitions; stableIds `a257daa23ee5`, `b977124a025a`, `1f96faea6569`) |

## Provider subscription / trigger coverage (GET @ `2026-09-07T22:35:00Z`)

| Metric | Value |
|--------|---------|
| Active R9 cohort | **5** (186946, 187336, 187361, 187784, 192922) |
| Excluded former fleet | **190497** — `FORMER_FLEET_VEHICLE` |
| subscribed_speed | **5** |
| subscribed_ignition | **5** |
| subscribed_both | **5** |
| missing_both (active cohort) | **0** |
| R9 speed stableId | `9eeb7158afee` |
| R9 ignition stableId | `5d611d470eab` |

Detail: [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](R9_FIVE_VEHICLE_CANARY_2026-09-07.md), [R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md](R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md), [R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md](R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md)

**Stale internal data gap (OPEN):** tokenId **190497** retains SynqDrive mirrors (AVAILABLE, CONNECTED, active consent/link) — excluded from cohort; not cleaned up in canary task.

**NEXT_GATE:** `NATURAL_R9_WAKE_OBSERVATION`

## Mutations

**Five-vehicle canary session:** authorized provider create/subscribe for R9 speed + ignition triggers on active cohort only. **No Production DB or Redis mutations.** `DIMO_TRIGGER_BOOTSTRAP_ENABLED` **NOT enabled.**

Historical: six-vehicle scoped bootstrap session — **ROLLED_BACK** (see R9_SCOPED_TRIGGER_BOOTSTRAP).
