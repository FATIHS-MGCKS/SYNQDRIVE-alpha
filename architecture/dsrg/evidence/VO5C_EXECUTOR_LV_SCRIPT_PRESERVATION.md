# VO5C executor — LV readonly script preservation (Production)

**Status:** Read-only plan — **no VPS mutation** in repository workstream.

## Untracked file on Production executor (2026-10-19 audit)

| Field | Value |
|-------|--------|
| **Filename** | `lv-estimated-battery-health-evaluation-readonly.ts` |
| **Location (current)** | `/opt/synqdrive/releases/20261018230030_v4994/backend/scripts/ops/` (via `/opt/synqdrive/current`) |
| **SHA256** | `b7f0b66bc6bc03a15f1d0b3eea480cd6ae2df4b5a5ef78de447b8f115411b8b5` |
| **Size** | 151 lines |
| **mtime (UTC)** | 2026-10-19 01:03:45 |

## Provenance

- Operator forensic session (battery G5C-N16 shadow / RO DB role).
- Installed via `sudo cp /tmp/lv-estimated-battery-health-evaluation-readonly.ts` → `backend/scripts/ops/` (auth log 2026-10-19).
- **Not** referenced by `vps-deploy-release.sh`, pm2, or scheduler.
- **Does** cause VO5C `executor_integrity_dirty_ops_tree` while present under `backend/scripts/ops/`.

## Required preservation location (future owner step)

Move **out of** deploy executor tree before integrity restore, e.g.:

- `/opt/synqdrive/shared/state/lv-estimated-battery-health-evaluation-readonly.ts`

## Ownership and permissions (recommended)

- Owner: `root` (consistent with other `shared/state` artifacts).
- Mode: `0644` (script is read-only harness; no execute bit required for `ts-node`/`npx tsx` invocation).

## Recovery instructions (owner-approved VPS only)

1. `cp` worktree copy to `shared/state/` path above (or use existing copy if already archived).
2. Remove from `backend/scripts/ops/` inside active release (or leave until new deploy replaces tree).
3. Re-verify: `git -C /opt/synqdrive/current status --porcelain -- backend/scripts/ops` → no `??` for this file.

## PG16 hotfix canonical copies (related)

Already on VPS at `/opt/synqdrive/shared/state/`:

- `pg16-prisma-with-guard.sh`
- `pg16-production-database-backup-capture-verify.py`

Repository integration: PR **#2079** (GitHub), superseding ad-hoc VPS edits after certified deploy.
