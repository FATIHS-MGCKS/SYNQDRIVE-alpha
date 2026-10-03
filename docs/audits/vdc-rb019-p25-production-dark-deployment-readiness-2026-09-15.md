# VDC RB-019 P2.5 — Production Dark-Deployment Readiness Audit

| Field | Value |
|-------|-------|
| **Date** | 2026-09-15 |
| **Type** | Read-only Production VPS audit + deployment planning (**no deploy**) |
| **TASK_START_MAIN_SHA** | `ad8392d8cb9bf4301602783bed74876c9c5fd5b2` |
| **FINAL_OBSERVED_MAIN_SHA** | `ad8392d8cb9bf4301602783bed74876c9c5fd5b2` |
| **Production release** | `20260915000043_v4994` → `/opt/synqdrive/current` |
| **Production git SHA** | `bd3fd78060034f628892d1b9da9cf6991e65606b` (EXP-021 / PR #1649) |

## Safety invariants (unchanged)

| Invariant | Value |
|-----------|-------|
| `FEATURE_FLAGS_ENABLED` | **NO** |
| `AUTHORITY_MODE_IN_PRODUCTION` | **LEGACY** (0 latch rows) |
| `AUTHORITY_LATCH_MUTATED_IN_PRODUCTION` | **NO** |
| `STATEFUL_SHADOW_ENABLED_IN_PRODUCTION` | **NO** |
| `SIDE_EFFECTS_EXECUTED_IN_PRODUCTION` | **NO** |
| `PRODUCTION_MUTATED` | **NO** |
| `PRODUCTION_DEPLOYED_BY_THIS_TASK` | **NO** |
| `P2_5_CUTOVER_EXECUTED` | **NO** |
| `P2_5_CUTOVER_ACTIVATION_READY` | **NOT_PROVEN** |

---

## 1. Main baseline (#1652 / #1654 / #1655)

| PR | Merge commit on `origin/main` | Present |
|----|-----------------------------|---------|
| #1652 P2.5 authority cutover runtime | `fda8a218c` | **YES** |
| #1654 activation-readiness audit | `c310d752f` | **YES** |
| #1655 signed provenance + trust-root | `ad8392d8c` | **YES** |

Production is **8 commits behind** `origin/main` and lacks P2.5 runtime/provenance artifacts in deployed `dist/`.

---

## 2. Production topology (read-only, 2026-09-15 ~13:38 UTC)

| Field | Value |
|-------|-------|
| `PRODUCTION_HOST_ROLE` | Hostinger VPS `srv1374778.hstgr.cloud` |
| `PRODUCTION_APP_PATH` | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260915000043_v4994` |
| `PRODUCTION_PROCESS_MANAGER` | **PM2** (`pm2-root.service`, root-owned) + **nginx** reverse proxy |
| `PRODUCTION_NODE_VERSION` | v22.23.1 |
| `PRODUCTION_PACKAGE_MANAGER` | npm (`npm ci` in deploy script) |

### Enumerated cutover-relevant processes

| PM2 name | PID | Port | Role | Script | Uptime (audit) |
|----------|-----|------|------|--------|----------------|
| `synqdrive` | 2274584 | 3001 | API + embedded scheduler | `/opt/synqdrive/current/backend/dist/src/main.js` | ~12.9h |
| `synqdrive-b` | 2274648 | 3002 | API + embedded scheduler (`INSTANCE_ID=replica-b`) | same | ~12.9h |

| Metric | Count |
|--------|-------|
| `REQUEST_REPLICA_COUNT` | **2** |
| `WORKER_REPLICA_COUNT` | **0** (no dedicated worker PM2 apps) |
| `SCHEDULER_REPLICA_COUNT` | **2** capable; **1** active `LEADER` (3001), **1** `FOLLOWER` (3002) |
| `TOTAL_CUTOVER_RELEVANT_PROCESS_COUNT` | **2** |

Health: both replicas `GET /api/v1/health` → `status: ok`. Readiness: postgres/redis/clickhouse ok.

**P2.5 artifact check on Production dist:** `physical-state-authority-cutover.service.js`, `physical-state-cutover-evidence.verifier.js`, `physical-state-cutover-evidence.ops-lib.cjs` — **ABSENT** (pre-#1652 deploy).

---

## 3. Database / migrations (read-only)

| Field | Value |
|-------|-------|
| `P25_DEPLOY_REQUIRES_DB_MIGRATION` | **NO** |
| `PENDING_PRODUCTION_MIGRATIONS` | **None** for `bd3fd78..ad8392d8c` (`git diff` shows no `prisma/migrations` changes) |
| `MIGRATION_RISK_CLASSIFICATION` | **LOW** for schema; deploy still ships **unrelated runtime** (EED RFRF F5–F7) |

`device_connection_physical_authority_cutover`: **0 rows** (implicit LEGACY everywhere).

---

## 4. Environment contract (names only; values redacted)

All checked keys in `/opt/synqdrive/shared/backend.env`:

| Variable | Status |
|----------|--------|
| `SYNQDRIVE_BUILD_ID` | **ABSENT** |
| `SYNQDRIVE_BUILD_SHA` | **ABSENT** |
| `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID` | **ABSENT** |
| `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` | **ABSENT** |
| `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_EVIDENCE_PUBLIC_KEYS_JSON` | **ABSENT** |
| `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED` | **ABSENT** → code default **false** |
| `CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED` | **ABSENT** → **false** |
| `CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED` | **ABSENT** → **false** |
| `CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED` | **ABSENT** → **false** |
| `CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED` | **ABSENT** → **false** |

Shared `backend.env` is global to both PM2 forks (only `PORT` / `INSTANCE_ID` differ per ecosystem entry).

---

## 5. Build-ID contract (future dark deploy)

- **Authoritative identity:** `SYNQDRIVE_REQUESTED_DEPLOY_SHA` / git `HEAD` of promoted release (40-char hex).
- Set `SYNQDRIVE_BUILD_ID=<deploy-sha>` and `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID=<same-sha>` in `backend.env` **at deploy time** (not currently automated in `vps-deploy-release.sh`).
- **Does not activate cutover:** flags remain OFF; `attemptAuthorityCutover` has **no production caller**; missing signed bundle + missing keyring fail closed.

---

## 6. Peer-list contract (2-replica Production)

- `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` = comma-separated **other replicas'** build SHAs (cardinality = N−1).
- For uniform 2-replica fleet on same SHA: **one entry** equal to the deployed SHA works on **both** replicas (symmetric global env).
- PM2 **cannot** supply different peer lists per replica today without ecosystem/env-file split — acceptable for uniform fleet; **cutover must not be attempted during mixed-build rollout**.
- P2.5 interlock + signed bundle peer digest enforce fleet uniformity at cutover time.

`PEER_LIST_CONTRACT_RESULT`: **PASS** for dark deploy and future uniform-fleet cutover; **mixed-build cutover blocked** by design.

---

## 7. Public keyring policy

**Recommendation:** **A — remain absent** during initial dark deploy.

- Private signing key: **never** on Production.
- Missing `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_EVIDENCE_PUBLIC_KEYS_JSON` → verifier returns `PUBLIC_KEY_CONFIG_INVALID` / `MISSING_BUNDLE` paths → **cutover blocked**.
- **Before any cutover attempt:** ops provisions Ed25519 keypair off-Production, adds **public** keyring JSON to `backend.env`, signs target bundle via offline CLI.

---

## 8. Dark-deploy behavior proof (code @ `ad8392d8c`)

| Check | Result |
|-------|--------|
| Webhook remains LEGACY-authoritative (flags OFF) | **PASS** — `writeWebhookEvidence` returns `disabledResult` when `!masterEnabled` |
| Snapshot remains LEGACY-authoritative | **PASS** — same gate |
| No authority latch without signed evidence | **PASS** — `attemptAuthorityCutover` only in tests; requires `VALID` verification |
| No automatic preseed apply | **PASS** — `applyPhysicalStatePreseed` only in tests |
| No STATEFUL_SHADOW without flags | **PASS** — `statefulShadow` requires master + projection + shadow compare + `!sideEffects` |
| No side effects (flags OFF) | **PASS** — `sideEffectsEnabled` sub-flag false |
| No automatic cutover on startup | **PASS** — no `onModuleInit` cutover path |
| Missing evidence cannot trigger latch | **PASS** — `MISSING_BUNDLE` / invalid signature blocked |

---

## 9. Rollback (application only; authority stays LEGACY)

- Deploy state: `/opt/synqdrive/shared/deploy-state/last-deploy-state.env` captures `PREVIOUS_SHA` + `PREVIOUS_CURRENT_RELEASE`.
- Rollback: `vps_replica_rollback` (PM2 rolling restart previous release symlink).
- **DB:** no pending migrations in delta → **rollback safe** for code-only revert.
- **Not** PHYSICAL→LEGACY authority rollback (no PHYSICAL latched rows exist).

---

## 10. Proposed zero-downtime rollout (DO NOT EXECUTE)

1. Record `PREVIOUS_SHA=bd3fd7806…` (current).
2. Pre-deploy: `pg_dump` backup (existing script).
3. Deploy `SYNQDRIVE_REQUESTED_DEPLOY_SHA=ad8392d8cb9bf4301602783bed74876c9c5fd5b2` via `vps-deploy-release.sh`.
4. **Before PM2 restart:** append to `backend.env` (non-secret):
   - `SYNQDRIVE_BUILD_ID=ad8392d8cb9bf4301602783bed74876c9c5fd5b2`
   - `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID=ad8392d8cb9bf4301602783bed74876c9c5fd5b2`
   - `SYNQDRIVE_REPLICA_PEER_BUILD_IDS=ad8392d8cb9bf4301602783bed74876c9c5fd5b2` (after both replicas on same SHA)
   - **Do not** add physical-state flags or public keyring yet.
5. Rolling restart replica A (`synqdrive` / 3001) → health + readiness.
6. Rolling restart replica B (`synqdrive-b` / 3002) → health + readiness.
7. Scheduler leader convergence gate (existing script).
8. Verify both replicas on same git SHA; authority table still 0 PHYSICAL rows; flags absent/OFF.
9. Observe logs 30–60 min; **no cutover API call**.

**Mixed-build window:** acceptable for dark deploy (legacy path unchanged). **Forbidden:** cutover attempt until fleet uniform + operational proofs complete.

---

## 11. Post-deploy health checks (read-only)

- `https://app.synqdrive.eu/api/v1/health`
- Per-replica `:3001` / `:3002` health + readiness
- Scheduler roles: exactly one `LEADER`
- `sudo git -C /opt/synqdrive/current rev-parse HEAD` on both replicas
- `SELECT count(*) FROM device_connection_physical_authority_cutover WHERE authority_mode='PHYSICAL'` → **0**
- DIMO webhook ingest + VLS polling metrics unchanged
- No new `CONNECTIVITY_PHYSICAL_STATE_*` flags enabled

**Abort criteria:** readiness fail, dual scheduler leaders, error spike, unexpected authority rows, accidental flag enablement.

---

## 12. Shadow / pilot (out of scope for dark deploy)

Sequence remains: dark deploy → stabilize → approve pilot → enable STATEFUL_SHADOW per cohort → observe ≥7d → UNEXPLAINED=0 proof → signed cutover bundle → cutover.

`FORMAL_PILOT_COHORT_APPROVED` = **NO**

---

## Decision

| Field | Value |
|-------|-------|
| `DARK_DEPLOYMENT_BLOCKERS` | **None HIGH** — informational: co-deploys EED F5–F7 runtime; build-ID env must be set manually at deploy |
| `DARK_DEPLOYMENT_READY` | **YES** (planning only — **not authorized by this audit**) |
