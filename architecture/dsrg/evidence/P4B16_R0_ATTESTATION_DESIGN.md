# P4B16 — Release attestation design (proposed, R0 + R0A)

**Status:** `PROPOSED` — documentation only through R0A; no runtime script changes.  
**Pin (unchanged):** `448a88985b78b6a7c4d973913b9a6213bae3e9b4` — no promotion in R0/R0A.  
**R0A correction:** single authoritative state + journal publication; PM2/env consumer matrix; per-replica runtime identity; entrypoint coverage.

## Frozen production drift (R0 audit snapshot — not live truth)

Observed **2026-10-11T16:05:00Z** (read-only). Values **may have changed** since; do **not** manually correct Production in documentation workstreams.

| Label | SHA |
|-------|-----|
| **LIVE_RELEASE_SHA** (`git -C current HEAD`) | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| **BACKEND_ENV_ATTESTATION_SHA** | `3a4bb9448279cd9e04a88c3639059c948c62f3ed` |
| **PIN_SHA** | `448a88985b78b6a7c4d973913b9a6213bae3e9b4` |

## Root cause (unchanged)

1. `vps-deploy-release.sh` does not publish attestation after `vps_replica_verify_post_deploy`.
2. `backend.env` is shared; **editing the file does not reload** NestJS `process.env` in already-running PM2 workers.
3. Deploy verification uses release-tree git + `current` symlink, not attestation consumers.
4. Per-replica runtime SHA is **not** independently attestable via health API today.

---

## 1. Single authoritative durable state (R0A)

### Problem with R0 sketch

Separate atomic `mv` for `release-attestation.env` and `backend.env` is **not** one transaction. Crash after the first rename yields **partial publication** while `ATTESTATION_PHASE=COMMITTED` could be misread.

### Authority model

| Layer | Role |
|-------|------|
| **`release-attestation.state`** | **Single source of truth** for lifecycle + `COMMITTED_SHA` + per-replica observations |
| **`attestation.journal`** | Append-only **recovery / publication log** (intent → durable state → mirrors) |
| **`backend.env` line** | **Legacy mirror** for bootstrap-time consumers only — not authoritative |
| **`release-attestation.state.sha256`** | Checksum of **state file only** (not a second transaction target) |

**Paths (proposed):**

- `/opt/synqdrive/shared/deploy-state/release-attestation.state` — root:root **`0640`**
- `/opt/synqdrive/shared/deploy-state/attestation.journal` — root:root **`0640`**, append-only
- `/opt/synqdrive/shared/deploy-state/.attestation.lock` — `flock` (deploy **and** rollback)
- `backend.env` — existing path; **symlink target must remain real file** (reject if `backend.env` is symlink to attacker path)

**No secrets** in state/journal (SHAs and phase enums only).

### Publication ordering (fail-closed)

`COMMITTED` is **not** visible to readers until **all** of the following complete:

1. Post-deploy verification PASS (including per-replica runtime identity — §3).
2. Journal append: `BEGIN_COMMIT gen=N sha=…`
3. Write `release-attestation.state.tmp` → `fsync` file → `rename` → `fsync` parent dir.
4. Journal append: `STATE_DURABLE gen=N`
5. Optional mirror: patch `SYNQDRIVE_DEPLOYED_GIT_SHA` in `backend.env` via copy-on-write temp + single `rename` (same filesystem).
6. Journal append: `BACKEND_ENV_MIRROR gen=N` (or `MIRROR_SKIPPED` if mirror fails → **remain not COMMITTED**).
7. Journal append: `PUBLISHED gen=N` — only now set `ATTESTATION_PHASE=COMMITTED` inside state (state file rewritten once with COMMITTED in step 3 **or** final rewrite in step 7; preferred: **one** state write with phase `VERIFIED` then journal-driven promote to `COMMITTED` in step 7 second rename).

**Simpler variant (recommended):** state file carries `PHASE=VERIFIED` until step 7; step 7 writes final state with `PHASE=COMMITTED` + `PUBLISHED_AT` in **one** rename after mirror success.

### Crash / partial commit recovery

| Crash point | On restart |
|-------------|------------|
| Before `STATE_DURABLE` | Replay from journal; state may be stale — remain `IN_PROGRESS` or `VERIFIED` |
| After state, before mirror | Journal shows no `PUBLISHED` — readers **fail-closed** (not COMMITTED) |
| After mirror, before `PUBLISHED` | Reconcile: if runtime identity matches target, append `PUBLISHED` idempotently |
| Mid-backup of `backend.env` | Only `*.bak-<ts>` touched; live `backend.env` unchanged until successful rename |

**Idempotent retry:** If journal tail is `STATE_DURABLE` for `gen=N` and verify still PASS, resume mirror + `PUBLISHED` without re-deploy.

**Verification after replace:** Re-read state checksum; grep mirror line; call runtime identity endpoint on **each** replica; **all** must match `COMMITTED_SHA` before `PUBLISHED`.

### Reader fail-closed rules

1. If journal tail ≠ `PUBLISHED` for current `gen`, treat as **not COMMITTED** (even if state file says COMMITTED — corrupted/partial).
2. If `COMMITTED_SHA` ≠ independent runtime identity on **any** replica → **not COMMITTED** / alert.
3. If `backend.env` ≠ state `COMMITTED_SHA` → legacy consumers may be stale; **prefer state file** for new code; alert CRITICAL.

### Durability assumptions

- Same filesystem for `rename` atomicity (`/opt/synqdrive/shared`).
- `fsync` on state file and journal after each append (document VPS ext4 defaults; no remote FS).
- Lock held from `PREPARED` through publish complete or `FAILED`/`CONTAINED`.

### State file fields (authoritative)

Includes lifecycle phase, `REQUESTED_SHA`, `COMMITTED_SHA`, `PREVIOUS_COMMITTED_SHA`, `REPLICA_A_RUNTIME_SHA`, `REPLICA_B_RUNTIME_SHA`, `RELEASE_ID`, `CORRELATION_ID`, `GENERATION`, `UPDATED_AT`.  
Does **not** include APDS / Gate-6 / RFRF / VO5C product fields.

---

## 2. PM2 / env consumer semantics (R0A)

| Consumer | Mechanism | Freshness today | P4B16 target |
|----------|-----------|-----------------|--------------|
| **NestJS long-lived workers** | `process.env` at PM2 start from `backend/.env` symlink | Stale until replica restart | **No extra restart** for attestation-only: use **runtime identity API** (§3) for truth; mirror `backend.env` for **next** restart bootstrap |
| **APDS operator CLI** | Shell `process.env` / `--expected-sha` + `resolveObservedDeployedGitSha()` reads env | CLI invocation reads **current shell** env, not PM2 | CLI should accept `--observed-from-state` or query runtime identity; compare to `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` separately |
| **APDS in-process authority** | `process.env.SYNQDRIVE_DEPLOYED_GIT_SHA` in running scheduler | Stale until restart | Epoch **mutations** must compare against **runtime identity** or state file, not file-only attestation |
| **VO5C offboard admission** | `evaluateMasterVehicleOffboardHttpAdmission()` reads `process.env` at request time | Stale if env not reloaded | Gate on **runtime identity** + optional `MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA`; document mismatch as `RELEASE_ATTESTATION_MISMATCH` |
| **Frontend Master UI** | `import.meta.env.VITE_SYNQDRIVE_DEPLOYED_GIT_SHA` **build-time** | Fixed until frontend rebuild/redeploy | Build pipeline must inject SHA from **deployed** release build; independent from `backend.env` patch timing |
| **Ops / humans** | `grep backend.env` | Often wrong (R0) | Read `release-attestation.state` + runtime identity |

**Explicit non-claim:** Changing `backend.env` does **not** update PM2 `process.env`. P4B16 does **not** mandate a third full rolling restart solely to refresh env if runtime identity API is authoritative for gates.

---

## 3. Per-replica runtime identity (R0A)

Shared `current` symlink proves **intended** release tree, not independent process build identity.

### Proposed runtime contract (implementation phase)

At deploy promote, write **immutable** file in release tree:

- `${RELEASE_DIR}/.synqdrive-release-manifest.json` — `{ "gitSha": "<REQUESTED_SHA>", "releaseId": "...", "builtAt": "..." }`

PM2 ecosystem template sets optional env `SYNQDRIVE_RUNTIME_MANIFEST_PATH` pointing into **that** release dir (per replica cwd).

**HTTP (new):** `GET /api/v1/health/runtime-identity` (or extend readiness `details`):

```json
{
  "replicaId": "replica-b",
  "releaseGitSha": "<40-char>",
  "manifestPath": "...",
  "pm2Name": "synqdrive-b",
  "observedAt": "ISO-8601"
}
```

Sourced from manifest file + process start binding, **not** from shared `backend.env`.

Attestation commit requires **both** replicas return matching `releaseGitSha == REQUESTED_SHA` after verify.

---

## 4. Deployment entrypoint coverage (R0A)

| Entrypoint | Invokes `vps-deploy-release.sh` | P4B16 commit attestation | Notes |
|------------|--------------------------------|--------------------------|-------|
| **Pinned runner** (`vps-vo5c-run-pinned-security-deploy.sh` → `exec bash` deploy) | Yes (pinned tree) | **YES** (target) | Canonical governed path |
| **Direct `vps-deploy-release.sh`** from `/current` | Yes | **YES** when script version includes P4B16 lib | **Still reachable**; enforcement OFF → bypass risk remains |
| **Cloud-agent deploy** | Yes (fetched script) | **YES** if deployed script contains P4B16 | Parallel path; not pin-governed |
| **DI exact-RC gate** (`SYNQDRIVE_DI_S4F7Q_*`) | Yes, optional branch | **YES** same hook | Does not replace P4B16 product attestation |
| **Connectivity staging** | Separate script; may mutate env | **NO** | Out of scope; must not publish COMMITTED |
| **Manual rollback** (`vps_replica_rollback`, `vps-rollback-production-release.sh`) | Rollback path | **YES** — journal `ROLLBACK_PUBLISHED` | Same lock as deploy |
| **Pin promotion only** | No | **NO** | DSRG-02 class |

**Honesty:** Full protection is **not** claimed while legacy direct/cloud paths remain reachable with `ENFORCEMENT_ACTIVE=OFF`. P4B16 improves **honesty** of attestation on paths that run the updated deploy script; P4B17+ enforcement reduces bypass.

---

## 5. Lifecycle phases (summary)

`PREPARED` → `IN_PROGRESS` → `VERIFIED` → (journal) → `COMMITTED` | `FAILED` | `ROLLBACK_IN_PROGRESS` → `ROLLED_BACK` | `CONTAINED`

`COMMITTED` ≡ journal `PUBLISHED` + runtime identity match + state checksum valid.

---

## 6. Non-interference (unchanged)

No automatic updates to: `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA`, APDS ACTIVE epoch, EXP021 Gate-6, RFRF, VO5C product flags.  
`ENFORCEMENT_ACTIVE=OFF` · `BREAK_GLASS_READY=NOT_VERIFIED`.

---

## 7. Implementation boundaries

| Layer | Change |
|-------|--------|
| Main repo | `lib/vps-release-attestation.lib.sh`, health runtime-identity, hooks in deploy + rollback |
| Release tree | Manifest file at promote; deploy script from candidate release |
| Pinned executor | Requires pin promotion **after** implementation merge |
| Frontend | Build-time `VITE_*` alignment in deploy pipeline (separate step) |

Evidence: [`P4B16_R0_PRODUCTION_ATTESTATION_AUDIT.md`](P4B16_R0_PRODUCTION_ATTESTATION_AUDIT.md) · [`P4B16_R0A_DESIGN_CORRECTION.md`](P4B16_R0A_DESIGN_CORRECTION.md)
