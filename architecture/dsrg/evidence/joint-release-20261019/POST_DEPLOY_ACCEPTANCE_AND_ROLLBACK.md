# Post-deploy acceptance and rollback

**Target SHA after deploy:** `cf20c49f6596589a56eae346b5550f0b662c46b6`  
**Prior production SHA:** `c6d5ab99416bbff569f25741c27b4e24f46aaf8e`

---

## T+0 read-only checks

| Check | Method | Pass criterion |
|-------|--------|----------------|
| Running SHA | `readlink -f /opt/synqdrive/current` + `git rev-parse HEAD` | **cf20c49f** both replicas' build env |
| Health HTTP | `https://app.synqdrive.eu/api/v1/health` | **200**, `status: ok` |
| Replica health | `:3001` / `:3002` local health | Both OK |
| Scheduler leaders | Deploy script convergence / ops snapshot | **Exactly 1** LEADER |
| DB OID | `SELECT oid FROM pg_database WHERE datname='synqdrive'` | **514336** unchanged |
| Public schema | `information_schema.schemata` | `public` exists |
| Migration ledger | `_prisma_migrations` | `20261019120000_vsi_p3a_provider_catalog_axes` finished; no new failures |
| Core row counts | `organizations`, `vehicles`, `vehicle_trips` | No unexpected **decrease** vs pre-deploy snapshot |
| Prisma errors | Logs / health | No new critical migrate errors |
| Queue depth | Redis/Bull metrics (if exposed) | No abnormal spike |
| S4 baseline | Same allowlists / authoritative output sample | **Parity** — no new research authority |
| S4 research modules | Code present under `s4-research/` | Present; flags still **off** |
| DTC | Poll/webhook cadence | Unchanged — no mixed-mode without flag |
| VSI P3A | Table exists; flags | Migration applied; **WRITE/RESOLVER false** |
| PDI | CLI `--help` or module load | Available; operator gate **off** |
| HV/LV | Battery workers / reconciliation | Healthy; no new cohort activation |
| Trip FSM | Shadow metrics | Unchanged policy |
| Feature flags | Diff `backend.env` | Only deploy SHA/build metadata changed |

**Pre-deploy snapshot (audit):** orgs **4**, vehicles **9**, trips **2636**, OID **514336**.

---

## T+1h / T+24h follow-up

- S4 processing error rate vs 7d baseline
- DTC ingestion lag
- Battery reconciliation jobs
- No growth in failed jobs / DLQ
- Confirm **no** `DI_V0_S4_RESEARCH_*` enabled without change ticket

---

## Rollback triggers

| Trigger | Action |
|---------|--------|
| Health check fails after rolling restart | **Application rollback** to prior release dir `20261018230030_v4994` / SHA `c6d5ab99` per VO5C rollback libs |
| Nest boot check fails on candidate | Deploy script **aborts** — current untouched |
| Migration fails mid-deploy | **Stop** — do not promote; investigate ledger; **no** manual DDL |
| Unexpected core data loss | **Stop** promotion; incident — consider restore from **fresh** pre-deploy backup only |
| Guard / backup content gate fails | **Abort** — fix bundle/backup; no bypass |

---

## Two rollback classes

### 1. Application release rollback

- Repoint `/opt/synqdrive/current` to previous release
- Rolling restart replicas
- **Does not** remove `vsi_provider_catalog_axes` if migration already applied

### 2. Database recovery

- Use **pre-deploy** backup from **same** deploy attempt (104MB+ class with sidecar `db_oid=514336`)
- **Never** use ~7MB Oct 18 `20261018141258` dump as primary baseline
- Restore is **separate** owner-authorized procedure — **not** automatic
- **Isolated restore test** not claimed in this audit

---

## S4 / shadow explicit non-goals

- Do **not** enable `DI_V0_S4_RESEARCH_DIRECTION_AWARE_EMISSION_P1_ENABLED` during release (#2085 not merged).
- Do **not** promote route-aware R4.1 to authoritative worker path.

**PRODUCTION_MUTATIONS during acceptance:** read-only unless separate owner approval.
