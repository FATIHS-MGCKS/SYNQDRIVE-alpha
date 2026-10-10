# EXP-021 S4F-7AZ — Gate-6 privileged writer model closure (read-only)

**Date:** 2026-10-10 (UTC)  
**Merged operator SHA (pin):** `73024ccc9bdb964db288ba1b1cfb9a73ef028f61` (PR #1955)  
**Production observation:** read-only via `synqdrive-admin@srv1374778.hstgr.cloud` (sudo for metadata only; no chmod/chown, no provisioning).

## 1. Production filesystem alignment

### 1.1 Observed metadata (2026-10-10)

| Path | uid/gid | mode | Notes |
|------|---------|------|-------|
| `/opt/synqdrive` | 0/0 | 755 | directory |
| `/opt/synqdrive/shared` | 0/0 | 755 | **no ACL tooling** (`getfacl` absent on host) |
| `/opt/synqdrive/current` | 0/0 | 777 | symlink → `releases/20261009152645_v4994` |
| `/opt/synqdrive/shared/backend.env` | 0/0 | 600 | not readable by `synqdrive-admin` without sudo |
| `gate6-live-open-approval-root.key` (legacy HMAC) | 0/0 | 600 | 44 bytes; **unchanged** |
| Gate-6 Ed25519 / registers / issuance MAC | — | — | **absent** (per S4F-7AY inventory) |

### 1.2 `verifyParentDirectoryChain()` vs Production shared root

On pin `73024ccc…`, the trust anchor required `mode & 0o077 === 0` on every directory up to `/opt/synqdrive/shared`, which implies **700** on the shared root. Production **`755`** is therefore **incompatible** with that merge head **without** changing Production permissions.

**Policy constraint:** no `chmod`/`chown` on shared Production directories for Gate-6.

**Engineering fix (this workstream):** relax the shared-root terminal check to forbid **group/other write** (`mode & 0o022`) while keeping **root ownership** and **no symlinks** on the chain. Gate-6 **leaf** paths remain strict (`640` public key, `750` register dirs, `O_EXCL` markers). Regression test: production-like `755` shared + `750` consumption dir.

| Question | Answer |
|----------|--------|
| Compatible with Production **755** after fix? | **YES** (with merged trust-anchor change) |
| Production shared change required? | **NO** |
| Backend replica / PM2 processes | **Unaffected** — no new read/write on trust paths |

### 1.3 Services and permission dependencies

| Consumer | Reads trust paths | Writes trust paths | Notes |
|----------|-------------------|--------------------|-------|
| NestJS replicas (`synqdrive-backend`) | **No** | **No** | GLOBAL kill via DB only |
| Gate-6 operator CLI (detached checkout) | Public key, MAC key (issuance verify), registers | Consumption + issuance markers (`O_EXCL`) | Requires **euid 0** for writes on root-owned registers |
| Legacy HMAC approval path | Root key file (if old tooling) | N/A for Gate-6 Ed25519 path | Leave `600` root |

---

## 2. Privileged execution model

**Design goal:** one clear **privileged operator path**; no routine root shell; no mutable script checkout; verified git SHA; no widening of backend replica ACLs.

**Honest limit:** a **compromised root** on the VPS can alter root-owned markers, keys, and registers. File permissions and sudo constraints **reduce** accident and lateral movement; they do **not** cryptographically exclude a hostile root.

### 2.1 Account matrix

| Action | Authorized execution identity | Mechanism |
|--------|------------------------------|-----------|
| Install **Ed25519 public** PEM on shared volume | **`root`** (one-shot provisioning) | `install -o root -g root -m 640` create-only |
| Create register directories + issuance MAC key file | **`root`** (one-shot provisioning) | `mkdir 750`, `install -m 400` create-only |
| **Offline Ed25519 private key** | **Never on Production** | Air-gapped signer only; signs human approval JSON off-host |
| Sign human approval JSON | **Offline signer operator** (human) | Produces file consumed by `DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE` |
| **`issue-dispatch-token`** (verify approval, consume `approvalId`, write issuance record) | **`synqdrive-admin` invokes pinned wrapper → effective `root` for CLI** | Constrained `sudo` Cmd_Alias to pinned `ts-node` entry + env allowlist; not interactive root |
| **Approval consumption marker** (`gate6-approval-id.*.consumed`) | Same as issuance (root-owned register, `O_EXCL`) | Inside `issue-dispatch-token` |
| **Trusted dispatch issuance JSON** + MAC | Same privileged CLI as issuance | `recordTrustedDispatchIssuance` |
| **`live-open-authorized`** (provenance, dispatch consume, issuance spend, Prisma OPEN) | **`synqdrive-admin` + pinned wrapper** | Reads MAC key (`400`); writes `*.live-open-spent` via `O_EXCL`; Prisma via `DATABASE_URL` from canonical `backend.env` (wrapper loads via controlled sudo read) |
| **Dispatch token / signing key sidecar** | **`synqdrive-admin`** (operator home or durable backup dir) | Not under shared trust root; one-shot files |
| **Separately authorized live OPEN** (GLOBAL KILLED→NOT_KILLED) | Same as `live-open-authorized` + shell OPEN wrapper with `DRY_RUN=0`, `DI_S4_GATE6_OPEN_ACK=YES`, `DI_S4_GATE6_OPEN_AUTHORIZED=YES` | `di-v0-s4-gate6-open-rekill-production.sh` |
| **`EMERGENCY_REKILL`** (NOT_KILLED→KILLED) | **`synqdrive-admin` + pinned wrapper** | **Independent** of Ed25519/dispatch provisioning; `live-rekill` + `sudo -u postgres psql` readback; **no** trust-path writes |

### 2.2 Pinned operator execution (non-negotiable)

1. **Git pin:** detached worktree at `>= 73024ccc…` **plus** trust-anchor shared-root fix (this PR) before Production attestation passes on `755`.
2. **Dependencies:** reuse `/opt/synqdrive/current/backend/node_modules` (same lockfile generation as deployed release `ab72f574…`); **no** `npm install` from unpinned trees on Production.
3. **Entrypoints:** only `backend/scripts/ops/di-v0-s4-gate6-open-rekill-production.sh` and `…/di-v0-s4-gate6-open-rekill-production-cli.ts` with **fixed absolute paths** in sudoers — no user-supplied script path.
4. **Backend replicas:** must not receive group membership or ACLs on `/opt/synqdrive/shared/gate6-*`.

### 2.3 Key concept check (no keys created here)

| Artifact | Issue location | Verify location | One-shot spend |
|----------|----------------|-----------------|----------------|
| Ed25519 keypair | Offline | Public PEM on Production | N/A |
| Human approval JSON | Offline signer | `loadAndVerifyHumanApprovalFile` at issue + live OPEN | `approvalId` → consumption register |
| Dispatch token + HMAC sidecar | Privileged `issue-dispatch-token` | `live-open-authorized` | Token file consume |
| Trusted issuance record + MAC | Privileged `issue-dispatch-token` | `verifyTrustedDispatchProvenanceForLiveOpen` | `*.live-open-spent` marker |
| Issuance MAC key | Offline generate; root install `400` | HMAC verify on issue + live OPEN | N/A (read-only at verify) |
| Legacy HMAC root key | Pre-existing | Not used for Ed25519 v2 live OPEN | Unchanged |

---

## 3. One-shot provisioning contract (not executed)

**Authorization:** separate human Gate-6 infrastructure grant. **No** approval signing, **no** dispatch issue, **no** live OPEN, **no** deploy in this sequence.

| Step | Target path | Executor | Owner:mode (target) | Create-only | Pre-check | Post-check | If exists | Other workstreams |
|------|-------------|----------|---------------------|-------------|-----------|------------|-----------|-------------------|
| P1 | `/opt/synqdrive/shared/gate6-live-open-approval-public.pem` | `root` | `root:root` `640` | `install -n` or `open(O_CREAT\|O_EXCL)` | Shared root `755` root-owned; trust-anchor eval **PASS** with fix | `evaluateProductionGate6IssuanceTrustAnchors` OK | **Abort** — do not overwrite | None |
| P2 | `/opt/synqdrive/shared/gate6-live-open-approval-consumption/` | `root` | `root:root` `750` | `mkdir` once | Parent chain valid | Empty dir; mode `750` | **Abort** if dir exists with wrong mode/owner | None |
| P3 | `/opt/synqdrive/shared/gate6-live-open-dispatch-issuance/` | `root` | `root:root` `750` | `mkdir` once | Same as P2 | Empty dir | **Abort** on mismatch | None |
| P4 | `/opt/synqdrive/shared/gate6-live-open-dispatch-issuance-mac.key` | `root` | `root:root` `400` | create-only | P3 exists | Readable by root only; 32-byte hex | **Abort** | None |
| P5 | Detached operator tree @ pinned SHA | `synqdrive-admin` | root-owned checkout path e.g. `/opt/synqdrive/gate6-operator/<sha>` | fresh clone | `git rev-parse` = pin | `npm run test:di:s4f7as:gate6-open-rekill-operator` on CI already | **Abort** if wrong SHA | Deploy of `main` **not** required for infra-only |
| P6 | sudoers Cmd_Alias for Gate-6 CLI | `root` | `/etc/sudoers.d/synqdrive-gate6` `440` | new file | syntax `visudo -c` | `synqdrive-admin` can run wrapper only | **Abort** if broad root grant | Ops security review |
| P7 | Read-only attestation | `synqdrive-admin` | — | — | P1–P4 | CLI `guards-open` / trust eval; **no** DB mutation | — | S4F-7AK live staging unchanged |

**Explicit exclusions:** generating Ed25519 private key on VPS; writing consumption/issuance markers; `GATE6_GRANTED`; `S4_ACTIVATED`; env file edits; PM2 restart.

---

## 4. Production pins (observed)

| Pin | Value |
|-----|-------|
| `PRODUCTION_SHA` | `ab72f574014d6657cac158c253696b7237cdd3e6` |
| `ENV_SHA256` | `767686b9b022633284fa8b228cff2ccb6bed2c8d8dc21cae6022e36ff6bedbf0` |
| `GLOBAL_KILL_STATE` | **KILLED** (consistent with S4F-7AY attestation; DB read not repeated this pass) |
| `MERGED_OPERATOR_SHA` | `73024ccc9bdb964db288ba1b1cfb9a73ef028f61` |

---

## 5. Closure blockers (execution-time, not model)

1. Merge trust-anchor **755/shared-root** fix before Production trust eval on existing layout.  
2. Execute provisioning steps P1–P4 (separate authorization).  
3. Install pinned operator checkout + sudo wrapper (P5–P6).  
4. Gate-6 operator still **absent** on deployed release tree — detached pin remains required until deploy policy changes.

**Model / contract / permission engineering:** complete. **Physical provisioning:** still pending separate grant.
