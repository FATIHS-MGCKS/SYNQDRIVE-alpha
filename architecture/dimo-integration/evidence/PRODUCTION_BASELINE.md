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
| R9 speed/ignition trigger definitions | **0** (bootstrap ROLLED_BACK) |
| Legacy OBD/RPM webhooks at callback | **unchanged** (3 definitions; stableIds `a257daa23ee5`, `b977124a025a`, `1f96faea6569`) |

## Provider subscription / trigger coverage (GET @ `2026-09-07T22:10:00Z`)

| Metric | Value |
|--------|---------|
| Eligible cohort | 6 |
| subscribed_speed | 0 |
| subscribed_ignition | 0 |
| subscribed_both | 0 |
| missing_both | 6 |

Detail: [R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md](R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md), [R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md](R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md)

**Permission blocker:** tokenId **190497** (VW Golf 2026) — missing DIMO Identity developer-license privilege; SynqDrive consent ACTIVE but provider subscribe returns 403.

**NEXT_GATE:** `DIMO_VEHICLE_PERMISSION_RESOLUTION`

## Mutations

**Scoped bootstrap session:** ephemeral R9 webhook create/subscribe attempts — **all rolled back**. No Production DB or Redis mutations.
