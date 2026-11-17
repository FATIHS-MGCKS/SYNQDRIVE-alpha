# Platform reorientation — progress ledger

**Append-only.** New workstreams add rows at the bottom. Do not delete rows; supersede decisions with explicit pointers.

**Status vocabulary (never conflate):**

| Field | Meaning |
|-------|---------|
| `implementation` | Code exists on a branch |
| `merge_status` | GitHub PR state on `main` |
| `deploy_status` | Owner-authorized production release — **unknown unless attested** |
| `production_validated` | Explicit production evidence record — **not** inferred from merge |

**Binding plan:** [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md)

---

## Ledger (chronological)

| ID | Date (UTC) | Phase | PR | Merge SHA | merge_status | deploy_status | production_validated | Scope (summary) | Change record / evidence | Tests / CI (as recorded in PR) | Remaining work |
|----|------------|-------|-----|-----------|--------------|---------------|----------------------|-----------------|--------------------------|-------------------------------|----------------|
| P2-PR1 | 2026-11-16 | P2 | [#2408](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2408) | `7bbb6892ac1ba89bcdcd2bc3bb386d3a55008adf` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | VYMOD catalog row, `ProductCatalogStatus`, migrations | [`CHANGE_RECORD_P2_PR1_2026-11-16.md`](../platform-product-catalog/CHANGE_RECORD_P2_PR1_2026-11-16.md) | Backend tests per PR | P2-PR2+ |
| P2-PR2 | 2026-11-16 | P2 | [#2409](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2409) | `9580d77e2f4951f8bbb4bd80b2c236c3c7f790a3` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | `core.entitlements.v1` read API; JWT-only | [`CHANGE_RECORD_P2_PR2_2026-11-16.md`](../platform-product-catalog/CHANGE_RECORD_P2_PR2_2026-11-16.md) | Per PR | M2M deferred P3 |
| P2-PR3 | 2026-11-16 | P2 | [#2410](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2410) | `9c9e1c7527b762c9b72500d9745ef75b728255a1` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | Vehicle product access schema + internal service | [`CHANGE_RECORD_P2_PR3_2026-11-16.md`](../platform-product-catalog/CHANGE_RECORD_P2_PR3_2026-11-16.md) | Per PR | Grants P2-PR4A |
| P2-PR4A | 2026-11-16 | P2 | [#2411](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2411) | `38bc7522d5cb64723c4ae3d5819748d9ec33c8cc` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | MA vehicle grants + access mode APIs | [`CHANGE_RECORD_P2_PR4A_2026-11-16.md`](../platform-product-catalog/CHANGE_RECORD_P2_PR4A_2026-11-16.md) | Per PR | UI P2-PR4B |
| P2-PR4B | 2026-11-17 | P2 | [#2412](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2412) | `28f9ed03d1d748246eb5c96a8f4b35d86e7a551a` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | MA org product management UI | [`CHANGE_RECORD_P2_PR4B_2026-11-17.md`](../platform-product-catalog/CHANGE_RECORD_P2_PR4B_2026-11-17.md) | Per PR | TAXI gate P2-PR4C |
| P2-PR4C | 2026-11-17 | P2 | [#2413](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2413) | `8add5e6655cdf10eb39908ad8484aae426ef74f3` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | TAXI `ProductSlug` retirement gates | [`CHANGE_RECORD_P2_PR4C_2026-11-17.md`](../platform-product-catalog/CHANGE_RECORD_P2_PR4C_2026-11-17.md) | Per PR | Policy P2-PR5 |
| P2-PR5 | 2026-11-17 | P2 | [#2414](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2414) | `01a7ea3ee984518a587c00f0ba37f8a5151ec996` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | ACTIVE-only operational entitlements | [`CHANGE_RECORD_P2_PR5_2026-11-17.md`](../platform-product-catalog/CHANGE_RECORD_P2_PR5_2026-11-17.md) | Per PR | P3 M2M slice |
| P3-PR1 | 2026-11-17 | P3 | [#2415](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2415) | `1ccce41674f2779053d3658a5a1678dae1dfc91e` (PR head; **not** on `main`) | **OPEN** | **NO** | **NOT_CLAIMED** | Inactive service-client registry (not in `AppModule`) | `CHANGE_RECORD_P3_PR1_2026-11-17.md` (PR #2415 branch only) | Per open PR | Review, merge, then P3-PR2 |
| APDS-P25-TEST | 2026-11-17 | APDS P25 | _(this PR)_ | _pending_ | _pending_ | **NO** | **NOT_CLAIMED** | Shadow concurrency Postgres cert test-only fix (unblocks #2415 CI) | [`APDS_V3_SHADOW_PG_CONCURRENCY_TEST_FIX_2026-11-17.md`](../vehicle-device-connectivity/evidence/APDS_V3_SHADOW_PG_CONCURRENCY_TEST_FIX_2026-11-17.md) | `p25-apd-shadow-postgres-ci.sh` PASS (40) | Merge; rebase #2416 ledger if needed |

**Verified `origin/main` at ledger init:** `01a7ea3ee984518a587c00f0ba37f8a5151ec996` (includes P2-PR5; **excludes** P3-PR1).

---

## Superseded decision pointers (historical)

| ID | Superseded claim | Superseded by |
|----|------------------|---------------|
| CORE-EXTRACT-TRAJECTORY | SYNQDRIVE-CORE mandatory extraction / auto-merge into Alpha | Owner 2026-11-16 — [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) § Owner decision |
| RENTAL-M2M-DEFAULT | Co-located Rental must use M2M to Core | Rejected — in-process consumption |
| TAXI-PRODUCTSLUG | TAXI as assignable platform product | P2-PR4C — slug retired for new assigns |

---

## Maintenance

1. Each substantive Alpha workstream: **append one row** with evidence links — do not paste full change records here.
2. After merge: set `merge_status` only when GitHub shows `MERGED`; record full 40-char SHA from `mergeCommit.oid`.
3. After owner deploy: set `deploy_status` only with deploy attestation SHA (DSRG/runbook); never from CI merge alone.
4. Reconcile `deploy_status` only from owner-authorized production release records (DSRG/runbook attestation SHA).