# DIMO Integration — Evidence Index

**origin/main baseline:** `a4725514866a03099e7a1e485ccf0b7ea37d6fec`
**R9 audit branch:** `1186e9d23a9b07e24da17b06a72f2614038db77a`
**Production release:** `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac`

| Evidence ID | Source type | Source path | Supported claim | Currentness | Limitations |
|-------------|-------------|-------------|-----------------|-------------|-------------|
| DIM-EV-CODE-MODULE-001 | CODE | `backend/src/modules/dimo/dimo.module.ts` | Nest module wiring (base on `main`; R9 imports `SnapshotWakeModule` on branch) | CONFIRMED_ON_MAIN; R9 delta **CONFIRMED_ON_R9_BRANCH** | R9 module wiring not on `origin/main` until #1553 |
| DIM-EV-CODE-WEBHOOK-001 | CODE | `backend/src/modules/dimo/dimo-webhook.controller.ts` | Webhook verification + trigger dispatch; R9 wake delegation on branch | Base webhook **CONFIRMED_ON_MAIN**; R9 wake paths **CONFIRMED_ON_R9_BRANCH** @ `1186e9d23…` | R9 wake delegation **NOT_ON_MAIN** until merge |
| DIM-EV-R9-AUDIT-001 | AUDIT_DOCUMENT | `docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md` | R9 cross-module wake contract | CONFIRMED_ON_R9_BRANCH | Supporting evidence; not canonical routing |
| DIM-EV-PROD-001 | PRODUCTION_OBSERVATION | SSH release HEAD | Deployed SHA/path | CONFIRMED_AT_PRODUCTION_RELEASE | 2026-09-07 session |
| DIM-EV-PROD-002 | PRODUCTION_OBSERVATION | HTTPS health | API liveness | CONFIRMED_AT_PRODUCTION_RELEASE | — |
| DIM-EV-PROD-003 | PRODUCTION_OBSERVATION | `sudo pm2 jlist` | synqdrive + synqdrive-b running | CONFIRMED_AT_PRODUCTION_RELEASE | — |
| DIM-EV-PROD-004 | PRODUCTION_OBSERVATION | Deployed `dimo-webhook.controller.js` grep | Webhook route present | CONFIRMED_AT_PRODUCTION_RELEASE | — |
| DIM-EV-PROD-005 | PRODUCTION_OBSERVATION | Deployed build grep | **R9 SnapshotWakeIntakeService absent** | NOT_ON_PRODUCTION | — |
| DIM-EV-PROD-006 | PRODUCTION_OBSERVATION | Redis scan `bull:dimo.snapshot*` | Prefix count 5 | CONFIRMED_AT_PRODUCTION_RELEASE | Not queue depth |
| DIM-EV-PROD-007 | PRODUCTION_OBSERVATION | Redis scan `bull:snapshot.wake*` | Count **0** | NOT_ON_PRODUCTION | R9 handoff queue absent |

## Cross-reference

Trip Detection indexes R9 wake from branch state: [../trip-detection-lifecycle/evidence/EVIDENCE_INDEX.md](../trip-detection-lifecycle/evidence/EVIDENCE_INDEX.md) TDL-EV-R9-*
