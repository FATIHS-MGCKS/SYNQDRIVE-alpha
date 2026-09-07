# DIMO Integration — Decision Register (Bootstrap)

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| DIM-DEC-R9-001 | Provider webhook → Trip Detection wake delegation | VALIDATED | DIM-EVID-R9-AUDIT-001 |

---

## DIM-DEC-R9-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (repository/tests on R9 branch only) |
| **BEFORE** | Speed/ignition DIMO triggers handled only via tiered snapshot polling cadence; no durable provider-wake ingress at webhook |
| **WHY** | Trip start liveness requires immediate wake evidence from provider triggers without bypassing canonical serialized snapshot fetch |
| **CHANGE** | `DimoWebhookController` delegates `speed` / `isIgnitionOn` to `SnapshotWakeIntakeService.handleProviderWake()`; response includes `wakeOutcome` |
| **OWNERSHIP** | **DIMO:** webhook endpoint, verification, payload normalization, delegation. **Trip Detection:** wake evidence, eligibility, mailboxes, coalesce, handoff, FSM lifecycle |
| **FAILURE SEMANTICS** | Webhook still returns structured `{ status, type, wakeOutcome }`; intake failures do not bypass DIMO auth rejection paths |
| **NON-EFFECTS** | DIMO does not become trip lifecycle authority; Trip Detection does not own provider gateway/auth/telemetry transport |
| **EVIDENCE** | DIM-EVID-R9-AUDIT-001 |
| **VALIDATION** | `dimo-webhook.controller.spec.ts`, R9 focused suites, BullMQ integration (branch) |
| **PRODUCTION STATUS** | **NOT_ON_PRODUCTION** at `01541c2ab…` (DIM-EVID-PROD-005) |
| **OPEN GAPS** | Provider subscription inventory UNKNOWN; segment ownership split (DIM-GAP-001) |

Cross-authority: [Trip Detection TDL-DEC-R9-CX-001](../trip-detection-lifecycle/decisions/DECISION_REGISTER.md)
