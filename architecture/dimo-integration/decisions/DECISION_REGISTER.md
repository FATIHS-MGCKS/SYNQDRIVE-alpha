# DIMO Integration — Decision Register (Bootstrap)

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| DIM-DEC-R9-001 | Provider webhook → Trip Detection wake delegation | VALIDATED | DIM-EVID-R9-AUDIT-001; DIM-EVID-PROD-R9-001; DIM-EVID-R9-CANARY-001 |

---

## DIM-DEC-R9-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Speed/ignition DIMO triggers handled only via tiered snapshot polling cadence; no durable provider-wake ingress at webhook |
| **WHY** | Trip start liveness requires immediate wake evidence from provider triggers without bypassing canonical serialized snapshot fetch |
| **CHANGE** | `DimoWebhookController` delegates `speed` / `isIgnitionOn` to `SnapshotWakeIntakeService.handleProviderWake()`; response includes `wakeOutcome` |
| **OWNERSHIP** | **DIMO:** webhook endpoint, verification, payload normalization, delegation. **Trip Detection:** wake evidence, eligibility, mailboxes, coalesce, handoff, FSM lifecycle |
| **FAILURE SEMANTICS** | Webhook still returns structured `{ status, type, wakeOutcome }`; intake failures do not bypass DIMO auth rejection paths |
| **NON-EFFECTS** | DIMO does not become trip lifecycle authority; Trip Detection does not own provider gateway/auth/telemetry transport |
| **EVIDENCE** | DIM-EVID-R9-AUDIT-001; DIM-EVID-PROD-R9-001; DIM-EVID-R9-CANARY-001 |
| **VALIDATION** | `dimo-webhook.controller.spec.ts`, R9 focused suites, BullMQ integration; Production build grep @ `0ba96e03…`; five-vehicle provider canary GET audit |
| **PRODUCTION STATUS** | Runtime **deployed** @ `0ba96e03…` (DIM-EVID-PROD-R9-001). Provider speed/ignition trigger wiring **validated** — 5/5 active cohort (DIM-EVID-R9-CANARY-001). **Natural end-to-end wake not PRODUCTION_VALIDATED** — awaits observed drive/ignition event. |
| **OPEN GAPS** | Natural R9 wake delivery (DIM-GAP-006); segment ownership split (DIM-GAP-001); stale mirror for 190497 (DIM-GAP-005) |

Cross-authority: [Trip Detection TDL-DEC-R9-CX-001](../../trip-detection-lifecycle/decisions/DECISION_REGISTER.md)
