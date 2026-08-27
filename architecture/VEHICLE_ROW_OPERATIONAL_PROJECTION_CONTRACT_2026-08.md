# Vehicle Row Operational Projection Contract — Stage 2A (2026-08)

| Field | Value |
|-------|-------|
| **Contract ID** | `vehicle-row-operational-projection-stage-2a` |
| **Status** | Implemented — not yet bound to visible row UI |
| **Audit parent** | `docs/audits/vehicle-cross-surface-state-health-consumer-consistency-audit-2026-08.md` |
| **Implementation SHA** | (see commit on branch `cursor/vehicle-cross-surface-state-health-consumer-consistency-audit-2026-08-90ec`) |

---

## Purpose

Introduce one **frontend-only** shared projection (`VehicleRowOperationalProjection`) so Fleet Command, Ready-to-Rent drilldown, and Vehicle Detail compact/header surfaces can consume the same machine-readable contract without collapsing:

- business workflow state (P0.1)
- operational availability (P0.2)
- rental readiness (P1.5)
- connectivity (P0.1 / P1.2 presentation)
- health evaluability + aggregate condition (P0.4)
- attention / primary reason
- **all** active health findings (no first-finding-wins)

Stage 2A **does not** change visible UI chips, tab labels, or icon rendering.

---

## Authority ownership

| Projection field | Authority | Source module |
|------------------|-----------|---------------|
| `businessState` | P0.1 business workflow | `selectOperationalStatus(vehicle)` → mapped to `BusinessOperationalState` |
| `operationalAvailability` | P0.2 slice | `ui.availability.presentation` via `buildFleetVehicleUiProjection` |
| `readiness` | P1.5 runtime (when supplied) | `getReadiness()` input; **not** derived from P0.2 alone |
| `connectivity.*` | P0.1 + P1.2 presentation | `ui.connectivity` + `ui.attention` |
| `healthEvaluability` | P0.4 | `ui.health.presentation.evaluability` |
| `healthCondition` | P0.4 aggregate | `resolveHealthDisplayFromUi(ui)` |
| `attention` | P0.2 operator / attention slices | `ui.operator.primaryReason` / `ui.attention` |
| `activeHealthFindings[]` | Rental Health V1 modules + dashboard warnings | `buildActiveHealthFindings()` |

**Non-goals (unchanged):** backend projection builder, `deriveIsReadyForRenting` rules, fleet tab semantics, legacy `pickModuleReason` / `buildReasonBadge`.

---

## `activeHealthFindings` provenance

| `type` | Authoritative source | Inclusion rule |
|--------|---------------------|----------------|
| `DTC` | Rental Health `modules.error_codes` | `isOperativeRentalHealthModule` + severity critical/warning |
| `SERVICE` | Rental Health `modules.service_compliance` | same |
| `BRAKE` | Rental Health `modules.brakes` | same |
| `TIRE` | Rental Health `modules.tires` | same + tire taxonomy |
| `BATTERY` | Rental Health `modules.battery` | same |
| `DASHBOARD_WARNING` | `DashboardWarningLightsResponse.lights` | `isTelltaleCurrentlyActive` + severity critical/warning |
| `COMPLIANCE` | reserved for future compliance-specific split | not emitted separately in 2A (service_compliance → `SERVICE`) |

**Ordering:** severity (critical before warning), then stable domain order: DTC → SERVICE → BRAKE → TIRE → BATTERY → DASHBOARD_WARNING.

**No-first-finding-loss invariant:** the array enumerates **all** operative module findings. It does **not** call `pickModuleReason`, `resolveReasonBadgeFromUi`, or `operator.primaryReason` for finding selection.

**Dedup:** `(type, reasonCode)` tuple; dashboard warnings preferred over `vehicle_alerts` rental module when warning lights payload is present.

---

## Integration boundary

| Layer | Change |
|-------|--------|
| `buildVehicleRowOperationalProjection()` | New adapter in `frontend/src/rental/lib/vehicle-row-operational-projection.ts` |
| `buildFleetVehicleContexts()` | Adds `rowOperationalProjection` alongside existing `uiProjection` / `visual` / `health` |
| `FleetCommandView` | Passes `getReadiness` from `dashboardRuntime` when available |
| Visible row components | **Unchanged** in Stage 2A |

Future consumers (Stage 2B/2C/3) should read `ctx.rowOperationalProjection` instead of re-deriving readiness vs availability vs findings independently.

---

## Contract invariants (tests)

| ID | Statement |
|----|-----------|
| C1 | `businessState` does not overwrite `operationalAvailability` |
| C2 | `operationalAvailability` does not overwrite `readiness` |
| C3 | `readiness false` preserved when P0.2 is AVAILABLE |
| C4 | connectivity offline does not fabricate health condition |
| C5 | health condition does not fabricate readiness |
| C6 | multiple simultaneous findings survive normalization |
| C7 | no finding → empty array (no placeholders) |
| C8 | severity from canonical module semantics |
| C9 | localized strings are not machine authority (`localizationKey` + `reasonCode`) |
| C10 | findings array not collapsed to single primary reason |

Tests: `frontend/src/rental/lib/vehicle-row-operational-projection.test.ts`

---

## Future migration path

| Stage | Work |
|-------|------|
| **2B** | Label clarity (Avail. vs bereit); optional readiness chip semantics |
| **2C** | Ready-to-Rent row binds readiness badge without breaking P0.2 availability chip |
| **3** | Compact domain icons from `activeHealthFindings[]` using existing telltale / vehicle-health SVG assets |
| **4** | Vehicle Detail header chip strip consumes same projection |
| **5** | Cross-surface contract CI gate + legacy `pickModuleReason` cleanup after all consumers cut over |

---

## Files

| Path | Role |
|------|------|
| `frontend/src/rental/lib/vehicle-row-operational-projection.ts` | Contract types + builder |
| `frontend/src/rental/lib/vehicle-row-operational-projection.test.ts` | Fixtures + invariants |
| `frontend/src/rental/lib/fleet-operator-panel.ts` | Context wiring |
| `frontend/src/rental/components/fleet-operator/FleetCommandView.tsx` | Runtime readiness wiring |
