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
| **PRODUCTION STATUS** | Runtime on Production @ `8a1d9c658…` (R9 ancestor). **R9 authorized cohort 5/5** speed+ignition subscribed (DIM-EVID-R9-CANARY-001; TDL-EVID-OQ009-R9-INGRESS-001 re-read). Natural R9 **start** wake **PRODUCTION_OBSERVED / PARTIALLY_VALIDATED** (KS MS 661). Fleet-wide wake-rate KPI + full end-to-end closure **not** established. |
| **OPEN GAPS** | Fleet-wide wake KPI + payload archive (DIM-GAP-006); stale scheduler mirror for **`HISTORICALLY_EXCLUDED_FORMER_FLEET_ASSET`** (DIM-GAP-005) |

Cross-authority: [Trip Detection TDL-DEC-R9-CX-001](../../trip-detection-lifecycle/decisions/DECISION_REGISTER.md)

---

## DIM-DEC-OQ006-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | DIM-GAP-001 / TDL-OQ-006 OPEN — unclear segment vs live FSM boundary ownership |
| **WHY** | Cross-module contract required when provider segments arrive after live FSM persistence |
| **CHANGE** | **`DimoSegmentsService`** owns provider fetch/normalization only; **Trip Detection** owns all **`VehicleTrip`** boundary mutations via **`TripDecisionEngine`** + reconciliation gates |
| **NON-EFFECTS** | DIMO does not write trip lifecycle; mechanism fallback order is not live FSM hierarchy |
| **EVIDENCE** | DIM-EVID-OQ006-BOUNDARY-001 |
| **CROSS-REF** | [TDL-DEC-OQ006-001](../../trip-detection-lifecycle/decisions/DECISION_REGISTER.md) |
