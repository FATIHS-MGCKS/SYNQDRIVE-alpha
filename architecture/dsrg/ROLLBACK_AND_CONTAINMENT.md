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

On failed post-switch verification: restore `/opt/synqdrive/shared/vo5c-pinned-executor.env` from `/opt/synqdrive/shared/vo5c-pinned-executor.env.bak-<ts>` (see DSRG-02 R1 backup naming); do **not** restart PM2 or change `current` unless a separate deploy authorization exists.

## Break-glass recovery (documentation only — not production-verified)

**Purpose:** Recover deployability when normal SSH/deploy credentials are unavailable, enforcement misconfigures the host, or the pinned path is locked. **Do not** store secrets, keys, or provider credentials in git or DSRG evidence markdown.

### BG-A — Lost normal SSH / deploy key

1. Use the **independent** account recovery path documented with the VPS provider (Hostinger console / support ticket), separate from the day-to-day deploy key.
2. A **second custodian** (not the deploy automation principal) must hold or restore an alternate authorized key per org policy.
3. After host access: verify `SYNQDRIVE_DEPLOYED_GIT_SHA`, pin config path, and that enforcement flags remain off until re-authorized.
4. Record incident ID, approver, and timestamp in operator audit (outside repo).

### BG-B — Emergency privileged access

1. Emergency access must use a **different** principal than routine deploy (break-glass user or provider rescue mode).
2. Two-person rule: one operator executes, one approves (BG-F).
3. No enforcement activation during break-glass unless explicitly re-approved after recovery.

### BG-C — Backup / restore: pin config and sudoers

| Artifact | Verified path (DSRG-02 R1/R2, R3 audit) | Backup / status |
|----------|----------------------------------------|-----------------|
| Pinned executor pointer | `/opt/synqdrive/shared/vo5c-pinned-executor.env` | Timestamped `.bak-*` in same directory on promotion (e.g. `vo5c-pinned-executor.env.bak-20261011T002400Z`) |
| Pin tree | `/opt/synqdrive/shared/pinned-executor/<full-sha>/` | Prior SHAs retained under `pinned-executor/` (e.g. `40c6dd9…`, `448a889…`); do not delete until floor policy allows |
| VO5C sudoers fragment | `/etc/sudoers.d/synqdrive-vo5c-deploy` | **Not installed** as of R3 audit — restore procedure **NOT_VERIFIED** on production |
| Pinned deploy wrapper (example) | `/opt/synqdrive/shared/bin/vo5c-pinned-deploy-wrapper.sh` | **Not installed** — example only in `vo5c-production-deploy-privilege-boundary.sudoers.example` |
| Canonical pinned runner (in-tree) | `<PINNED_ROOT>/backend/scripts/ops/vps-vo5c-run-pinned-security-deploy.sh` where `PINNED_ROOT` comes from env | Verified at DSRG-02 seal; live invocation without deploy auth **NOT_VERIFIED** as routine operator path |

Restore order (documented; **NOT_VERIFIED** until BG-E drill): (1) if erroneous sudoers blocks recovery, root removes or reverts `/etc/sudoers.d/synqdrive-vo5c-deploy` and runs `visudo -c` — **NOT_VERIFIED** on VPS; (2) restore pin env from `.bak-*` in `/opt/synqdrive/shared/`; (3) read-only preflight on active pin tree (`vps-vo5c-first-security-deploy-preflight.sh`); (4) only then consider deploy authorization.

### BG-D — Erroneous enforcement / locked deploy path

1. Set `ENFORCEMENT_ACTIVE` / VO5C enforcement env to **off** via approved config change — production steps **NOT_VERIFIED** in DSRG-03 (enforcement remains OFF).
2. If a future VO5C sudoers rule blocks floor-qualified rollback: root must remove or disable `/etc/sudoers.d/synqdrive-vo5c-deploy` (or restore vault copy) — **NOT_VERIFIED** (fragment absent today).
3. Run security-floor-qualified rollback script if release tree is bad; use Class C for RFRF-specific state — floor scripts exist in repo/pin; erroneous-policy recovery **NOT_VERIFIED** end-to-end.
4. Re-run pinned preflight **without** production mutate until human sign-off.

### BG-E — Recovery drill (mandatory before enforcement go-live)

Scheduled drill must cover: simulated lost deploy key (tabletop or provider test account), pin config restore from backup under `/opt/synqdrive/shared/`, sudoers install/remove dry-run on staging, and denied rollback path. **Not executed** (DSRG-03 R4/R5).

### BG-F — Audit and approval

Every break-glass use requires: ticket ID, named approver, start/end time, commands class (read-only vs mutate), and post-incident review. Automated deploy keys must not approve their own emergency escalation.

**`BREAK_GLASS_READY=NOT_VERIFIED`** until BG-E drill evidence is filed and BG-C backups are verified on production.
