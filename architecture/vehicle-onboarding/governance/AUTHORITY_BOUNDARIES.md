# Vehicle Onboarding — Authority Boundaries (Provisional)

**Status:** `PROPOSED` — VO-0B bootstrap. Becomes normative when promoted with `AUTHORITY_ACTIVE` and validated decisions.

**Anchor SHA:** `312d9f54a2b4c0b0740061d3e2b74897e78eacb0`

---

## Provider ingress (DIMO, High Mobility, future)

**Owns**

- Provider authentication and API/MQTT transport (see [DIMO Integration](../../dimo-integration/), HM modules under `backend/src/modules/high-mobility/`)
- Provider discovery and provider-native identifiers (`DimoVehicle.tokenId`, `HighMobilityVehicle.hmVehicleReference`, etc.)
- Provider connection/clearance/streaming state on mirror tables
- Provider raw metadata (`rawJson`, `providerPayloadJson`)

**Does NOT own**

- Canonical `Vehicle.id`
- Organization assignment policy
- Operational rental/fleet lifecycle semantics
- Technical or health conclusions (SOH, tread wear, trip outcomes)
- Booking state

---

## Vehicle Onboarding / Vehicle Registry (this workstream)

**Owns or coordinates**

- Canonical `Vehicle` identity establishment
- VIN identity relationship and conflict policy (design)
- Registration identity and provider mapping into canonical `Vehicle`
- Organization assignment at onboarding (baseline)
- Station baseline assignment at onboarding
- Administrative vehicle baseline fields on `Vehicle`
- Technical specification baseline initialization (orchestration into tire/brake/battery/service modules)
- Onboarding readiness contract and activation transition (target — partially implicit today)
- Durable history for identity and assignment truth (target — gaps VO-GAP-003, VO-GAP-005, VO-GAP-004)

**May orchestrate** domain-specific baseline initialization (tires, brakes, battery spec rows) **without** owning downstream health conclusions.

**Does NOT own**

- Normalized telemetry truth or freshness conclusions → **Vehicle & Device Connectivity**
- Trip FSM → **Trip Detection & Lifecycle**
- Driving conclusions → **Driving Intelligence**
- Battery health / reference capacity conclusions → **Battery V2**
- Energy events → **KG-EED**
- Vehicle Health rental conclusions → health/rental-health modules
- Booking lifecycle → **Bookings**
- Provider runtime connectivity interpretation → **VDC**
- Billing policy → **Billing** (may consume provision/removal events only)

---

## Telemetry / Vehicle & Device Connectivity

**Owns:** connectivity interpretation, telemetry source identity (`resolveTelemetrySourceFamily`), normalized freshness projection.

**Cross-reference:** [VDC-GAP-013](../../vehicle-device-connectivity/contradictions/KNOWLEDGE_GAPS.md) — integration identity vs `vehicles.hardware_type`. VO does not re-open that gap; VO-GAP-011 tracks onboarding impact.

---

## Battery Intelligence (Battery V2)

**Owns:** `VehicleBatteryCapability`, `VehicleBatteryReferenceCapacity`, longitudinal health, publication gates.

**Onboarding may:** seed specs and trigger capability refresh (`registerFromDimo`); must not define SOH or health outcomes.

---

## Driving Intelligence

**Owns:** `VehicleDrivingCapability` empirical probes, driving behavior conclusions.

---

## Vehicle Health

**Owns:** current health conclusions and rental-health aggregation — not static onboarding specs.

---

## Billing

**Owns:** billable quantity policy, assignments, Stripe semantics.

**Onboarding may:** call `BillingQuantityVehicleIntegration` on provision/remove — must not define billable rules.

---

## REUSE-FIRST components

Documented in [research/CHANGE_LEDGER.md](../research/CHANGE_LEDGER.md) VO-0B entry. Do not replace without VO-1+ justification.
