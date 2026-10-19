# Workstream deploy matrix — `c6d5ab99` → `76b463c98` (current `main`)

Production SHA: `c6d5ab99416bbff569f25741c27b4e24f46aaf8e`  
Release target (refresh at GO): **`76b463c98e6f8a08ce3b0560deccbdd2a9ec3866`** (`origin/main` after #2085 merge)  
Prior audit SHA: `cf20c49f6596589a56eae346b5550f0b662c46b6` (superseded as deploy pin — re-attest CI on tip).  
Diff scope prod→main: **31 commits**; bulk ~147k LOC S4 research + #2085 (+166 LOC worker shadow).

---

## A. Driving Intelligence S4 / EXP021

| Field | Detail |
|--------|--------|
| **WORKSTREAM** | S4 / EXP021 research decoders + offline harnesses |
| **MERGED_PRS** | #2082, #2084, **#2085** (P1 shadow wiring); eaa52ccf, df0fef2c, 0ea34ff8 |
| **CODE_DELTA** | `s4-research/*` + `road-matching-pipeline.ts` P1 shadow hook; **production** `viterbi-dp-costs.ts` / product S4 worker authority unchanged |
| **MIGRATIONS** | None new in prod→main delta beyond existing S4 research (already in prod ledger) |
| **CURRENT_PROD_STATUS** | Prod S4 on; **no** `DI_V0_S4_RESEARCH_*` in env |
| **DEPLOY_EFFECT** | See S4 states **A/B/C/D** below |
| **RUNTIME_FLAGS** | `DI_V0_S4_RESEARCH_DIRECTION_AWARE_EMISSION_P1_ENABLED` default **off**; requires full research stack + allowlists |
| **ACTIVATION_STATUS** | **C=OFF** planned; **D=unchanged** |
| **OWNER_APPROVAL_NEEDED** | **No** for deploy with flags off; **Yes** to enable P1 shadow or research worker |

### S4 states (mandatory separation)

| | Prod now | After deploy (flags unchanged) |
|--|----------|--------------------------------|
| **A. Code deployed** | Partial research libs | **Full** incl. #2085 wiring |
| **B. Shadow decoder installed** | No P1 hook | **Yes** in research pipeline |
| **C. Shadow decoder enabled** | No | **No** |
| **D. Authoritative promoted** | Prod forward V2 | **No change** |

**Route-aware R4.1:** **A** offline library only — not **B** in worker sync path.

**Verification notes**

- S4 worker / shadow admission: existing allowlists only (`DI_V0_S4_ORGANIZATION_ALLOWLIST`, `DI_V0_S4_VEHICLE_ALLOWLIST`).
- Trip FSM / S1/L3: no semantic promotion in diff; EXP021 fleet guard still invoked from `vps-deploy-release.sh`.
- CI: `S4 unit test suites`, `S4 PostgreSQL test suites`, `S4A PostgreSQL integration` — **success** on `cf20c49f`.

---

## B. Vehicle Signal Intelligence (P3A)

| Field | Detail |
|--------|--------|
| **WORKSTREAM** | VSI per-link provider catalog axes |
| **MERGED_PRS** | #2083 |
| **CODE_DELTA** | `vsi-p3a-*` writer, classifier, resolver, postgres integration tests; Prisma model + repository |
| **MIGRATIONS** | `20261019120000_vsi_p3a_provider_catalog_axes` (**additive**: enums + `vsi_provider_catalog_axes` + FKs to `organizations` / `vehicles`) |
| **CURRENT_PROD_STATUS** | Migration **not** in `_prisma_migrations` (pending) |
| **DEPLOY_EFFECT** | Schema extension only when migrate runs; **no writes** unless flags on |
| **RUNTIME_FLAGS** | `VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED` / `RESOLVER_ENABLED` — **unset** in prod → default **false** per `backend/.env.example` |
| **ACTIVATION_STATUS** | OFF |
| **OWNER_APPROVAL_NEEDED** | **No** for schema-only deploy with flags off; **Yes** to enable write/resolver |

---

## C. DTC-02 (P5A mixed-mode routing)

| Field | Detail |
|--------|--------|
| **WORKSTREAM** | DTC-01F cohort gate mixed-mode |
| **MERGED_PRS** | #2080 |
| **CODE_DELTA** | `dtc-01f-cohort-gate.ts` + tests (`MIXED_COHORT`, `COHORT_MIXED_NON_PILOT_LEGACY`) |
| **MIGRATIONS** | None |
| **CURRENT_PROD_STATUS** | Code not deployed; env has **no** `DTC_01F_*` keys |
| **DEPLOY_EFFECT** | **PASSIVE_CODE** until `DTC_01F_COHORT_MIXED_MODE_ENABLED=true` |
| **RUNTIME_FLAGS** | Mixed-mode default **OFF** |
| **ACTIVATION_STATUS** | OFF |
| **OWNER_APPROVAL_NEEDED** | **Yes** to enable mixed-mode (explicit pilot approval) |

---

## D. Physical Device Inventory (P1B.7 operator CLI)

| Field | Detail |
|--------|--------|
| **WORKSTREAM** | PDI manual intake operator |
| **MERGED_PRS** | #2063 |
| **CODE_DELTA** | Nest operator CLI, postgres integration tests, `docs/runbooks/pdi-p1b7-manual-intake-operator.md` |
| **MIGRATIONS** | None in this window |
| **CURRENT_PROD_STATUS** | Not in prod tree |
| **DEPLOY_EFFECT** | CLI available in release artifact; **inert** without gate |
| **RUNTIME_FLAGS** | `PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED` — **unset** → off |
| **ACTIVATION_STATUS** | OFF |
| **OWNER_APPROVAL_NEEDED** | **Yes** for any manual intake / inventory writes |

---

## E. Battery HV / LV / APDS

| Field | Detail |
|--------|--------|
| **WORKSTREAM** | Battery V2 / HV R22 |
| **MERGED_PRS** | (none in 30-commit list beyond prod) |
| **CODE_DELTA** | No material battery code delta prod→main in `git diff --stat` |
| **MIGRATIONS** | HV R22 migrations **already applied** in prod (ledger tail includes `20261017060000_battery_hv_r22_revalidation_checkpoint`) |
| **CURRENT_PROD_STATUS** | IN_PROD |
| **DEPLOY_EFFECT** | None expected beyond shared env (`BATTERY_*` flags already set) |
| **RUNTIME_FLAGS** | Preserve existing `BATTERY_*` / `BATTERY_HV_*` values — **do not reset** |
| **ACTIVATION_STATUS** | Existing pilots unchanged |
| **OWNER_APPROVAL_NEEDED** | **No** for this release scope |

---

## F. Trip FSM / TDL

| Field | Detail |
|--------|--------|
| **WORKSTREAM** | Trip boundary / FSM shadow |
| **MERGED_PRS** | — |
| **CODE_DELTA** | No trip-boundary promotion commits in `c6d5ab99..cf20c49f` |
| **MIGRATIONS** | None new |
| **CURRENT_PROD_STATUS** | Shadow flags active in env (vehicle allowlists redacted) |
| **DEPLOY_EFFECT** | **None planned** — parity preserved |
| **RUNTIME_FLAGS** | No before→after change in release plan |
| **ACTIVATION_STATUS** | Existing shadow only |
| **OWNER_APPROVAL_NEEDED** | **No** |

---

## G. Other merged workstreams (auto-discovered)

### G1. Production database guard hotfix (PG16 + Prisma ROOT)

| Field | Detail |
|--------|--------|
| **MERGED_PRS** | #2079 (`9c697f80c`) |
| **CODE_DELTA** | `production-database-backup-capture-verify.py`, `prisma-with-guard.sh`, manifest SHA256, tests |
| **MIGRATIONS** | None |
| **CURRENT_PROD_STATUS** | #2078 at prod SHA; **hotfix files partially on prod disk** without matching git SHA (see guard audit) |
| **DEPLOY_EFFECT** | Aligns executor + release guard bundle with `main` |
| **RUNTIME_FLAGS** | N/A |
| **OWNER_APPROVAL_NEEDED** | Deploy GO (or separate `SYNQDRIVE_GUARD_BUNDLE_INSTALL_AUTHORIZED=1` if bundle-only update) |

### G2. RFRF CI Postgres mirror

| Field | Detail |
|--------|--------|
| **MERGED_PRS** | `31c3d2424` (CI only) |
| **CODE_DELTA** | `.github` / CI scripts |
| **MIGRATIONS** | None |
| **CURRENT_PROD_STATUS** | N/A |
| **DEPLOY_EFFECT** | None on runtime |
| **OWNER_APPROVAL_NEEDED** | No |

---

## Open PR overlap (not in matrix)

| PR | Overlap | Release stance |
|----|---------|----------------|
| #2081 | Viterbi backtrack | **Superseded** by merged commits on `main` |
| #2085 | P1 shadow in worker | **Not released** until merged |
| #2077 | DDL guard draft | **Superseded** by #2078 @ prod |

**PRODUCTION_S4_AUTHORITY_CHANGE=NONE_PLANNED**
