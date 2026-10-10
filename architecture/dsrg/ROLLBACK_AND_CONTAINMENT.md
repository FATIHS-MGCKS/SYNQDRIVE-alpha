# Rollback & emergency containment

## Class B — release rollback

- `vps-rollback-production-release.sh` / deploy `ROLLBACK_ON_FAIL`
- Guarded by **security floor** (`vps-vo5c-security-floor-rollback`); sub-floor targets denied
- PM2 resurrect disabled on denied rollback paths

## Class C — RFRF

- `rfrf-production-rollback.sh` — env-stage rollout; **unchanged** by P4B15 deploy enforcement
- Deploy enforcement must not disable RFRF traps

## Class E — emergency

- Gate-6 open/rekill scripts (`di-v0-s4-gate6-*`) — separate operator path
- VO5C P2B4 prune containment — platform prune disabled

## Pin pointer rollback

On failed post-switch verification: restore `vo5c-pinned-executor.env.bak-<ts>`; do **not** restart PM2 or change `current` unless a separate deploy authorization exists.
