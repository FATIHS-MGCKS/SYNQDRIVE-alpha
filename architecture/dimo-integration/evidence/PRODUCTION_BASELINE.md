# DIMO Integration — Production Baseline (Read-Only)

**Session:** `2026-09-07T02:55:00Z`
**Access:** `VERIFIED_READ_ONLY` via SSH (`synqdrive-admin@srv1374778.hstgr.cloud`)
**Method:** `bash .cursor/scripts/cloud-agent-verify-vps.sh` preflight passed

## Release

| Field | Value |
|-------|-------|
| Path | `/opt/synqdrive/releases/20260906213654_v4994` |
| SHA | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |
| Symlink | `/opt/synqdrive/current` → above release |

## Process topology

| PM2 app | PID (observed) |
|---------|----------------|
| synqdrive | 3789590 |
| synqdrive-b | 3789796 |

## DIMO runtime observations

| Check | Result |
|-------|--------|
| `GET /api/v1/health` | HTTP 200 |
| Webhook controller route in deployed JS | present |
| `SnapshotWakeIntakeService` in deployed webhook controller | **absent** (R9 NOT_ON_PRODUCTION) |
| Redis `bull:dimo.snapshot*` prefix keys | 5 |
| Redis `bull:snapshot.wake*` prefix keys | 0 |

## Provider subscription / trigger coverage

**UNKNOWN** — not verified in this session without provider API mutation or credential-bearing calls.

## Limitations

- Shared `backend.env` key names not sampled (permission/path)
- No log forensics with payload content
- No external DIMO API subscription listing

## Mutations

**None.**
