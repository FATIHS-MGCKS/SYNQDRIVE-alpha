# DIMO Per-Vehicle Consent Ledger Backfill — Phase 1 (Read-Only + Dry-Run)

| Field | Value |
|-------|-------|
| **Audit ID** | `dimo-vehicle-provider-consent-backfill-phase1-2026-08` |
| **Mode** | Production read-only + dry-run mutation plan |
| **Production modified** | **NO** |
| **Investigation time (UTC)** | `2026-08-26T14:05–14:33Z` |
| **Main SHA (workspace)** | `75579f1373171807ce9132158a9fcb29cfb40307` |
| **Production release** | `20260826132257_v4994` |
| **Organization** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |

---

## Executive Summary

Three KS vehicles have active DIMO `VehicleDataSourceLink` rows, live DIMO telemetry, and ACTIVE org-level DIMO authorization, but **zero** `vehicle_provider_consents` rows. Canonical `ProviderLinkStateBuilder` correctly resolves `REAUTH_REQUIRED` / `CONSENT_MISSING`.

Phase 1 dry-run plans **exactly 3 CREATE** consent operations and **3 WIRE_CONSENT_ID** link updates for the KS trio only. HMÜ C 215 and both WOB vehicles are **NOOP** when included in scope.

**CONSENT LEDGER DRY-RUN: PASS**  
**APPLY READY: YES** (await explicit operator approval)  
**PRODUCTION MUTATIONS: NONE**

---

## A. Canonical Consent Contract

**Creation path:** `VehiclesService.registerFromDimo()` → fire-and-forget `VehicleProviderConsentService.recordDimoConsent()`  
**Link wiring:** `DimoVehicleDataSourceLinkService.resolveConsentProvenance()` + `ensureDimoVehicleDataSourceLink()` (not automatic from `recordDimoConsent`)

| # | Question | Answer |
|---|----------|--------|
| 1 | Mandatory fields | `vehicleId`, `organizationId`, `provider='DIMO'`, `grantType=DIMO_DIRECT`, `status=ACTIVE`, `scopes[]` |
| 2 | Derived vs supplied | **Supplied:** vehicleId, organizationId, dimoTokenId, dimoExternalId, optional scopes/metadata. **Derived in service:** provider, grantType, status, default scopes |
| 3 | Canonical scopes | `['telemetry','location','dtc','snapshot']` |
| 4 | `providerVehicleRef` | `dimoExternalId ?? String(dimoTokenId)` |
| 5 | `metadataJson.dimoTokenId` | DIMO token id integer from `DimoVehicle.tokenId` |
| 6 | `organizationId` | Target vehicle's org (`faa710c9-…`) |
| 7 | `vehicleId` | Target vehicle UUID |
| 8 | Provider | `'DIMO'` |
| 9 | Status | `ACTIVE` |
| 10 | `grantedAt` | DB default `now()` at insert; backfill uses **`Vehicle.createdAt`** (matches HMÜ/WOB registration pattern) |
| 11 | `expiresAt` | `null` (no expiry on reference rows) |
| 12 | `revokedAt` | `null` |
| 13 | Unique constraint | **None** at DB level — idempotency via application lookup for existing ACTIVE consent per vehicle+provider |
| 14 | `VehicleDataSourceLink.consentId` | **Optional** but strongly recommended; HMÜ/WOB wired post-backfill |
| 15 | Auto-bind from `recordDimoConsent`? | **NO** |
| 16 | Canonical wiring path | `DimoVehicleDataSourceLinkService.ensureDimoVehicleDataSourceLink()` / backfill ops update `consentId` after consent exists |

---

## B. Production Matrix (6 DIMO vehicles)

| Vehicle | Consent | Link.consentId | providerLinkState | P0.2 op.avail | Classification |
|---------|---------|----------------|-------------------|---------------|----------------|
| HMÜ C 215 | ACTIVE | wired | ACTIVE | AVAILABLE | healthy reference |
| WOB L 7503 | ACTIVE | wired | ACTIVE | NEEDS_VERIFICATION (offline) | healthy |
| WOB L 9755 | ACTIVE | wired | ACTIVE | NEEDS_VERIFICATION (offline) | healthy |
| KS FH 660E | **MISSING** | null | REAUTH_REQUIRED | NEEDS_VERIFICATION | missing consent |
| KS MS 661 | **MISSING** | null | REAUTH_REQUIRED | NEEDS_VERIFICATION | missing consent |
| KS MX 2024 | **MISSING** | null | REAUTH_REQUIRED | NEEDS_VERIFICATION | missing consent |

Classification matches expected pattern exactly.

---

## C. Dry-Run Mutation Plan

**runId:** `dimo-consent-backfill-prod-2026-08-26-phase1`

### KS FH 660E

| Field | Value |
|-------|-------|
| vehicleId | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| providerVehicleRef | `186946` |
| dimoTokenId | `186946` |
| grantedAt | `2026-04-04T20:25:46.868Z` (vehicle.createdAt) |
| link update | `805b271c-ba87-4776-9e39-23e24d595c53` null → new consent id |

### KS MS 661

| Field | Value |
|-------|-------|
| vehicleId | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| providerVehicleRef | `187361` |
| dimoTokenId | `187361` |
| grantedAt | `2026-04-04T22:22:06.648Z` |
| link update | `71b75519-3053-4836-8bcd-554680d592b2` |

### KS MX 2024

| Field | Value |
|-------|-------|
| vehicleId | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| providerVehicleRef | `187336` |
| dimoTokenId | `187336` |
| grantedAt | `2026-04-04T19:38:12.297Z` |
| link update | `e2bd6a49-f1fc-4d4f-bd60-e958b15d8142` (DIMO link only; HM link untouched) |

---

## D. Idempotency / Duplicate Safety

| Check | Result |
|-------|--------|
| Second run CREATE? | **NO** — ACTIVE consent lookup → NOOP |
| Unique prevention | Application-level ACTIVE consent check per vehicle+provider |
| Consent appears before apply | Apply throws CONFLICT |
| link.consentId already set | WIRE skipped / NOOP |
| Unexpected consentId | **CONFLICT** — stop |
| Cross-org | **NO** — org+vehicleId scoped |
| Other providers | **NO** — DIMO only |
| HMÜ/WOB touched | **NO** — explicit vehicle-id allowlist |

**Dry-run counts (3 targets):** CREATE=3, WIRE=3, NOOP=0, CONFLICT=0, SKIP=0  
**Dry-run counts (all 6):** CREATE=3, NOOP=3 (HMÜ+WOB), CONFLICT=0, SKIP=0

---

## E. Cross-Tenant / Identity Safety

All three targets: same org, unique tokenId, unique dimoVehicleId, valid DIMO active links, token↔vehicle mapping verified. **PASS**

---

## F. Counterfactual Projection (shadow)

| Vehicle | Current providerLink | After consent | Current P0.2 | After P0.2 |
|---------|---------------------|---------------|--------------|------------|
| KS FH 660E | REAUTH_REQUIRED | **ACTIVE** | NEEDS_VERIFICATION | **AVAILABLE** |
| KS MS 661 | REAUTH_REQUIRED | **ACTIVE** | NEEDS_VERIFICATION | **AVAILABLE** |
| KS MX 2024 | REAUTH_REQUIRED | **ACTIVE** | NEEDS_VERIFICATION | **AVAILABLE** |

Telemetry/physical unchanged (standby / PLUGGED_INFERRED). CONSENT_MISSING and AUTHORIZATION_REQUIRED removed. No health fabrication.

---

## G. Health / Business Regression

P0.4 shadow: KS trio remain `PARTIALLY_EVALUABLE` — consent repair does not fabricate Gut/Auffällig/Kritisch.

---

## H. Prepared Apply Artifact

| Item | Path |
|------|------|
| Service | `backend/src/modules/vehicles/dimo-provider-consent-backfill.service.ts` |
| Ops script | `backend/scripts/ops/backfill-dimo-vehicle-provider-consents.ts` |
| Tests | `backend/src/modules/vehicles/dimo-provider-consent-backfill.service.spec.ts` |

### Dry-run command (executed on production VPS, read-only)

```bash
cd /opt/synqdrive/current/backend
export SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-dimo-vehicle-provider-consents.ts \
  --org=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --vehicle-id=68868291-5478-42cd-b0c4-cc77b2a78e21 \
  --vehicle-id=c10351f8-b6a2-4258-947f-631aeaa6d359 \
  --vehicle-id=a60c0749-a7cd-494e-b5b9-dea3c6b97d63 \
  --run-id=dimo-consent-backfill-prod-2026-08-26-phase1 \
  --shadow
```

### Apply command (PREPARED — DO NOT RUN without approval)

```bash
cd /opt/synqdrive/current/backend
export SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-dimo-vehicle-provider-consents.ts \
  --org=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --vehicle-id=68868291-5478-42cd-b0c4-cc77b2a78e21 \
  --vehicle-id=c10351f8-b6a2-4258-947f-631aeaa6d359 \
  --vehicle-id=a60c0749-a7cd-494e-b5b9-dea3c6b97d63 \
  --run-id=dimo-consent-backfill-prod-2026-08-26-phase1 \
  --shadow \
  --apply
```

---

## Final Gate

| Verdict | Result |
|---------|--------|
| CONSENT LEDGER DRY-RUN | **PASS** |
| APPLY READY | **YES** |
| PRODUCTION MUTATIONS | **NONE** |

**STOP** — await explicit operator approval before `--apply`.

---

## Phase 1.1 — Apply-Path Hardening (2026-08-26)

| Field | Value |
|-------|-------|
| **Mode** | Code hardening + production re-dry-run (read-only) |
| **Production modified** | **NO** |
| **PR** | #1307 (`cursor/dimo-consent-ledger-backfill-phase1-90ec`) |

### Hardening summary

| Invariant | Implementation |
|-----------|----------------|
| Tenant identity | `vehicle.organizationId === requestedOrganizationId` (replaces tautological self-comparison) |
| Active DIMO link cardinality | Exactly 1 required; 0 or >1 → CONFLICT |
| ACTIVE consent cardinality | 0 before CREATE; >1 → CONFLICT (plan + apply) |
| `link.consentId` FK safety | null or exact intended consent only; foreign value → CONFLICT |
| Apply-time revalidation | Full identity snapshot re-read before mutation inside transaction |
| Atomic 3-target apply | Preflight all targets; single transaction for all CREATE+WIRE; rollback on any failure |
| Post-write verification | Consent rows, metadata, link FK wiring verified inside transaction |

### Regression tests (14)

cross-org mismatch, token/dimoVehicleId collision, zero/multiple active links, multiple ACTIVE consents, unexpected `link.consentId`, consent appears between plan/apply, token change after dry-run, atomic 3-target success, one CONFLICT blocks all writes, second apply NOOP.

### Phase 1.1 dry-run command

```bash
cd /opt/synqdrive/current/backend
export SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-dimo-vehicle-provider-consents.ts \
  --org=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --vehicle-id=68868291-5478-42cd-b0c4-cc77b2a78e21 \
  --vehicle-id=c10351f8-b6a2-4258-947f-631aeaa6d359 \
  --vehicle-id=a60c0749-a7cd-494e-b5b9-dea3c6b97d63 \
  --run-id=dimo-consent-backfill-prod-2026-08-26-phase1-1 \
  --shadow
```

### Phase 1.1 final gate

| Verdict | Result |
|---------|--------|
| PRE-APPLY HARDENING | **PASS** |
| CONSENT LEDGER DRY-RUN | **PASS** (CREATE=3, WIRE=3, CONFLICT=0, SKIP=0) |
| ATOMIC APPLY READY | **YES** |
| PRODUCTION MUTATIONS | **NONE** |

**HEAD SHA:** `7e25f721d67418f2f31aa1d11040b29267ceadbd`

**Production dry-run (2026-08-26T15:03Z, runId `dimo-consent-backfill-prod-2026-08-26-phase1-1`):**

| Vehicle | CREATE | Shadow providerLink | Shadow P0.2 | Telemetry | Physical |
|---------|--------|---------------------|-------------|-----------|----------|
| KS FH 660E | yes | ACTIVE | AVAILABLE | standby (unchanged) | PLUGGED_INFERRED |
| KS MS 661 | yes | ACTIVE | AVAILABLE | standby (unchanged) | PLUGGED_INFERRED |
| KS MX 2024 | yes | ACTIVE | AVAILABLE | standby (unchanged) | PLUGGED_INFERRED |

`atomicApply: true`, `partialWritePossible: false`, `applied: 0`.

**STOP** — await explicit operator approval before `--apply`.

---

## Phase 1.2 — Transactional Consistency Hardening (2026-08-26)

| Field | Value |
|-------|-------|
| **Mode** | Code hardening + production re-dry-run (read-only) |
| **Production modified** | **NO** |
| **HEAD SHA** | `84b31c6c` (see final report for full SHA) |

### Fixes

| Issue | Resolution |
|-------|------------|
| TOCTOU / stale preflight | Authoritative gate moved inside `$transaction` via tx-local reads |
| Interleaved validate→write | All targets validated before any CREATE/WIRE |
| NOOP + WIRE_CONSENT_ID skipped | Wire-only mutation path implemented |
| Ambiguous `applied` counter | Explicit `createdConsents`, `wiredConsentIds`, `mutatedVehicles`, `noopVehicles` |
| Post-write verification | ACTIVE consent cardinality, link cardinality, FK + metadata inside tx |

### Regression tests: 18 (7 concurrency-focused)

### Phase 1.2 dry-run command

```bash
cd /opt/synqdrive/current/backend
export SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-dimo-vehicle-provider-consents.ts \
  --org=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --vehicle-id=68868291-5478-42cd-b0c4-cc77b2a78e21 \
  --vehicle-id=c10351f8-b6a2-4258-947f-631aeaa6d359 \
  --vehicle-id=a60c0749-a7cd-494e-b5b9-dea3c6b97d63 \
  --run-id=dimo-consent-backfill-prod-2026-08-26-phase1-2 \
  --shadow
```

### Phase 1.2 final gate

| Verdict | Result |
|---------|--------|
| TRANSACTIONAL CONSISTENCY | **PASS** |
| ATOMIC ALL-TARGET PREFLIGHT | **PASS** |
| WIRE-ONLY SEMANTICS | **PASS** |
| CONSENT LEDGER DRY-RUN | **PASS** (CREATE=3, WIRE=3, CONFLICT=0, SKIP=0) |
| PRODUCTION APPLY READY | **YES** |
| PRODUCTION MUTATIONS | **NONE** |

**STOP** — await explicit operator approval before `--apply`.

---

## Phase 2 — Controlled Production Apply (2026-08-26)

| Field | Value |
|-------|-------|
| **Mode** | Approved production mutation |
| **runId** | `dimo-consent-backfill-prod-2026-08-26-phase2` |
| **Main SHA** | `7d92e6877c426679b0bcc77a0573a8d0b6f1af78` |
| **Production release** | `20260826152600_v4994` |
| **Applied at (UTC)** | `2026-08-26T15:38:54Z` |

### Apply summary

| Metric | Result |
|--------|--------|
| createdConsents | **3** |
| wiredConsentIds | **3** |
| mutatedVehicles | **3** |
| conflict | **0** |
| skip | **0** |
| partialWritePossible | **false** |

### Consent IDs created

| Vehicle | Consent ID | Link ID |
|---------|-----------|---------|
| KS FH 660E | `8db7c1c2-7e9a-4143-bb2f-6a05aed804d3` | `805b271c-ba87-4776-9e39-23e24d595c53` |
| KS MS 661 | `35a33e73-9418-4bdf-9ee4-86cb2a62ad1e` | `71b75519-3053-4836-8bcd-554680d592b2` |
| KS MX 2024 | `72c25c8d-67d1-4b54-a7ff-6d531785ce85` | `e2bd6a49-f1fc-4d4f-bd60-e958b15d8142` |

### Post-apply runtime (canonical)

| Vehicle | providerLinkState | P0.2 | primaryReason | recommendedAction |
|---------|-------------------|------|---------------|-------------------|
| KS FH 660E | **ACTIVE** | **AVAILABLE** | LINK_ACTIVE | NONE |
| KS MS 661 | **ACTIVE** | **AVAILABLE** | LINK_ACTIVE | NONE |
| KS MX 2024 | **ACTIVE** | **AVAILABLE** | LINK_ACTIVE | NONE |

No `CONSENT_MISSING` / `AUTHORIZATION_REQUIRED` from consent ledger on any KS target.

### Safety verification

| Check | Result |
|-------|--------|
| Telemetry `source_timestamp` unchanged | **PASS** (all 3) |
| Connectivity episodes | **PASS** (0 open before/after) |
| Org auth (`bb129e88-…`) | **UNCHANGED** |
| DIMO token/link identity | **UNCHANGED** (consentId wired only) |
| businessState | **UNCHANGED** (AVAILABLE) |
| Idempotency dry-run | **PASS** (CREATE=0, WIRE=0, NOOP=3) |

### Phase 2 final gate

| Verdict | Result |
|---------|--------|
| CONSENT LEDGER APPLY | **PASS** |
| 3/3 ACTIVE CONSENTS | **PASS** |
| 3/3 LINK CONSENT IDS WIRED | **PASS** |
| PROVIDER LINK RECOVERY | **PASS** |
| P0.2 RECOVERY | **PASS** |
| IDEMPOTENCY | **PASS** |
| TELEMETRY SAFETY | **PASS** |
| CONNECTIVITY SAFETY | **PASS** |
| SERVICE HEALTH | **PASS** |

**DIMO PER-VEHICLE CONSENT LEDGER REPAIR: CLOSED**
