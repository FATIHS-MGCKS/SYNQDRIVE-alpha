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

## Break-glass recovery (documentation only — R4)

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

| Artifact | Typical path | Backup expectation |
|----------|--------------|-------------------|
| Pinned executor pointer | `/opt/synqdrive/config/vo5c-pinned-executor.env` | Timestamped `.bak-*` beside config on promotion (see DSRG-02 evidence) |
| VO5C sudoers fragment | `/etc/sudoers.d/synqdrive-vo5c-deploy` | **Not installed** as of R3 audit; when installed, root-owned copy in encrypted ops vault + `visudo -c` after restore |
| Pin tree | `/opt/synqdrive/pinned-executors/<sha>/` | Prior SHAs retained on disk; do not delete until floor policy allows |

Restore order: (1) sudoers removed or reverted if erroneous, (2) pin env pointer restored from backup, (3) `exec bash` runner smoke on pin tree, (4) only then consider deploy authorization.

### BG-D — Erroneous enforcement / locked deploy path

1. Set `ENFORCEMENT_ACTIVE` / VO5C enforcement env to **off** via approved config change (not documented here as live prod steps in R4).
2. Remove or disable VO5C sudoers fragment if it blocks legitimate floor-qualified rollback.
3. Run security-floor-qualified rollback script if release tree is bad; use Class C for RFRF-specific state.
4. Re-run pinned preflight **without** production mutate until human sign-off.

### BG-E — Recovery drill (mandatory before enforcement go-live)

Scheduled drill must cover: simulated lost deploy key (tabletop or provider test account), pin config restore from backup, sudoers install/remove dry-run on staging, and denied rollback path. **Not executed in DSRG-03 R4.**

### BG-F — Audit and approval

Every break-glass use requires: ticket ID, named approver, start/end time, commands class (read-only vs mutate), and post-incident review. Automated deploy keys must not approve their own emergency escalation.

**`BREAK_GLASS_READY=NOT_VERIFIED`** until BG-E drill evidence is filed and BG-C backups are verified on production.
