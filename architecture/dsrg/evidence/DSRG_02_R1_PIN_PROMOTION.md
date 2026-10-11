# DSRG-02 R1 — Pin re-promotion execution record

**Mode:** pin-only (no app deploy, no enforcement)  
**Operator:** Serin Fatih (`dev@synqdrive.eu`) — user self-attested SRE / Platform / Security approval in Cursor agent session  
**Authorization:** explicit “Go” for DSRG-02 R1 in conversation  

| Field | Value |
|-------|--------|
| Pre-write UTC | 2026-10-11T00:23:10Z |
| Install/switch UTC | 2026-10-11T00:24:00Z – 00:24:41Z |
| Post-verify UTC | 2026-10-11T00:24:47Z |
| OLD_PIN_SHA | `40c6dd99d60cb07575bcb687586c66c50651e213` |
| NEW_PIN_SHA | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` (PR #1970 merge commit) |
| Live app (unchanged) | `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` |
| Config backup | `/opt/synqdrive/shared/vo5c-pinned-executor.env.bak-20261011T002400Z` |

## Gates

- Live app SHA, attestation, dual readiness, scheduler LEADER/FOLLOWER: PASS  
- APDS ACTIVE epoch `3cbc5d95…` @ 2026-10-09 21:40:53.812; approved pin `ab72f574…`: unchanged  
- Gate-6 GLOBAL: KILLED  
- Authority / armed stamp: absent  
- Staging selftests on host before install: execution-contract OK  
- Post-switch `vps-vo5c-first-security-deploy-preflight.sh`: PREFLIGHT_PASS (no deploy authorized)  

## Main-tip drift at execution

`github/main` was `1f5fdabe…` (PR #1969); **no** `backend/scripts/ops` or `architecture/dsrg` diff vs `448a889`. Pin SHA frozen to authorized merge commit, not main HEAD.

## Rollback

Restore `vo5c-pinned-executor.env.bak-20261011T002400Z`; do not remove `448a889` tree without separate change.
