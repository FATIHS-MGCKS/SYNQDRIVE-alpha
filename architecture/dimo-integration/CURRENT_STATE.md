# DIMO Integration — Current State (Partial, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **origin/main baseline** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **no R9 webhook wake wiring** |
| **R9 audit branch runtime** | `1186e9d23a9b07e24da17b06a72f2614038db77a` (PR #1553 post-rebase) |
| **Production baseline** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994` |
| **Last verified Production evidence** | `2026-09-07T02:55:00Z` (DIMO-focused read-only session; see DIM-EV-PROD-*) |

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
| R9 wake in deployed build | **absent** | DIM-EV-PROD-005 |
| Redis `bull:dimo.snapshot*` keys | 5 (prefix scan) | DIM-EV-PROD-006 |
| Redis `bull:snapshot.wake*` keys | **0** | DIM-EV-PROD-007 |

---

## UNKNOWN

- Full provider trigger subscription inventory on Production
- Complete DIMO env flag matrix (shared `backend.env` not readable from audit SSH user)
- Segment reconciliation ownership vs Trip Detection (partial — see DIM-GAP-001)

---

## Explicit non-claims

- R9 wake behavior **PRODUCTION_VALIDATED** — NOT_ON_PRODUCTION
- Promotion to `AUTHORITY_ACTIVE`
- Complete provider gateway graph
