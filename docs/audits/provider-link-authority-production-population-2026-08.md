# Provider Link Authority — Production Population & Creation-Pipeline Audit

| Field | Value |
|-------|-------|
| **Audit ID** | `provider-link-authority-production-population-2026-08` |
| **Mode** | Production read-only |
| **Production modified** | **No** |
| **Investigation time (UTC)** | `2026-08-25T14:46Z` |
| **Related** | `hmue-c215-operational-state-forensic-2026-08.md` |

---

## A. Executive Summary

HMÜ C 215 shows `providerLinkState = UNKNOWN` despite active DIMO consent, org authorization, token, CONNECTED status, and fresh telemetry — **not** because of a per-vehicle data deletion, but because **no DIMO vehicle in Production has ever received a `VehicleDataSourceLink` row**.

The table was introduced for **High Mobility** bindings. DIMO registration (`registerFromDimo`) sets `Vehicle.dimoVehicleId` only and **never creates** `VehicleDataSourceLink`. `ProviderLinkStateBuilder` requires `hasActiveMapping` for `ACTIVE`, so all DIMO-only vehicles fall through to `UNKNOWN`, which outranks `STANDBY` in overall synthesis → P0.2 `operationalAvailability = UNKNOWN`.

**Production population (single org, 6 DIMO vehicles):**

| Metric | Count |
|--------|-------|
| DIMO vehicles | 6 |
| Active DIMO `VehicleDataSourceLink` | **0** |
| Recent telemetry + missing DIMO link (Group B) | **3 (50%)** |
| Offline + missing DIMO link (Group D) | **3 (50%)** |

**Verdict:** Architecture gap — **SYSTEMIC for DIMO linkage model**, small absolute fleet. Fix requires **COMBINATION** (pipeline + backfill + optional builder alignment).

---

## B. Provider Link Contract

### Vocabulary (`ProviderLinkState`)

| State | Meaning | Required evidence | Operator meaning |
|-------|---------|-------------------|------------------|
| `ACTIVE` | Full configured provider chain | Active mapping + ACTIVE consent + token + ACTIVE authorization | Provider link is configured and authorized |
| `REAUTH_REQUIRED` | Grant chain broken | Missing/expired consent or authorization, or mapping without token | Re-authorize provider access |
| `REVOKED` | Explicit revocation | Consent or org authorization revoked | Provider access withdrawn |
| `NO_LINK` | No provider identity | No mapping, no token, no historical DimoVehicle | Vehicle not linked to any provider |
| `ERROR` | Integration/tenant error | Cross-tenant mapping or provider ERROR status | Integration misconfiguration |
| `UNKNOWN` | Identity exists but chain incomplete | Historical identity and/or partial grants without full ACTIVE chain | Provider linkage indeterminate |

**Canonical builder:** `ProviderLinkStateBuilder.build()` — `backend/src/modules/vehicles/connectivity/domain/provider-link-state.builder.ts`

**Evidence assembler:** `assembleProviderLinkEvidence()` — `provider-link-evidence.assembler.ts`

Telemetry recency is **explicitly excluded** from provider link state.

---

## C. VehicleDataSourceLink Authority

### Schema (`vehicle_data_source_links`)

| Field | Role |
|-------|------|
| `id` | Binding UUID (also `providerBindingId` on snapshots) |
| `vehicleId` | FK → Vehicle |
| `provider` | `DIMO` \| `HIGH_MOBILITY` \| … |
| `sourceType` / `sourceSubtype` | Provider channel discriminator |
| `sourceReferenceId` | Provider-side record id |
| `consentId` | FK to consent that authorized binding |
| `isActive` | Active flag |
| `activatedAt` / `deactivatedAt` | Lifecycle |
| `linkedByUserId` / `lastVerifiedAt` | Provenance |

**Unique constraint:** `(vehicleId, sourceType, sourceSubtype, isActive)` — one active row per type/subtype.

### Classification

| Input | Role |
|-------|------|
| `VehicleDataSourceLink` (active) | **HARD_AUTHORITY** for `ProviderLinkState.ACTIVE` (`fullyActive` requires `hasActiveMapping`) |
| `Vehicle.dimoVehicleId` + `DimoVehicle` | **LEGACY** canonical DIMO mapping (used everywhere except provider-link ACTIVE gate) |
| `ProviderConsent` | **HARD_AUTHORITY** for consent dimension (permission, not per-vehicle mapping) |
| `OrgDataAuthorization` | **HARD_AUTHORITY** for org-level DIMO authorization (permission-only; `vehicleIds` JSON optional) |
| `DimoVehicle.tokenId` | **SUPPORTING_EVIDENCE** for token binding |
| Latest telemetry | **DIAGNOSTIC_ONLY** (telemetry dimension separate) |

**Answer:** `VehicleDataSourceLink` is intended as **canonical provider binding** per schema comments, but for DIMO it was **never wired into the registration pipeline**. DIMO vehicles use **`Vehicle.dimoVehicleId` as the de-facto mapping**, creating a **dual-authority gap**.

---

## D. Creation Pipeline

### Code paths that CREATE `VehicleDataSourceLink`

| Path | File | Trigger | Provider |
|------|------|---------|----------|
| HM Health link | `high-mobility-vehicle-link.service.ts` → `activateHealthLink()` | Admin HM activation | HIGH_MOBILITY |
| HM Full Telemetry link | `high-mobility-vehicle-link.service.ts` → `linkFullTelemetry()` | Admin HM telemetry link | HIGH_MOBILITY |
| HM-only registration | `high-mobility-registration.service.ts` | `registerHmOnlyVehicle()` | HIGH_MOBILITY |

**DIMO paths audited (no create found):**

- `VehiclesService.registerFromDimo()` — connects `dimoVehicle` FK only
- `DimoVehicleSyncService` / snapshot schedulers — sync identity, no link row
- Device-connection webhooks — episodes/events, no link row
- Consent flows — grant permission, no link row

**Conclusion:** **No DIMO creation path exists.** New DIMO onboarding **will reproduce** missing links.

---

## E. Deactivation Pipeline

| Path | File | Action |
|------|------|--------|
| HM Health deactivate | `high-mobility-vehicle-link.service.ts` → `deactivateHealthLink()` | `isActive: false`, `deactivatedAt` |
| HM fleet cleanup | `high-mobility-fleet.service.ts` | `deleteMany` on links |

No DIMO-specific deactivation path found (because no DIMO links exist).

---

## F. Reconciliation / Self-Heal

**Self-healing job for missing DIMO `VehicleDataSourceLink`:** **NO**

Existing reconciliation covers **device-connection episodes/events** only (`device-connection-episode-reconciliation`, webhook inbox scheduler). None materialize provider binding rows.

**Architecture gap:** No process detects `dimoVehicleId present + telemetry flowing + missing VehicleDataSourceLink`.

---

## G. HMÜ C 215 History

| Evidence | Value |
|----------|-------|
| `dimoVehicleId` | present |
| `VehicleDataSourceLink` history | **empty (never created)** |
| Consent | ACTIVE |
| Org DIMO auth | ACTIVE |
| Latest telemetry | `2026-08-25T12:46:00Z` (standby) |
| `obdIsPluggedIn` | true |

**Root-cause history:** **A — never got a link** (not deleted/deactivated). **LEGACY_LINKAGE_NOT_MIGRATED** — DIMO path predates/normalizes via `dimoVehicleId` only.

---

## H. Production Population Matrix

**Scope:** All Production vehicles with `dimoVehicleId != null` (6 vehicles, 1 org).

| Group | Description | Count |
|-------|-------------|-------|
| **A** | Recent telemetry + active DIMO link | **0** |
| **B** | Recent telemetry + NO active DIMO link | **3** |
| **C** | No recent telemetry + connected/auth + active DIMO link | **0** |
| **D** | No recent telemetry + connected/auth + NO DIMO link | **3** |
| **E** | Active DIMO link + no dimoVehicleId | **0** |
| **F** | Duplicate active DIMO links | **0** |
| **G** | Inactive link + current telemetry (no active DIMO link) | **0** |

**Total `VehicleDataSourceLink` rows:** 1 (HIGH_MOBILITY only, KS MX 2024).

**Group B vehicles (recent telemetry, no DIMO link):** HMÜ C 215, KS MS 661, KS MX 2024*

\*KS MX 2024 has active **HM** link, not DIMO.

### Representative matrix

| Vehicle | Business | DIMO relation | Consent | Auth | Telemetry | Freshness | DIMO link | Expected providerLink |
|---------|----------|---------------|---------|------|-----------|-----------|-----------|----------------------|
| HMÜ C 215 | AVAILABLE | yes | ACTIVE | ACTIVE | 2026-08-25T12:46Z | standby | **0** | UNKNOWN |
| KS MS 661 | AVAILABLE | yes | inactive | ACTIVE | 2026-08-25T14:07Z | standby | **0** | UNKNOWN/REAUTH |
| WOB L 7503 | AVAILABLE | yes | ACTIVE | ACTIVE | 2026-07-23 | offline | **0** | UNKNOWN |
| WOB L 9755 | AVAILABLE | yes | ACTIVE | ACTIVE | 2026-07-18 | offline | **0** | UNKNOWN |

---

## I. Legacy Parallel Linkage

| Mechanism | Status for DIMO |
|-----------|-----------------|
| `Vehicle.dimoVehicleId` → `DimoVehicle` | **Active canonical DIMO mapping** (registration, snapshots, webhooks) |
| `VehicleDataSourceLink` | **Required by P0.1 ACTIVE gate but never populated for DIMO** |
| `OrgDataAuthorization` | Org permission scope; does not prove vehicle mapping |
| `ProviderConsent` | Grant ledger; org/vehicle permission, not binding row |
| `providerBindingId` on snapshot | References link id when set; HMÜ = null |

---

## J. Authorization Relationship

- **OrgDataAuthorization:** permission-only (org can use DIMO integration). Optional `vehicleIds` JSON — not used as mapping source in `ProviderLinkStateBuilder`.
- **ProviderConsent:** ACTIVE on HMÜ — proves grant, not `VehicleDataSourceLink`.
- **DimoVehicle relation:** proves which DIMO identity is bound to Vehicle — **functional mapping** ignored by ACTIVE gate.

---

## K. Runtime Inference Assessment

Current case: fresh telemetry + active grants + **no link** → `UNKNOWN`.

**Is UNKNOWN correct?** Per current builder rules: **yes**. Per operator semantics with working DIMO telemetry: **no — too strict**.

**ACTIVE_INFERRED:** Not recommended as a single merged field — risks conflating configuration authority with runtime activity.

**Cleaner architecture:** separate dimensions:

- `configuredProviderLinkState` (mapping + grants)
- `observedProviderActivityState` (telemetry arriving from known provider identity)

For DIMO, simplest fix: treat `Vehicle.dimoVehicleId` + ACTIVE consent/auth as satisfying `hasActiveMapping` **or** materialize link rows on registration.

**Tenant safety:** DIMO attribution is secure via `Vehicle.dimoVehicleId` FK + org scoping — inference from telemetry alone would **not** be safe without that FK.

---

## L. Observability Gap

No alert found for: **telemetry observed + missing VehicleDataSourceLink**.

Metrics exist for `providerLinkState` distribution (`connectivity-observability.service.ts`) but no missing-mapping detector.

---

## M. Migrations

- `20260408120000_high_mobility_phase1` — **creates** `vehicle_data_source_links` for HM
- `20260412040000_audit_consent_provenance` — extends links with provider/consent fields
- **No migration backfills DIMO vehicles into `vehicle_data_source_links`**

**Historical migration for DIMO:** **NO**

---

## N. Root Cause & Severity

**HMÜ primary root cause:** `LEGACY_LINKAGE_NOT_MIGRATED` + `PROVIDER_LINK_BUILDER_TOO_STRICT` (for DIMO dual-authority)

**Systemic severity:** **SYSTEMIC** for DIMO model (100% of 6 DIMO vehicles lack DIMO link rows). Small absolute population (1 org, 6 vehicles).

---

## O. Fix Options & Recommendation

| Option | Assessment |
|--------|------------|
| **A — Backfill** | Required for existing 6 DIMO vehicles |
| **B — Pipeline fix** | **Required** — `registerFromDimo` must create DIMO `VehicleDataSourceLink` |
| **C — Reconciliation** | Recommended safety net for drift detection |
| **D — Inference only** | Insufficient alone — masks data gap |
| **E — Combination** | **RECOMMENDED** |

**Recommended strategy:** **COMBINATION (B + A + C)**

1. Create DIMO link on `registerFromDimo` (permanent pipeline fix)
2. One-time backfill from `Vehicle.dimoVehicleId` where consent/auth active
3. Optional reconciliation job: flag `dimoVehicleId + telemetry + no link`
4. **Do not** weaken ACTIVE gate without mapping authority

`configuredProviderLinkState` split is optional future refinement.

---

## P. Expected State After Correction

### HMÜ C 215 (in-memory builder)

| Field | After valid DIMO link |
|-------|----------------------|
| providerLinkState | ACTIVE |
| telemetryState | standby |
| physicalDeviceState | PLUGGED_INFERRED |
| overallState | **STANDBY** |
| businessState | AVAILABLE |
| operationalAvailability | **AVAILABLE** |

### WOB L 7503 / WOB L 9755 (regression)

| Field | With provider ACTIVE + offline telemetry |
|-------|----------------------------------------|
| providerLinkState | ACTIVE (if link backfilled) |
| telemetryState | offline |
| overallState | OFFLINE |
| operationalAvailability | **NEEDS_VERIFICATION** (telemetry offline gate fires before overallState) |

**Regression safe:** provider-link fix does **not** create false AVAILABLE for long-offline vehicles.

---

**PR #1277:** HOLD (unchanged)

---

## R. Implementation Gate (2026-08-25)

**Branch:** `fix/dimo-provider-link-normalization-2026-08`  
**Mode:** Implementation + dry-run + shadow verification — **no Production writes**

### A. Canonical DIMO link contract

| Field | Value |
|-------|-------|
| `provider` | `DIMO` |
| `sourceType` | `DIMO` |
| `sourceSubtype` | `null` (canonical single DIMO telemetry channel) |
| `sourceReferenceId` | Internal `DimoVehicle.id` (= `Vehicle.dimoVehicleId`). **Not** external DIMO vehicle ID/token — see `metadata.dimoExternalId`. |
| `consentId` | Latest ACTIVE consent if present; else latest consent for provenance; nullable at registration |
| `isActive` | `true` |
| `activatedAt` / `lastVerifiedAt` | Set on create/reactivate/verify |
| `linkedByUserId` | Registration actor when available |
| `metadata` | `{ version, provenance, runId, dimoExternalId }` |

**Authority:** `Vehicle.dimoVehicleId` → `DimoVehicle` is the deterministic, tenant-safe, idempotent upsert key. Telemetry payloads are never used for identity.

### B. Registration pipeline fix

`VehiclesService.registerFromDimo()` now calls `DimoVehicleDataSourceLinkService.ensureDimoVehicleDataSourceLinkOrThrow()` **inside** the registration transaction immediately after `Vehicle.create`. Future DIMO registrations cannot succeed without a canonical link row.

**Service:** `backend/src/modules/dimo/dimo-vehicle-data-source-link.service.ts`

### C. Failure / retry semantics

- `CONFLICT` → `ConflictException` (`DIMO_PROVIDER_LINK_CONFLICT`) rolls back the registration transaction
- Idempotent `NOOP` on retry
- Structured logs via `ConnectivityObservabilityService.log('binding_changed', …)` — no tokens/VIN/location

### D. Backfill design

**Script:** `backend/scripts/ops/backfill-dimo-vehicle-data-source-links.ts`  
**Default:** `--dry-run` (writes require explicit `--apply`)  
**Eligibility:** `Vehicle.dimoVehicleId != null` + valid `DimoVehicle` relation + tenant consistency  
**Inactive consent:** Link row still created (mapping normalization); `ProviderLinkStateBuilder` resolves grant health separately (`REAUTH_REQUIRED` / `REVOKED` as appropriate)

### E. Reconciliation policy

`DimoVehicleDataSourceLinkService.auditProviderLinkDrift()` detects `dimoVehicleId` + valid relation + missing active DIMO link.  
**Self-heal:** `reconcileSafeDrift({ apply: true })` only for deterministic `missing_link` cases (CREATE). Ambiguous/conflict → flag only, never guess.

### F. Rollback design

Backfill/reconciliation writes `metadata.provenance` + `metadata.runId`. Rollback = deactivate links where `metadata.runId = <run>` and `metadata.provenance in ('backfill','reconciliation')`. No broad deletes.

### G. Pre-apply Production gate

Before `--apply`: deploy pipeline fix → DB backup → dry-run stable ×2 → zero conflicts → HMÜ/WOB shadow confirmed → rollback runId prepared → CI green.

### H. Data migration strategy

**Ops script (not Prisma migration)** — row-level provenance, live consent resolution, per-vehicle audit, rollback by runId.

---

## Q. Next Implementation Gate

1. ~~Add DIMO link creation to `registerFromDimo` (+ tests)~~ **DONE**
2. ~~Backfill script for existing DIMO vehicles (org-scoped, idempotent)~~ **DONE (dry-run)**
3. ~~Verify HMÜ → AVAILABLE operational path in shadow read-only~~ **DONE (fixture + shadow)**
4. ~~Re-run WOB regression in shadow~~ **DONE**
5. ~~Observability for binding_changed~~ **DONE**

**Production `--apply`:** **DO NOT EXECUTE** without explicit approval.

**PR #1277:** HOLD (unchanged)

---

## S. Final Hardening Gate (2026-08-25)

**Branch:** `fix/dimo-provider-link-normalization-2026-08`  
**Mode:** Hardening + tests + read-only Production dry-runs — **no Production writes**

### 1. Production shadow authority

Shadow path now invokes `VehicleOperationalProjectionService.projectWithConnectivityOverride()` with:

- Real persisted `vehicle.status`
- `deriveFleetBusinessContextBatch()` for booking/episode business context
- `RentalHealthSummaryService` for health evaluability
- `resolveEpisodeEvidenceReliability()` from lifecycle policy
- Connectivity simulated only via `assembleVehicleConnectivityRuntimeBundle()` with planned active DIMO link

**Removed:** hardcoded `vehicleStatus: 'AVAILABLE'` and `episodeEvidenceReliable: false`.

### 2. REACTIVATE safety

| Scenario | Action |
|----------|--------|
| Backfill / reconciliation + inactive historical link | `CONFLICT` — `inactive_link_requires_manual_review` |
| `metadata.intentionalDeactivation` | `CONFLICT` |
| `metadata.deactivationReason` | `CONFLICT` |
| Registration + `metadata.reactivationEligible === true` | `REACTIVATE` |
| Registration without positive provenance | `CONFLICT` |

`reconcileSafeDrift()` applies **CREATE only** — never reactivates.

### 3. Complete test matrix

| Suite | Cases |
|-------|-------|
| Link ensure | L1–L10 |
| Backfill | B1–B8 |
| Reconciliation | R1–R5 |
| Operational regression | O1–O5 |

### 4. Canonical `sourceReferenceId`

`VehicleDataSourceLink.sourceReferenceId` for DIMO = internal `DimoVehicle.id`. External DIMO identity stored in `metadata.dimoExternalId`.

### 5. Mapping vs auth separation

Provider link row existence ≠ healthy provider authorization. KS MS 661 may have structurally correct mapping while `ProviderLinkState` remains `REVOKED` / `REAUTH_REQUIRED`.

### 6. Production dry-run results (read-only, 2026-08-25 UTC)

**Org:** `faa710c9-6d91-4079-a7d5-91fdccdec14a`  
**Command:** `backfill-dimo-vehicle-data-source-links.ts --org=<org> --shadow` (no `--apply`)  
**Branch:** `fix/dimo-provider-link-normalization-2026-08` @ `58a39e6a`

| Run | scanned | CREATE | REACTIVATE | CONFLICT | applied | Deterministic |
|-----|---------|--------|------------|----------|---------|---------------|
| #1 | 6 | 6 | 0 | 0 | 0 | — |
| #2 | 6 | 6 | 0 | 0 | 0 | SHA256 match with #1 |

| Vehicle | Action | Consent | Current link | Current op.avail | Expected link | Expected op.avail |
|---------|--------|---------|--------------|------------------|---------------|-------------------|
| HMÜ C 215 | CREATE | ACTIVE | UNKNOWN | UNKNOWN | ACTIVE | **AVAILABLE** |
| WOB L 7503 | CREATE | ACTIVE | UNKNOWN | NEEDS_VERIFICATION | ACTIVE | NEEDS_VERIFICATION |
| WOB L 9755 | CREATE | ACTIVE | UNKNOWN | NEEDS_VERIFICATION | ACTIVE | NEEDS_VERIFICATION |
| KS MS 661 | CREATE | MISSING | UNKNOWN | UNKNOWN | **REAUTH_REQUIRED** | NEEDS_VERIFICATION |

Shadow uses real `vehicle.status` + fleet business context — WOB vehicles retain NEEDS_VERIFICATION; KS MS 661 does not falsely become ACTIVE provider auth.

---

## T. Production Deployment + Pre-Apply Gate (2026-08-25)

**Deployed SHA:** `79bb49a075b2153d53398b567e94d80f4d2f7088` (PR #1281 merge)  
**Release:** `20260825161414_v4994`  
**Pre-deploy SHA:** `2fef253302d71f4cd48be1f7be5f6f8a766d16c5`  
**Mode:** Normal VPS deploy + read-only verification — **no backfill `--apply`**

### Service health

| Check | Result |
|-------|--------|
| API `/api/v1/health` | `ok` |
| PM2 `synqdrive` | online (no crash loop post-deploy) |
| Redis | `PONG` |
| Prisma migrate / boot check | PASS (deploy script) |
| DimoModule / DI graph | PASS (boot check OK) |

### DIMO link counts

| When | Active DIMO `VehicleDataSourceLink` |
|------|-------------------------------------|
| Pre-deploy | **0** |
| Post-deploy | **0** |
| Deployment auto-created links | **NO** |

DIMO vehicles in org: **6**

### Registration pipeline (deployed code)

`VehiclesService.registerFromDimo()` → `ensureDimoVehicleDataSourceLinkOrThrow()` inside registration transaction (line 2306 in deployed `vehicles.service.ts`).

### Dry-runs (post-deploy, `--shadow`, no `--apply`)

| | #1 | #2 |
|---|----|----|
| scanned | 6 | 6 |
| CREATE | 6 | 6 |
| NOOP | 0 | 0 |
| REACTIVATE | 0 | 0 |
| CONFLICT | 0 | 0 |
| SKIP | 0 | 0 |
| applied | 0 | 0 |

**Planned mutation set:** deterministic (identical actions and shadow predictions; only `runId`/timestamp differ).

### Reference vehicle shadow

| Vehicle | Current → Predicted `providerLinkState` | Current → Predicted `operationalAvailability` | Invariant |
|---------|----------------------------------------|-----------------------------------------------|-----------|
| HMÜ C 215 | UNKNOWN → ACTIVE | UNKNOWN → **AVAILABLE** | PASS |
| WOB L 7503 | UNKNOWN → ACTIVE | NEEDS_VERIFICATION → **NEEDS_VERIFICATION** | PASS |
| WOB L 9755 | UNKNOWN → ACTIVE | NEEDS_VERIFICATION → **NEEDS_VERIFICATION** | PASS |
| KS MS 661 | UNKNOWN → **REAUTH_REQUIRED** | UNKNOWN → NEEDS_VERIFICATION | PASS (not falsely ACTIVE) |

**Health evaluability:** unchanged pre/post deploy for all four reference vehicles.

### Backup / rollback readiness

| Item | Status |
|------|--------|
| Pre-deploy DB backup | `db-pre-deploy-20260825161414.sql.gz` (2026-08-25 16:14 UTC) |
| Backup mechanism | `vps-deploy-release.sh` → `pg_dump` to `/opt/synqdrive/shared/backups/` |
| Rollback by `metadata.runId` + `metadata.provenance` | Schema supports `metadata` jsonb; deactivate-only rollback documented in PR #1281 |
| Proposed future runId | `dimo-link-backfill-prod-2026-08-25-79bb49a` |

### Apply safety

- Default: dry-run (no `--apply`)
- `--shadow`: still dry-run
- `--apply`: explicit write only
- Partial failure: **per-row** (not whole-run transactional); `metadata.runId` identifies created rows
- Idempotency: second apply → NOOP (unit tests B5 + reconcile R5)

### Gates (separate)

| Gate | Status |
|------|--------|
| **DIMO Provider-Link Pre-Apply** | **GO** |
| Production Connectivity Processing Gate | **CONDITIONAL** (unchanged; post-cutover unplug test not performed) |
| PR #1277 | **HOLD** |

**Production backfill `--apply`:** **DO NOT EXECUTE** until explicit approval with proposed runId.

---

## U. Controlled Production Backfill Apply + Acceptance (2026-08-25)

**Deployed SHA:** `79bb49a075b2153d53398b567e94d80f4d2f7088`  
**runId (approved):** `dimo-link-backfill-prod-2026-08-25-79bb49a`  
**Mode:** backup → final dry-run → `--apply` attempt → **STOP on failure**

### A. Pre-apply backup

| Field | Value |
|-------|-------|
| Identifier | `/opt/synqdrive/shared/backups/postgresql/daily/synqdrive-daily-20260825T164532Z.dump.gpg` |
| Timestamp UTC | 2026-08-25T16:45:58Z |
| Status | **SUCCESS** |
| Database | `synqdrive` (production VPS) |

### B–E. Final dry-run + frozen plan

| Field | Value |
|-------|-------|
| scanned | 6 |
| CREATE | 6 |
| REACTIVATE | 0 |
| CONFLICT | 0 |
| SKIP | 0 |
| applied | 0 |
| Frozen plan hash | `683fd1c72dafff73d175dd62c744b14b224f3e37d7cbfb4254007fe52a42978a` |

Shadow predictions matched Pre-Apply Gate (HMÜ → AVAILABLE; WOB → NEEDS_VERIFICATION; KS → REAUTH_REQUIRED).

### F. Apply result — **FAILED**

```
PrismaClientKnownRequestError P2003
Foreign key constraint violated: vehicle_data_source_links_source_reference_id_fkey
```

Apply aborted on first `CREATE`. **No rows committed.**

| Field | Value |
|-------|-------|
| scanned | (not completed) |
| CREATE planned | 6 |
| applied | **0** |
| failures | 1 (FK on first insert) |

### G. Actual DIMO links created

**0** (verified post-failure)

### Root cause (schema blocker)

Production FK on `vehicle_data_source_links.source_reference_id`:

```sql
FOREIGN KEY (source_reference_id) REFERENCES high_mobility_vehicles(id)
```

PR #1281 writes `sourceReferenceId = DimoVehicle.id`, which is **not** present in `high_mobility_vehicles`. Dry-runs passed because they never execute `INSERT`. `registerFromDimo()` link creation would also fail in Production until schema is extended (e.g. optional `DimoVehicle` FK or provider-specific FK relaxation).

### H–O. Post-apply verification

**Not executed** — apply did not succeed. Pre-failure state unchanged:

- active DIMO links: 0
- HMÜ/WOB/KS live P0.1/P0.2: unchanged (providerLinkState UNKNOWN for HMÜ)
- Fleet DTO: unchanged
- unrelated mutations: **NONE**

### P. Rollback required

**NO** — zero rows created.

### Q. Remaining issues

1. **Schema migration required** before any Production DIMO link INSERT
2. Integration test gap: unit tests mock Prisma and did not surface DB FK
3. Pre-Apply Gate dry-run cannot catch write-time FK failures

### R. Final verdict

| Gate | Result |
|------|--------|
| **DIMO PROVIDER-LINK PRODUCTION BACKFILL** | **FAIL** |
| **PRODUCTION BACKFILL PRE-APPLY GATE (post-apply)** | **NO-GO** |
| HMÜ C 215 OPERATIONAL STATE | **FAIL** (links not created) |
| WOB OFFLINE REGRESSION | **N/A** (apply blocked) |
| KS AUTH-SEPARATION | **N/A** (apply blocked) |
| P0.3 LIVE ACCEPTANCE | **N/A** |
| PR #1277 | **HOLD** (upstream blocker **not** cleared) |
| Production Connectivity Processing Gate | **CONDITIONAL** |
