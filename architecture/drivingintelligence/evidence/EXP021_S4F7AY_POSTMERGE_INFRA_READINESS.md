# EXP-021 S4F-7AY — Post-merge Gate-6 infrastructure readiness (read-only)

**Date:** 2026-10-10 (UTC)  
**Merged PR:** #1955 @ `73024ccc9bdb964db288ba1b1cfb9a73ef028f61`  
**Production observation:** read-only via `synqdrive-admin@srv1374778.hstgr.cloud` (sudo used only for file metadata hashes and non-secret `backend.env` key lines).

## 1. GitHub / operator

| Check | Result |
|-------|--------|
| PR #1955 merged | YES @ `2026-10-10T00:38:53Z` |
| `origin/main` | `73024ccc9bdb964db288ba1b1cfb9a73ef028f61` |
| Operator tests on merge head | `test:di:s4f7as:gate6-open-rekill-operator` **71** PASS |
| Gate-6 scripts on **deployed** release `ab72f574…` | **ABSENT** (no `di-v0-s4-gate6-open-rekill-production*` under release tree) |
| `package.json` runtime delta `ab72f574…` → `73024ccc…` | **No new runtime deps** for Gate-6 (operator-only TS + npm scripts) |
| Isolated tool checkout | **Required:** detached checkout @ `>= 73024ccc…`; may reuse `/opt/synqdrive/current/backend/node_modules` + `npx ts-node` (same lockfile generation as deployed release) |
| Full main deploy before **infrastructure** provisioning | **NOT required** |
| Full main deploy before **running** Gate-6 operator on VPS | **NOT required** if detached tool checkout is used; **required** only if policy mandates release-tree parity |

## 2. Production attestation (fresh)

| Pin | Last known | Observed 2026-10-10T00:53Z | Match |
|-----|------------|------------------------------|-------|
| SHA | `ab72f574014d6657cac158c253696b7237cdd3e6` | `ab72f574014d6657cac158c253696b7237cdd3e6` | YES |
| Release | `20261009152645_v4994` | `20261009152645_v4994` | YES |
| Env SHA256 | `767686b9…bedbf0` | `767686b9b022633284fa8b228cff2ccb6bed2c8d8dc21cae6022e36ff6bedbf0` | YES |

| Signal | Result |
|--------|--------|
| Replica A/B attestation fingerprint | **PARITY** — both `2db4b520cca72ea5e4940d72b50cc098ed52042c18f56966c1ead601ffcdcd88`, state `OTHER` |
| Five S4 flags ON | **YES** — `MASTER`, `DISCOVERY`, `WORKER`, `POSITION`, `R1` = `true` |
| `DI_V0_S4_NATIVE_ENABLED` | **OFF** (key absent → default false) |
| S4 vehicle allowlist | **Single vehicle** `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| GLOBAL kill | **KILLED** (`di_v0_s4_control` row count 1) |
| S4 zero-state counts | pipeline/work_items/active/snapshots/shadow **all 0** |
| DIMO global budget metrics | `synqdrive_dimo_global_budget_enabled 1`, cooldown **0** |
| APDS shadow | `WORKER_APD_SHADOW_ENABLED=true`; metrics `synqdrive_apd_shadow_enabled 1` |
| Redis | `PONG` |
| NGINX | `active` |
| Public health | `https://app.synqdrive.eu/api/v1/health` **ok** |
| Replica health :3001/:3002 | **200** |

**Note:** `WORKER_APD_SHADOW_COHORT_JSON` lists **four** LTE_R1 vehicles; S4 **vehicle allowlist** remains **one** vehicle (shadow cohort ≠ S4 execution allowlist).

## 3. Gate-6 trust path inventory

| Path | Exists | Owner/mode (observed) |
|------|--------|---------------------|
| `gate6-live-open-approval-public.pem` | **NO** | — |
| `gate6-live-open-approval-consumption/` | **NO** | — |
| `gate6-live-open-dispatch-issuance/` | **NO** | — |
| `gate6-live-open-dispatch-issuance-mac.key` | **NO** | — |
| `gate6-live-open-approval-root.key` (legacy HMAC) | **YES** | `root:root` `600`, 44 bytes |
| `/opt/synqdrive/shared` parent | **YES** | `root:root` `755` |

No symlink targets observed (paths missing except legacy root key).

## 4. Rights / execution concept (engineering)

- **Ed25519 private key:** MUST remain **off** Production; sign approvals only on offline signer (S4F-7AX offline boundary).
- **Production public key file:** target `root:root` `640` or tighter, no symlinks, under `/opt/synqdrive/shared/` (trust-anchor validator).
- **Consumption register:** `root:root` directory `750` (no group/other write); markers `040` via `O_EXCL` from privileged issuer.
- **Issuance register + MAC key:** directory `750`; issuance JSON `440`; MAC key `400` **root-only read** — `issue-dispatch-token` must run under a **dedicated privileged invocation** (recommended: `sudo` wrapper limited to Gate-6 issuance CLI, not blanket root for `synqdrive-admin`).
- **Live OPEN operator:** read public key + registers + token files; atomic `live-open-spent` marker requires **write** on issuance register directory — same privileged boundary as issuance spend, **without** MAC key read if spend-only path is split (current code: verify reads MAC key — operator needs **read** on MAC key file `440` root:`gate6` group or sudo-read wrapper).
- **Backend replicas:** no new write access to trust paths; no Gate-6 material in app process.
- **Legacy HMAC root key:** leave **unchanged** (`600` root).
- **EMERGENCY_REKILL:** independent of Ed25519/dispatch path (ack + audit only); requires Gate-6 **tool checkout** on VPS (not present on deployed release tree today).

**Compatibility gap (pre-provision):** Code expects protected anchors; until directories/key exist, `issue-dispatch-token` / `live-open-authorized` fail closed on Production surface.

## 5. Provisioning plan (not executed)

| Step | Action | Authorization |
|------|--------|----------------|
| A | Provision offline Ed25519 signer (air-gapped); generate keypair; record `approvalId` policy | Human + security |
| B | Install **public** PEM only to `gate6-live-open-approval-public.pem` with trust-anchor modes | Root one-shot |
| C | Create `gate6-live-open-approval-consumption` (`750` root:root) | Root one-shot |
| D | Create `gate6-live-open-dispatch-issuance` (`750` root:root) | Root one-shot |
| E | Generate issuance MAC key offline; install `gate6-live-open-dispatch-issuance-mac.key` (`400` root:root) | Root one-shot |
| F | Read-only verify: `evaluateProductionGate6IssuanceTrustAnchors` + directory permission probes | `synqdrive-admin` |
| G | Document sudo/wrapper for privileged issuance + live-open spend (no backend replica ACL change) | Ops runbook |

**Explicitly not in this plan:** approval JSON creation, dispatch token issue, live OPEN, deploy, DRY_RUN, Gate-6 grant.

## 6. Blockers

1. **Gate-6 trust files/registers not provisioned** on Production shared volume.  
2. **Gate-6 operator not on deployed release tree** — use detached checkout @ `73024ccc…` until deploy policy says otherwise.  
3. **Privileged writer model** must be defined before first issuance (sudo-wrapped CLI vs dedicated `gate6` Unix group + ACL) so MAC key read and register `O_EXCL` writes succeed without widening backend replica permissions.

Production runtime pins (**SHA / release / env hash / KILLED / five flags**) **match** last known good state → attestation **PASS**. Infrastructure **not ready** until steps B–E (+ writer model) complete.
