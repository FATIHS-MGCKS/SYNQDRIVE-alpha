# Platform reorientation — progress ledger

**Append-only.** New workstreams add rows at the bottom. Do not delete rows; supersede decisions with explicit pointers.

**Frozen rows:** Rows marked _(frozen init snapshot)_ are **immutable** — never change `merge_status`, SHAs, or scope text in place. When lifecycle reconciles, **append** a successor row (e.g. `*-MERGED`) and link from the frozen row.

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
| P3-PR1-INIT | 2026-11-17 | P3 | [#2415](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2415) | `1ccce41674f2779053d3658a5a1678dae1dfc91e` (pre-merge PR head) | **OPEN** _(frozen init snapshot)_ | **NO** | **NOT_CLAIMED** | Service-client registry in review | — | — | Superseded by **P3-PR1-MERGED** row |
| APDS-P25-TEST | 2026-11-17 | APDS P25 | [#2417](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2417) | `0255466daf1b44e26d2ec399d12230d94c88237b` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | APDS V3 shadow concurrency postgres cert (test-only) | [`APDS_V3_SHADOW_PG_CONCURRENCY_TEST_FIX_2026-11-17.md`](../vehicle-device-connectivity/evidence/APDS_V3_SHADOW_PG_CONCURRENCY_TEST_FIX_2026-11-17.md) | APDS P25 disposable PG CI pass | Unblock #2415 CI |
| P3-PR1-MERGED | 2026-11-17 | P3 | [#2415](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2415) | `7f243d0fe30ba87e9225f5b3a454d901d5fef934` | **MERGED** | **NOT_RECORDED** | **NOT_CLAIMED** | Service-client registry; `CORE_APP_M2M_*` default OFF; not in `AppModule` | [`CHANGE_RECORD_P3_PR1_2026-11-17.md`](../platform-product-catalog/CHANGE_RECORD_P3_PR1_2026-11-17.md) | Unit + postgres integration per PR | P3-PR2 token exchange |
| PLATFORM-MASTER | 2026-11-17 | Governance | [#2416](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2416) | _pending merge_ | **OPEN** | **NO** | **NOT_CLAIMED** | Master plan, progress ledger, AGENTS + rules | This directory | `validate-module-registry.sh` | Independent documentation review |

**Verified `origin/main` at ledger init (2026-11-17):** `01a7ea3ee984518a587c00f0ba37f8a5151ec996` (P2 complete; P3-PR1 not yet merged).

**Verified `origin/main` after P3-PR1 merge (2026-11-17):** `7f243d0fe30ba87e9225f5b3a454d901d5fef934` (includes #2415, #2417 APDS test fix; **excludes** #2416 until merged).

---

## Historical platform intent (paused — not claimed as shipped)

| Step | Historical intent (pre-2026-11-16) | Status today |
|------|-------------------------------------|--------------|
| 1 | Alpha **copied into** SYNQDRIVE-CORE | CORE = reference fork; **no** auto merge-back to Alpha |
| 2 | Core as **separate central backend** deployable | **PAUSED** — Core logical domain stays in Alpha monolith |
| 3 | Rental as **separate application** deployable | **PAUSED** — Rental first-class **in-repo** |
| 4 | Core ↔ Rental over **secured API / M2M** | **PAUSED** as default for co-located Rental; M2M for **separate** product backends |

## Superseded decision pointers (historical)

| ID | Superseded claim | Superseded by |
|----|------------------|---------------|
| CORE-EXTRACT-TRAJECTORY | Mandatory Core extraction with automated merge-back into Alpha | Owner 2026-11-16 — Alpha permanent platform; selective manual ports from CORE only — [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) § Historical trajectory |
| RENTAL-M2M-MANDATORY-COLOCATED | Co-located Rental **must** use M2M to Core (incl. historical extraction plan) | **REJECTED** for in-process Rental — user JWT + guards; M2M optional binding slug only |
| TAXI-PRODUCTSLUG | TAXI as assignable platform product | P2-PR4C — slug retired for new assigns; historical rows preserved |

---

## Maintenance

1. Each substantive Alpha workstream: **append one row** with evidence links — do not paste full change records here.
2. After merge: **append** a row with `merge_status` **MERGED** and full 40-char `mergeCommit.oid` — do **not** rewrite frozen init rows.
3. After owner deploy: update `deploy_status` only in a **new** reconciliation row or documented attestation block — never infer from merge alone.
4. Reconcile `deploy_status` only from owner-authorized production release records (DSRG/runbook attestation SHA).
5. Platform architecture or roadmap changes: update [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) in the **same PR** as ledger/authority updates.