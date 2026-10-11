# OS privilege boundary

Script-level guards are insufficient against root shell bypass. Production activation requires:

1. Root-owned pin trees; config `0600`
2. Authority file `0444` + optional armed stamp monitoring
3. **sudoers** (example: `vo5c-production-deploy-privilege-boundary.sudoers.example`) — `env_reset`, pinned runner only for deploy role
4. Cloud-agent shallow-fetch deploy blocked when authority active

**Status (2026-10-11):** sudoers not installed; enforcement not active; `ROOT_BYPASS_RISK: HIGH` per P4B15 evidence.

## Pin promotion vs enforcement

| Action | Authorized in P6 | Requires enforcement |
|--------|------------------|----------------------|
| Install new pin tree + config pointer | Yes | No |
| `ENFORCEMENT_ACTIVE=1` | No | Yes + dual approval |

## Break-glass prerequisites (enforcement activation blocker)

`BREAK_GLASS_READY=NOT_VERIFIED` until each item below is **independently evidenced** (no secrets in git; no invented credentials).

| ID | Prerequisite | R4 status |
|----|--------------|-----------|
| **BG-A** | Documented independent recovery path if the normal SSH/deploy key is lost (provider console, second key custodian, out-of-band runbook — not stored in repo) | **DOCUMENTED** — see [ROLLBACK_AND_CONTAINMENT.md](./ROLLBACK_AND_CONTAINMENT.md) § Break-glass |
| **BG-B** | Emergency privileged access recovery, independently controlled and verifiable (e.g. host provider break-glass, separate break-glass SSH key with distinct approval) | **DOCUMENTED** — procedure only; **not exercised** in R4 |
| **BG-C** | Backup and restoration procedure for pinned executor config (`vo5c-pinned-executor.env`) and sudoers (`/etc/sudoers.d/synqdrive-vo5c-deploy`) | **DOCUMENTED** — restoration steps in rollback doc; backups **not verified** in R4 |
| **BG-D** | Safe recovery from erroneous enforcement policy or locked deploy path (disable enforcement env, restore config backup, remove sudoers fragment, verify floor rollback) | **DOCUMENTED** — Class E + pin pointer rollback |
| **BG-E** | Separate authorized recovery drill before production enforcement go-live | **NOT DONE** — mandatory human drill; blocks `ENFORCEMENT_ACTIVE` |
| **BG-F** | Audit trail and explicit human approval for emergency access | **DOCUMENTED** — required in drill; tooling **not verified** |

Enforcement go-live remains blocked until `BREAK_GLASS_READY` is promoted with evidence artifacts (outside this repository hardening PR).
