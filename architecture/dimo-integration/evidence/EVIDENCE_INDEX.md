# DIMO Integration — Evidence Index

**origin/main (current):** `1393095f5d8faa2ff73e9dce5fe84024841e2528` — includes R9 merged via #1553 @ `4bef60463…`
**R9 audit branch (historical):** `1186e9d23a9b07e24da17b06a72f2614038db77a` — pre-merge audit baseline
**Production release (current):** `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994`
**Production release (historical pre-R9):** `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994`

| Evidence ID | Source type | Source path | Supported claim | Currentness | Limitations |
|-------------|-------------|-------------|-----------------|-------------|-------------|
| DIM-EV-CODE-MODULE-001 | CODE | `backend/src/modules/dimo/dimo.module.ts` | Nest module wiring including R9 `SnapshotWakeModule` import | CONFIRMED_ON_MAIN @ `4bef60463…` | — |
| DIM-EV-CODE-WEBHOOK-001 | CODE | `backend/src/modules/dimo/dimo-webhook.controller.ts` | Webhook verification + trigger dispatch; R9 wake delegation | CONFIRMED_ON_MAIN @ `4bef60463…` | — |
| DIM-EV-R9-AUDIT-001 | AUDIT_DOCUMENT | `docs/audits/trip-fsm/R9_ADAPTIVE_POLLING_WAKE_IMPLEMENTATION_2026-09-07.md` | R9 cross-module wake contract | CONFIRMED_ON_MAIN | Supporting evidence; not canonical routing |
| DIM-EV-PROD-001 | PRODUCTION_OBSERVATION | SSH release HEAD | Deployed SHA/path @ `0ba96e03…` | CONFIRMED_AT_PRODUCTION_RELEASE | 2026-09-07 session |
| DIM-EV-PROD-002 | PRODUCTION_OBSERVATION | HTTPS health | API liveness | CONFIRMED_AT_PRODUCTION_RELEASE | — |
| DIM-EV-PROD-003 | PRODUCTION_OBSERVATION | `sudo pm2 jlist` | synqdrive + synqdrive-b running | CONFIRMED_AT_PRODUCTION_RELEASE | — |
| DIM-EV-PROD-004 | PRODUCTION_OBSERVATION | Deployed `dimo-webhook.controller.js` grep | Webhook route present | CONFIRMED_AT_PRODUCTION_RELEASE | — |
| DIM-EV-PROD-005 | PRODUCTION_OBSERVATION | Deployed build grep @ **pre-R9** release `01541c2ab…` | **R9 SnapshotWakeIntakeService absent** | **HISTORICAL** | Superseded by DIM-EV-PROD-R9-001 @ `0ba96e03…` |
| DIM-EV-PROD-R9-001 | PRODUCTION_OBSERVATION | Deployed build grep @ `0ba96e03…` | **R9 SnapshotWakeIntakeService present** in webhook controller | CONFIRMED_AT_PRODUCTION_RELEASE | Runtime deployed; natural wake not observed |
| DIM-EV-PROD-006 | PRODUCTION_OBSERVATION | Redis scan `bull:dimo.snapshot*` | Prefix count 5 | CONFIRMED_AT_PRODUCTION_RELEASE | Not queue depth |
| DIM-EV-PROD-007 | PRODUCTION_OBSERVATION | Redis scan `bull:snapshot.wake*` | Present post-R9 deploy | CONFIRMED_AT_PRODUCTION_RELEASE | Re-verify depth on next session |
| DIM-EV-R9-BOOTSTRAP-001 | PRODUCTION_OBSERVATION | Authorized six-vehicle scoped provider bootstrap + GET audit | R9 trigger bootstrap **ROLLED_BACK**; legacy OBD/RPM unchanged; **0/6** coverage | **HISTORICAL** @ `0ba96e03…` | [R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md](R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md) |
| DIM-EV-R9-PERM-001 | PRODUCTION_OBSERVATION | Read-only permission root-cause audit | tokenId **190497** = `FORMER_FLEET_VEHICLE` / excluded; re-grant **rejected** | CONFIRMED_AT_PRODUCTION_RELEASE | [R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md](R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md) |
| DIM-EV-R9-CANARY-001 | PRODUCTION_OBSERVATION | Authorized five-vehicle R9 canary + GET audit | Provider wiring **PASS** — 5/5 speed+ignition; stableIds `9eeb7158afee`, `5d611d470eab`; 190497 excluded | CONFIRMED_AT_PRODUCTION_RELEASE @ `0ba96e03…` | Natural wake **not validated** — [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](R9_FIVE_VEHICLE_CANARY_2026-09-07.md) |
| DIM-EV-KS-MS-661-R9-001 | PRODUCTION_OBSERVATION | [KS_MS_661_R9_WAKE_2026-09-08.md](KS_MS_661_R9_WAKE_2026-09-08.md) | **First** natural R9 trigger delivery observed (tokenId 187361); 22 webhook logs window A on replica A; 19:53:24 **not** proven ignition-off | CONFIRMED_AT_PRODUCTION_RELEASE @ `684950419…` | Cross-ref TDL-EVID-KS-MS-661-001; payload archive gap |
| DIM-EV-KS-MS-661-R9-002 | PRODUCTION_OBSERVATION | [KS_MS_661_R9_WAKE_R11_2026-09-09.md](KS_MS_661_R9_WAKE_R11_2026-09-09.md) | **Second** natural start wake @ R11 `f7eb94cb…`; FSM `DIMO_TRIGGER`/`IGNITION_ON` @ 04:38:17Z; replica A | CONFIRMED_AT_PRODUCTION_RELEASE @ `f7eb94cb…` | Start wake only; end-path wake not observed |
| DIM-EV-WEBHOOK-OPS-001 | OPERATIONS_RUNBOOK | [operations/WEBHOOK_OPERATIONS.md](../operations/WEBHOOK_OPERATIONS.md) | Verified DIMO Vehicle Triggers API workflows (auth, list, create, subscribe, rollback); UNPLUG recovery PUT designed not executed | CONFIRMED | Cross-ref VDC-EVID-GT-R1-UNPLUG-FAILURE-001 |

## Cross-reference

Trip Detection R9 evidence: [../../trip-detection-lifecycle/evidence/EVIDENCE_INDEX.md](../../trip-detection-lifecycle/evidence/EVIDENCE_INDEX.md) TDL-EV-R9-*
