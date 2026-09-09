# DIMO Integration — Current State (Partial, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **origin/main (current)** | `1393095f5d8faa2ff73e9dce5fe84024841e2528` — includes R9 runtime merged via #1553 @ `4bef60463…` |
| **R9 merge on main** | `4bef60463…` (PR #1553) |
| **R9 audit branch (historical)** | `1186e9d23a9b07e24da17b06a72f2614038db77a` — pre-merge audit baseline; superseded by main merge |
| **Production baseline (current)** | `68495041974135f7c6565fd5b836b3e2f9176fae` @ `/opt/synqdrive/releases/20260908172927_v4994` (R10 deploy 2026-09-08) |
| **Pre-R10 Production (historical)** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994` |
| **Last verified Production evidence** | `2026-09-08T20:53:16Z` (KS MS 661 R9 wake cross-ref DIM-EV-KS-MS-661-R9-001) |

---

## CONFIRMED — origin/main @ `1393095f5…` (includes R9)

### Module entry (`backend/src/modules/dimo/`)

| Surface | Path / symbol |
|---------|----------------|
| Nest module | `dimo.module.ts` |
| REST API | `dimo.controller.ts` |
| Webhook ingress | `dimo-webhook.controller.ts` (`POST /webhooks/dimo`) |
| Auth | `dimo-auth.service.ts`, `@config/dimo.config` |
| Provider gateway | `provider/dimo-provider-gateway.service.ts` |
| Admission / limiter / metrics | `provider/dimo-provider-*.service.ts` |
| Provider budget | `provider-budget/` |
| Telemetry | `dimo-telemetry.service.ts`, `queries/*` |
| Segments | `dimo-segments.service.ts`, `recharge-segments/` |
| Triggers | `dimo-triggers.service.ts`, `dimo-triggers-bootstrap.service.ts` |
| Device connection | `device-connection-*`, inbox + episode reconciliation |
| Vehicle link | `dimo-vehicle-data-source-link.service.ts` |
| RPM webhook candidate | `rpm-webhook-candidate.service.ts` |

~19725 lines TypeScript under `backend/src/modules/dimo/` (file count audit).

### R9 cross-module webhook contract (merged #1553)

| Change | Location |
|--------|----------|
| `SnapshotWakeModule` import | `dimo.module.ts` |
| `SnapshotWakeIntakeService` injection | `dimo-webhook.controller.ts` |
| Speed / ignition → `handleProviderWake()` | returns `{ status, type, wakeOutcome }` |
| Tests | `dimo-webhook.controller.spec.ts` |

**Ownership boundary:** DIMO owns webhook endpoint, verification, payload normalization, and delegation call. Trip Detection owns wake evidence semantics, mailboxes, coalesce, handoff (see [Trip Detection R9 section](../trip-detection-lifecycle/CURRENT_STATE.md)).

### Worker / queue relationships (not owned algorithm internals)

| Queue / worker | DIMO role |
|----------------|-----------|
| `dimo.snapshot.poll` | Snapshot fetch processor imports DIMO services |
| `dimo.vehicle.sync` | Vehicle sync reconciliation |
| `dtc.poll` | DTC polling |
| `connectivity.webhook.process` | Device connection inbox async processing |

Scaling Process owns leader election and budget **algorithms**; DIMO module **consumes** budget/admission.

---

## CONFIRMED — Production (read-only @ `0ba96e03…`)

| Observation | Value | Evidence |
|-------------|-------|----------|
| Deployed SHA / path | `0ba96e03…` @ `20260907204434_v4994` | DIM-EV-PROD-001 (updated) |
| Health | HTTP 200 | DIM-EV-PROD-002 |
| PM2 apps | `synqdrive`, `synqdrive-b` (+ logrotate) | DIM-EV-PROD-003 |
| Webhook route in build | present (`webhooks/dimo`) | DIM-EV-PROD-004 |
| R9 wake runtime in deployed build | **present** (`SnapshotWakeIntakeService` in webhook controller) | DIM-EV-PROD-R9-001 |
| R9 speed/ignition trigger coverage (active cohort) | **5/5** subscribed to both triggers (stableIds `9eeb7158afee`, `5d611d470eab`; tokenId **190497** excluded — former fleet) | DIM-EV-R9-CANARY-001 |
| Legacy OBD/RPM webhooks | **unchanged** (3 definitions) | DIM-EV-R9-CANARY-001 |
| Redis `bull:dimo.snapshot*` keys | 5 (prefix scan) | DIM-EV-PROD-006 |
| Redis `bull:snapshot.wake*` keys | present post-R9 deploy | DIM-EV-PROD-007 (re-verify on next session) |

---

## HISTORICAL — pre-R9 Production @ `01541c2ab…`

| Observation | Value | Evidence |
|-------------|-------|----------|
| R9 wake runtime | **absent** from deployed webhook controller | DIM-EV-PROD-005 (**HISTORICAL**) |
| R9 provider trigger coverage | **0/6** after six-vehicle bootstrap ROLLED_BACK | DIM-EV-R9-BOOTSTRAP-001 |

Do not treat pre-R9 Production observations as current state.

---

## OPEN gaps (not UNKNOWN for verified R9 cohort)

| Gap | Status |
|-----|--------|
| Natural R9 webhook wake end-to-end delivery | **PARTIALLY VALIDATED** — natural **start** wake reconfirmed tokenId 187361 @ R11 `f7eb94cb…` (DIM-EV-KS-MS-661-R9-002); first observation @ `684950419…` (DIM-EV-KS-MS-661-R9-001); in-trip/end-path wake + payload archive **OPEN** (DIM-GAP-006) |
| Full fleet-wide trigger inventory beyond active R9 cohort | **PARTIAL** — GET-based method established for audited cohort (DIM-GAP-002) |
| Complete DIMO env flag matrix | **UNKNOWN** (DIM-GAP-003) |
| Segment reconciliation ownership vs Trip Detection | **PARTIAL** (DIM-GAP-001) |
| Stale SynqDrive mirror for tokenId **190497** | **OPEN** — excluded from cohort; cleanup deferred (DIM-GAP-005) |

---

## Explicit non-claims

- **Natural R9 wake delivery PRODUCTION_VALIDATED** — **partial only**: start wake observed KS MS 661; not full efficiency/end-to-end closure
- tokenId **190497** reauthorization — **rejected** (`FORMER_FLEET_VEHICLE` / `EXCLUDED_FROM_ACTIVE_R9_COHORT`; stale SynqDrive mirrors are separate data-integrity gap — see DIM-EV-R9-PERM-001)
- Promotion to `AUTHORITY_ACTIVE`
- Complete provider gateway graph
