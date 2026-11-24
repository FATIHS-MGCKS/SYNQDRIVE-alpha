# V2B-PR9A — Direct production readiness (release decision package)

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR9A_DIRECT_PRODUCTION_READINESS`  
**Owner policy:** `VO-DEC-OWN-5B` — `DIRECT_CONTROLLED_PRODUCTION_CUTOVER_WITHOUT_SHADOW_SOAK`  
**Baseline:** `origin/main` @ `00b059da77adab5147301cbc6eb5ab4f2f0249c7` (merge PR #2523)  
**Scope:** Documentation and operator contracts only — **no** production access, deploy, flag arm, or mutations in this artifact.

---

## Step 1 — Release baseline

| Check | Result |
|-------|--------|
| `VERIFIED_MAIN_SHA` | `00b059da77adab5147301cbc6eb5ab4f2f0249c7` |
| `RELEASE_CANDIDATE_SHA` | **Same** — docs merge on main; engineering runtime @ `ff90ff14` (PR #2522) embedded in tree |
| V2B-PR1 … PR8 | **MERGED** (#2499, #2510, #2515, #2519, #2520, #2521, #2522, **#2523**) |
| OWN-3, OWN-4, OWN-5B, OWN-6 | **OWNER_APPROVED** |
| OWN-5 shadow track | **SUPERSEDED** |
| PG03 | **18/18** (certified @ merge `af05edf` / harness on main) |
| PG05 | **12/12** (certified @ merge `e9d1985`) |
| PR7 PostgreSQL | **30/30** (certified @ merge `ff90ff14`) |
| `TOTAL_SELECTED_POSTGRESQL` | **60/60** |
| PR7 workflows | **24/24** success (`FINAL_PR7_HEAD=f31b3c252`) |
| Main push CI @ `00b059da` | GitHub Actions run [45501445279](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions) — critical gates (incl. validate-module-registry **success**; VO-5B job **in progress** at package authoring time — reconcile to **terminal success** before PR9B) |

**Relevant commits on `main`:**

| PR | Merge SHA |
|----|-----------|
| V2B-PR1 | `dd82f851b` |
| V2B-PR7 | `ff90ff14a` |
| V2B-PR8 | `00b059da7` |

---

## Step 2 — Final runtime contract (repository verification)

Verified by existing code + certification (no new test framework).

| Invariant | Authority | Evidence |
|-----------|-----------|----------|
| DIMO canonical registration | `MasterDimoCanonicalRegistrationService` | VO-SIG P2; PG03 subset |
| HM canonical registration | `HmOnlyCanonicalRegistrationService` via convergence port | V2B-PR2/PR3; `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` default OFF |
| Manual registration unavailable | `VehiclesService.create` fail-closed | V2B-PR4; `vehicle-row-integration.harness` only |
| Existing vehicle editing | PATCH/update paths unchanged | V2B-PR4 non-goals |
| Org / entitlement | `assertHighMobilityTenantOperationalOrganization`; product entitlement | PR7-09/10 |
| Mandatory readiness | `VehicleOnboardingReadinessService` + rule engine | OWN-3-A |
| Provider identity | `metadata.connectionIdentity`; source adoption | VO-SIG; PR7 fingerprints |
| Idempotent activation | Case idempotency + outbox keys | PG03-M; PR7-12b |
| Single registration billing | `VehicleRegistryLifecycleOutboxProcessor` only | VO-DEC-2B-003; PG05; V2B-PR6 characterization |
| Offboarding / re-onboarding | `VehicleOffboardingService`; terminal lifecycle guards | VO-5A–5C |

**Characterization / PG entrypoints (reuse only):**

- `backend/src/modules/vehicle-onboarding/characterization/v2b-pr6-single-billing-authority.characterization.spec.ts`
- `v2b-hm-canonical-readiness-observation.postgres.integration.spec.ts` (PR7 30)
- `v2b-provider-billing-outbox-parity.postgres.integration.spec.ts` (PG05 12)
- HM PG03 harness per `V2B_PR3_PG03_HM_ONLY_CANONICAL_2026-11-23.md`

---

## Step 3 — Migration compatibility

| Topic | Assessment @ `00b059da` |
|-------|-------------------------|
| V2B-PR1–8 schema deltas | **None** on main after VO-2.x foundation — V2B is behavioral + flags only |
| Latest migration folder | `20261122190000_feux_p9_ui_audit_platform_permissions` (unrelated to V2B cutover) |
| Destructive risk for cutover | **Low** — flag flip only; no V2B-specific pending migration |
| Production DB guard | `backend/scripts/ops/contracts/production-database-guard-bundle.manifest*` — run `bash backend/scripts/test/production-database-guard-bootstrap-dry-run.sh` on release candidate in CI/local |
| Existing vehicles | No migration required for HM canonical arm; **preserve** all `vehicles` rows |

**Operator pre-deploy:** run `npx prisma migrate status` on production **read-only** session when authorized; must show **no pending** migrations relative to release SHA.

---

## Step 4 — Production preflight specification

**Status:** `NOT_EXECUTED` (no production SSH/DB in PR9A).

| # | Read-only check | Method (when authorized) |
|---|-----------------|--------------------------|
| 1 | Deployed release SHA | `/opt/synqdrive/current` git SHA vs `RELEASE_CANDIDATE_SHA` |
| 2 | PM2 process health | `pm2 ls` — replicas A/B healthy |
| 3 | Backend ports | `3001`, `3002` listening / health `https://app.synqdrive.eu/api/v1/health` |
| 4 | Scheduler leader | Exactly **one** LEADER per DSRG evidence; verify scheduler env on both replicas |
| 5 | Migration status | `prisma migrate status` (read-only DB creds) |
| 6 | Feature flags per replica | `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED`, `VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE` — must match on **both** before/after cutover |
| 7 | Registry outbox | `SELECT status, count(*) FROM vehicle_registry_lifecycle_outbox GROUP BY 1` — no stuck exponential growth |
| 8 | Billing processor | Outbox consumer lag / error fields `last_error` on `vehicle_registry_lifecycle_outbox` |

Reference: [`architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md`](../../dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md).

---

## Step 5 — Legacy fleet inventory

**Executable queries:** [`V2B_PR9A_LEGACY_FLEET_INVENTORY_QUERIES.sql`](./V2B_PR9A_LEGACY_FLEET_INVENTORY_QUERIES.sql)  
**Execution:** `NOT_EXECUTED` until owner authorizes read-only production (or staging) DB session.

**Cohort summary (classification labels in SQL comments):**

| Cohort | Typical classification |
|--------|------------------------|
| DIMO canonical | `SAFE` / `REQUIRES_ENRICHMENT` if identity gaps |
| HM canonical (completed VO case) | `SAFE` |
| HM legacy inline | `REQUIRES_RECONCILIATION` if no outbox / no case |
| Missing model/year | `REQUIRES_ENRICHMENT` |
| Missing / inconsistent provider links | `REQUIRES_RECONCILIATION` |
| Missing `connectionIdentity` | `REQUIRES_ENRICHMENT` |
| Duplicate VIN/org candidates | `BLOCKS_CUTOVER` until owner review |
| Registry lifecycle inconsistent | `REQUIRES_RECONCILIATION` |
| Billing reconciliation (no `VEHICLE_ACTIVATED` for HM legacy) | `REQUIRES_RECONCILIATION` — **not** auto backfill (OWN-4) |

---

## Step 6 — Direct cutover runbook (PR9C execution contract)

**Target env values (documentation only — do not set in PR9A):**

| Variable | Target after authorized cutover |
|----------|--------------------------------|
| `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` | `true` |
| `VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE` | `false` |
| `VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` | `false` (not armable) |

**Ordered procedure:**

1. Complete PR9A preflight + inventory evidence (or documented waive).
2. Obtain **PR9B** explicit owner deploy + production activation authorization.
3. **Stop** new HM registration admission (ops banner / feature gate at LB if available).
4. Drain in-flight HM registration requests (queue empty / no open activation TX).
5. Deploy `RELEASE_CANDIDATE_SHA` if production SHA differs (owner deploy runbook).
6. Set `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED=true` on **both** replicas; restart if required for env pickup.
7. Verify health on `3001`/`3002`; confirm **no** replica still `false`.
8. Resume HM registration admission.
9. Execute **PR9C** smoke contract (authorized vehicles only).

**Mixed routing prevention:** steps 3–4 and 6–7 must complete before admission resumes.

---

## Step 7 — Production smoke contract (PR9C)

**Status:** `NOT_EXECUTED`. No fictitious billable vehicles. Real provider registration only with explicit authorization.

| # | Check |
|---|--------|
| 1 | HM canonical registration happy path (authorized org/vehicle) |
| 2 | DIMO `register-from-dimo` regression (no convergence regression) |
| 3 | Existing vehicle detail + edit (non-registration) |
| 4 | Cross-tenant denial (negative) |
| 5 | Single `VEHICLE_ACTIVATED` outbox per activation |
| 6 | Billing idempotency key unique per case |
| 7 | Both replicas healthy post-cutover |
| 8 | Scheduler leader unchanged / healthy |

**Abort / rollback triggers:** registration errors, duplicate `vehicle.id`, duplicate billing quantity, replica flag mismatch, elevated outbox `FAILED` rate.

---

## Step 8 — Rollback contract (routing only)

1. Stop new HM registrations.  
2. Drain in-flight ops.  
3. Set `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED=false` on **all** replicas.  
4. Verify replicas + health.  
5. Preserve vehicles, cases, outbox, billing ledger — **no** destructive rollback.  
6. Reconcile partial cases per VO-3.  
7. Resume legacy HM routing; document incident.

---

## Step 9 — Release authorization package

| Gate | Status @ PR9A |
|------|----------------|
| **REPOSITORY_READINESS** | **YES** — V2B-PR1–8 merged; PG 60/60; OWN policies recorded |
| **PRODUCTION_PREFLIGHT_READINESS** | **NOT_EXECUTED** — spec only |
| **LEGACY_INVENTORY_READINESS** | **NOT_EXECUTED** — SQL spec ready |
| **PRODUCTION_ACTIVATION_READINESS** | **NO** — requires PR9B + PR9C |

| Field | Value |
|-------|-------|
| `PRODUCTION_ACCESS_AUTHORIZED` | **NO** |
| `PRODUCTION_ACTIVATION_AUTHORIZED` | **NO** |
| `RELEASE_AUTHORIZATION_READY` | **NO** — pending PR9B |
| `DEPLOYED` | **NO** |
| `FLAGS_ARMED` | **NO** |

**Next phases:** **PR9B** owner release authorization · **PR9C** cutover + smoke attestation · **PR10** post-cutover helper cleanup (optional).

**Policy links:** [V2B_PR8_DIRECT_CUTOVER_POLICY_2026-11-24.md](./V2B_PR8_DIRECT_CUTOVER_POLICY_2026-11-24.md) · [V2B_PR8_OWNER_ATTESTATION_2026-11-24.md](./V2B_PR8_OWNER_ATTESTATION_2026-11-24.md)