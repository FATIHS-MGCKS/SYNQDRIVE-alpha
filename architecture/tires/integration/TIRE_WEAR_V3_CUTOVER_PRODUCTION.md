# Tire Wear V3 — global production cutover runbook

**Status:** OPERATOR_RUNBOOK (documentation)  
**Scope:** Full global replacement of customer-facing Tire V2 wear with Tire V3 (no allowlist, no extended shadow phase).  
**Does not authorize deploy or flag changes by itself** — requires explicit owner production instruction per [architecture/dsrg/DEPLOYMENT_AUTHORIZATION.md](../../dsrg/DEPLOYMENT_AUTHORIZATION.md).

**Related code authority:**

- Flags: `backend/src/config/tire-wear-v3-cutover.config.ts`, policy `tire-wear-v3-cutover.policy.ts`
- Customer read: `TireHealthV3ReadService` (`persistShadow: false` on reads)
- P2 integration notes: [TIRE_WEAR_V3_CUTOVER_P2.md](./TIRE_WEAR_V3_CUTOVER_P2.md)
- P3 evidence limits: [validation/P3_OFFLINE_E2E_2026-10-27.md](../validation/P3_OFFLINE_E2E_2026-10-27.md)
- Deploy pipeline: [architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](../../dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)

**DS4 dynamic wear:** `TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA = 0` in `wear-v3-prior/tire-wear-v3-prior.config.ts` (code constant; not an env flag).

---

## Release identity (verify at execution time)

| Field | How to obtain |
|-------|----------------|
| **Target deploy SHA** | Current `origin/main` after merge of tire stack + #2207 UI authority (40-char hex). **Do not** pin stale RC SHAs once `main` has moved. |
| **Production running SHA** | On VPS: `git -C "$(readlink -f /opt/synqdrive/current)" rev-parse HEAD` |
| **Replica health** | `curl -sS http://127.0.0.1:3001/api/v1/health` and `:3002` |
| **Scheduler roles** | `curl -sS http://127.0.0.1:3001/api/v1/health/readiness` → `checks.schedulerLeader.details.role` (expect one `LEADER`, one `FOLLOWER`) |

PM2 names (production): `synqdrive` (port **3001**), `synqdrive-b` (port **3002**) — see `backend/scripts/ops/vps-production-replica-topology.config.sh`.

Shared env file: `/opt/synqdrive/shared/backend.env` (symlinked into each release as `backend/.env`).

---

## A. Preflight

Complete **before** any production deploy or V3 flag activation.

### A.1 Release and CI

1. `git fetch origin main` and record `MAIN_SHA=$(git rev-parse origin/main)`.
2. Confirm **#2207** is an ancestor of `MAIN_SHA` (`git merge-base --is-ancestor <merge-commit-of-2207> origin/main`).
3. **Critical CI (mandatory, non-bypassable for deploy):** latest `CI gate (all critical jobs)` **success** on the **exact** deploy SHA.
   - From a workstation with `gh` auth:
     ```bash
     node backend/scripts/ops/deploy-ci-gate.mjs "$MAIN_SHA"
     ```
   - Also confirm **Legal Documents — Production Readiness CI** gate job success on the same SHA (owner policy; deploy script canonical gate is Vehicle Detail per `deploy-ci-gate.mjs`).
4. Local or CI evidence on that SHA: backend `npm run build` (after `npx prisma generate`), frontend `npm run build`.

### A.2 Production topology (read-only)

On VPS as `synqdrive-admin`:

```bash
readlink -f /opt/synqdrive/current
git -C "$(readlink -f /opt/synqdrive/current)" rev-parse HEAD
curl -sS http://127.0.0.1:3001/api/v1/health
curl -sS http://127.0.0.1:3002/api/v1/health
```

- Both replicas must be **healthy**.
- **Exactly one** scheduler `LEADER` across 3001/3002 readiness (see § Release identity).
- Record `PRODUCTION_SHA` from `current` git HEAD for both replicas (shared `current` symlink ⇒ same SHA unless deploy in progress).

### A.3 Database

1. **Backup:** `vps-deploy-release.sh` runs pre-deploy backup under `/opt/synqdrive/shared/backups/` — confirm latest backup exists before deploy if not using the standard script.
2. **Migrations:** Deploy runs `npm run prisma:migrate:deploy` with `SYNQDRIVE_MIGRATION_AUTHORITY=1` and production DB preflight (`vps-production-database-deploy-preflight.sh`).
3. **Prod → target SHA delta (2026-10-28 audit):** If production is already at `9512ff95` (#2198), commits through #2207 add **no new Prisma migrations** — only application + docs. If production lags `9512ff95`, expect additive migrations already on main:
   - `20261027150000_document_extraction_registration_certificate_type` — `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'REGISTRATION_CERTIFICATE'`
   - `20261027180000_vehicle_registration_identity_provenance` — nullable `vehicles.registration_identity_provenance` JSONB

### A.4 Cross-workstream (including #2198)

Deploying current `main` includes (among others):

| Workstream | Notes for tire cutover |
|------------|-------------------------|
| **Tire V3 P1–P3 + #2207 UI** | Target behavior; flags **OFF** until §C |
| **#2198 ZB-I P4 storage/ACL** | On production from `9512ff95`; P4 gates default **OFF** (`ZB1_VEHICLE_REGISTRATION_DOCUMENT_P4_*`, extraction still gated by `ZB1_REGISTRATION_CERTIFICATE_EXTRACTION_ENABLED`) |
| **Vehicle identity P2/P3** | Flag-gated UI / provenance column |
| **VSI RPM** | Analytics; independent of tire flags |
| **DS4 governance docs (#2206)** | Documentation; no tire flag coupling |

Tire cutover does **not** require enabling ZB-I P4 or vehicle-identity feature flags.

### A.5 V3 flags before activation

On production, confirm **absent or false**:

```bash
grep -E '^TIRE_WEAR_V3' /opt/synqdrive/shared/backend.env || true
```

Expected before cutover: **no keys** or both customer-read flags **false** / unset (defaults false in code).

**Do not** set `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED=true` for this cutover (customer reads always use `persistShadow: false`; shadow env is separate).

---

## B. Deployment (release only — flags still OFF)

Use the **existing SynqDrive production pipeline** only. No `git reset --hard`, no force-push, no manual copy of unreviewed trees.

### B.1 Owner authorization

Set deploy ack only when the owner explicitly requested production release in the current task:

`CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` (agents) — see AGENTS.md / DSRG runbook.

### B.2 Deploy exact SHA

After `git push origin main` (when deploying main tip):

```bash
bash .cursor/scripts/cloud-agent-ssh-preflight.sh
CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 bash .cursor/scripts/cloud-agent-deploy.sh
```

Or explicit SHA:

```bash
CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 \
CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
CLOUD_AGENT_REQUESTED_DEPLOY_SHA=<40-char-MAIN_SHA> \
bash .cursor/scripts/cloud-agent-deploy.sh
```

Remote entry (on VPS): `SYNQDRIVE_REQUESTED_DEPLOY_SHA=<sha> bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh` — DB backup → migrate → build → rolling replicas A/B → attestation → public health.

### B.3 Post-deploy verification (still flags OFF)

1. `git -C "$(readlink -f /opt/synqdrive/current)" rev-parse HEAD` **equals** requested SHA on promoted release.
2. Both `:3001` and `:3002` `/api/v1/health` → `status: ok`.
3. Readiness: one `LEADER`, one `FOLLOWER`.
4. Public: `https://app.synqdrive.eu/api/v1/health`.
5. **Confirm V3 flags still OFF** (§A.5).

**Stop** if any check fails (see §F).

---

## C. Global V3 activation (both flags together)

Perform only after **B** succeeds and owner explicitly authorizes **tire cutover** (separate from deploy authorization).

### C.1 Set flags (shared env)

Edit `/opt/synqdrive/shared/backend.env` (both replicas consume via symlink):

```bash
TIRE_WEAR_V3_CUSTOMER_READ_ENABLED=true
TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE=true
```

Policy (**code**): authoritative mode requires **both** `true`. `AUTHORITATIVE=true` alone has **no** effect (`isTireWearV3CustomerReadAuthoritative`).

Leave `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` unset or `false`.

### C.2 Rolling restart (config reload)

Restart **one replica at a time** with `--update-env` so both load the same `backend.env`:

```bash
cd /opt/synqdrive/current/backend
ECO=scripts/ops/pm2.production-ecosystem.config.cjs
pm2 restart "$ECO" --only synqdrive --update-env
# wait until :3001 health + readiness OK
pm2 restart "$ECO" --only synqdrive-b --update-env
# wait until :3002 health + readiness OK; re-check single LEADER
```

(Equivalent to helpers in `backend/scripts/ops/lib/vps-production-replica.lib.sh`.)

### C.3 Verify effective configuration

On **each** port after restart:

```bash
grep -E '^TIRE_WEAR_V3_CUSTOMER_READ' /opt/synqdrive/shared/backend.env
```

Functional probe (authenticated API — org user with `fleet.read`):

- Responses must include `wearReadModel: "v3"` and populated `wearV3` on tire summary when authoritative.

No per-vehicle allowlist. No parallel customer V2+V3 presentation when authoritative (UI #2207 suppresses V2 tread-life % as current wear).

---

## D. Post-activation smoke tests

Use **authenticated** requests (Clerk session / org-scoped JWT) for a test org and vehicles with known tire setups. Base paths (Nest global prefix `api/v1`):

| # | Check | Endpoint / surface |
|---|--------|-------------------|
| 1 | `wearReadModel=v3` | `GET /api/v1/vehicles/:vehicleId/tires/summary` |
| 2 | Detail uses V3 | `GET /api/v1/vehicles/:vehicleId/tires/detail` → `summary.wearV3` |
| 3 | Wear analysis uses V3 path | `GET /api/v1/vehicles/:vehicleId/tires/wear-analysis` (via `TiresService.getWearAnalysis` → tire health stack) |
| 4 | UI: no V2 % as current wear | Rental vehicle health → tires (HealthErrorsView + health box); under v3 no legacy tread-life % card |
| 5 | Intervals + evidence | `wearV3.wheels[].treadDepthMm`, `treadEvidenceClass`, `verificationStatus` |
| 6 | Missing evidence | `INSUFFICIENT_EVIDENCE` / `insufficientEvidence: true` — no fake “excellent” clearance |
| 7 | Alerts | Summary `alerts` may include `TIRE_V3_*` reason codes (`tire-health-alert.registry.ts`) |
| 8 | Fleet detector | `TireCriticalDetector` uses `TireHealthService.getSummary` only (no parallel thresholds) |
| 9 | Rental health | `GET /api/v1/organizations/:orgId/vehicles/:vehicleId/rental-health` → tire module may expose `V3_VERIFICATION_*` structured codes; fail-closed on insufficient evidence |
| 10 | V2 snapshots | Trigger `POST .../tires/recalculate` (if used) — logs should show **skip** of `tireHealthSnapshot.create` when authoritative (`shouldSuppressV2TireWearSnapshotWrites`) |
| 11 | Shadow writes | No new rows from customer reads (`computeForSetup({ persistShadow: false })`); optional env shadow remains off |
| 12 | Rental safety | No clearance / “excellent” rental state when V3 verification is insufficient or overdue (see `tire-rental-health.policy.ts`) |
| 13 | DS4 beta | Code constant `TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA === 0` (no env toggle in P3A) |

Optional DB read-only: count new `tire_health_snapshot` rows during smoke window — expect **no** new writes under authoritative mode.

---

## E. Rollback

### E.1 Flag rollback (preferred — no binary change)

1. Set in `/opt/synqdrive/shared/backend.env`:
   ```bash
   TIRE_WEAR_V3_CUSTOMER_READ_ENABLED=false
   TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE=false
   ```
2. Rolling PM2 restart both replicas (§C.2).
3. Confirm API `wearReadModel` returns to **v2** presentation and V2 fields drive UI.
4. Confirm V2 snapshot creation resumes on recalculate (see `tire-health-recalculate-v3-cutover.spec.ts` behavior).
5. Historical V2 snapshots, measurements, and V3 prior tables **remain** — no data deletion.

### E.2 Binary rollback (release SHA)

Use when application code must revert (not for routine tire flag off).

1. Execute VO5C-aware rollback via `vps-deploy-release.sh` rollback path / documented DSRG rollback (same replica topology).
2. **Schema compatibility:** Forward migrations already applied (enum value, JSONB column) **must not** be down-migrated. Older binaries at `51adb234`–`9512ff95` generally tolerate unused enum values and nullable columns if ZB-I / identity flags remain OFF.
3. **Incompatible binary rollback** would require a dedicated DBA/release decision if a migration removed columns or tightened constraints — **not** the case for tire cutover migrations listed in §A.3.
4. After binary rollback, still **disable V3 flags** (§E.1) if env entries were added.

### E.3 What rollback does not do

- No destructive Prisma down migrations.
- No purge of `tire_wear_v3_prior_shadow_v1` or historical snapshots.
- No automatic revert of #2198 ZB-I storage code — separate scope.

---

## F. Stop conditions

**Halt deploy or cutover** and escalate if any of:

| Condition | Action |
|-----------|--------|
| Critical CI not **success** on deploy SHA | Do not deploy |
| `REQUESTED_SHA` ≠ running `current` HEAD after deploy | Stop; investigate rolling deploy |
| Replicas on **different** release SHAs | Stop |
| Different effective `TIRE_WEAR_V3_*` between replicas | Stop; fix env + restart |
| `prisma migrate deploy` or DB preflight failure | Stop; no flag activation |
| ≠1 scheduler `LEADER` | Stop |
| Tire APIs 5xx or contract break | Stop; consider §E |
| Customer UI shows **V2 %** as current wear under `wearReadModel=v3` | Stop; regression |
| Rental clearance despite `INSUFFICIENT_EVIDENCE` | Stop — safety |
| Unintended `tireHealthSnapshot` writes or shadow dual-write on reads | Stop |

---

## G. Scientific and evidence limits (customer communication)

Do **not** over-claim precision after cutover:

1. **Historical measurements without odometer** on the accepted anchor → verification `INSUFFICIENT_EVIDENCE` (fleet audit; see P3 ledger).
2. **VW Arteon (cohort)** — no accepted tread measurements in P3 read-only replay; V3 shows insufficient evidence, not measured mm truth.
3. **`BASELINE_ESTIMATE` / uncalibrated priors** — intervals are model outputs, not workshop gauge readings.
4. **No absolute mm accuracy guarantee** — present mm **intervals** and evidence class (`MEASURED`, `CALIBRATED_ESTIMATE`, `BASELINE_ESTIMATE`, insufficient).
5. **New measurements** can be recorded later via normal lifecycle/measurement flows; cutover does not backfill invented odometer history.
6. **Do not invent historical mileage** to force “current” verification — odometer integrity gates remain active.

Reference evidence: `architecture/tires/validation/P3_OFFLINE_E2E_2026-10-27.md`, `architecture/tires/research/CHANGE_LEDGER.md` (P3 entry).

---

## Document control

| Version | Date (UTC) | Notes |
|---------|------------|--------|
| 1.0 | 2026-10-28 | Initial operator runbook post–#2207 merge; production audit 9512ff95, main ahead with #2207 |
| 1.1 | 2026-10-28 | §H — production global activation attestation (`6ec3844c3`, service-level validation) |

---

## H. Production activation attestation (executed 2026-10-28)

Global authoritative V3 activated per §C on binary **`6ec3844c3293e8b4a5863fe75562fd82f8f3a839`** without binary redeploy. Canonical evidence: [`../evidence/TIRE_V3_GLOBAL_CUTOVER_2026-10-28.md`](../evidence/TIRE_V3_GLOBAL_CUTOVER_2026-10-28.md).

| Outcome | Value |
|---------|--------|
| `GLOBAL_V3_AUTHORITY` | YES |
| Authenticated HTTP smoke | NOT VERIFIED |
| Rollback | Not required (flag rollback §E.1 remains available) |
