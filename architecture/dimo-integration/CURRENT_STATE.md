# DIMO Integration — Current State (Partial, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **origin/main baseline** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **no R9 webhook wake wiring** |
| **R9 audit branch runtime** | `1186e9d23a9b07e24da17b06a72f2614038db77a` (PR #1553 post-rebase) |
| **Production baseline** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994` |
| **Last verified Production evidence** | `2026-09-07T22:10:00Z` (R9 scoped trigger bootstrap session; see DIM-EV-R9-BOOTSTRAP-001) |

---

## CONFIRMED — origin/main baseline @ `a47255148…`

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

### Worker / queue relationships (not owned algorithm internals)

| Queue / worker | DIMO role |
|----------------|-----------|
| `dimo.snapshot.poll` | Snapshot fetch processor imports DIMO services |
| `dimo.vehicle.sync` | Vehicle sync reconciliation |
| `dtc.poll` | DTC polling |
| `connectivity.webhook.process` | Device connection inbox async processing |

Scaling Process owns leader election and budget **algorithms**; DIMO module **consumes** budget/admission.

---

## CONFIRMED — R9 audit branch runtime @ `1186e9d23…`

PR #1553 adds cross-module webhook contract:

| Change | Location |
|--------|----------|
| `SnapshotWakeModule` import | `dimo.module.ts` |
| `SnapshotWakeIntakeService` injection | `dimo-webhook.controller.ts` |
| Speed / ignition → `handleProviderWake()` | returns `{ status, type, wakeOutcome }` |
| Tests | `dimo-webhook.controller.spec.ts` |

**Ownership boundary:** DIMO owns webhook endpoint, verification, payload normalization, and delegation call. Trip Detection owns wake evidence semantics, mailboxes, coalesce, handoff (see [Trip Detection R9 section](../trip-detection-lifecycle/CURRENT_STATE.md)).

---

## CONFIRMED — Production (read-only)

| Observation | Value | Evidence |
|-------------|-------|----------|
| Deployed SHA | `01541c2ab…` | DIM-EV-PROD-001 |
| Health | HTTP 200 | DIM-EV-PROD-002 |
| PM2 apps | `synqdrive`, `synqdrive-b` (+ logrotate) | DIM-EV-PROD-003 |
| Webhook route in build | present (`webhooks/dimo`) | DIM-EV-PROD-004 |
| R9 wake in deployed build | **present** (post-deploy @ `0ba96e03…`) | DIM-EV-PROD-005 superseded by release upgrade — see DIM-EV-R9-BOOTSTRAP-001 |
| R9 speed/ignition trigger coverage | **absent** (bootstrap ROLLED_BACK) | DIM-EV-R9-BOOTSTRAP-001 |
| Redis `bull:dimo.snapshot*` keys | 5 (prefix scan) | DIM-EV-PROD-006 |
| Redis `bull:snapshot.wake*` keys | present post-R9 deploy | re-verify on next session |

---

## UNKNOWN

- Full provider trigger subscription inventory on Production — **partially verified** (R9 bootstrap ROLLED_BACK; legacy OBD/RPM unchanged; see DIM-EV-R9-BOOTSTRAP-001)
- Complete DIMO env flag matrix (shared `backend.env` not readable from audit SSH user)
- Segment reconciliation ownership vs Trip Detection (partial — see DIM-GAP-001)

---

## Explicit non-claims

- R9 wake behavior **PRODUCTION_VALIDATED** — runtime deployed; **provider trigger coverage NOT validated** (bootstrap ROLLED_BACK; root cause: tokenId **190497** missing DIMO developer-license privilege — see DIM-EV-R9-PERM-001)
- Promotion to `AUTHORITY_ACTIVE`
- Complete provider gateway graph
