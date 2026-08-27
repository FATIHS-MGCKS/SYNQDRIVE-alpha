# Vehicle Row Operational Projection Contract — Stage 2A (2026-08)

| Field | Value |
|-------|-------|
| **Contract ID** | `vehicle-row-operational-projection-stage-2a` |
| **Status** | Stage 2B — availability/readiness display cutover active |
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

Stage 2B binds **display semantics only** via `getVehicleRowOperationalDisplay()` — no backend or readiness derivation changes.

---

## Stage 2B display mapping (`getVehicleRowOperationalDisplay`)

| Surface | Primary row badge dimension | Authority |
|---------|---------------------------|-----------|
| Fleet Command tabs | business workflow (P0.1) | unchanged — tab filter/count |
| Fleet Command row status chip | `businessState` | `fleet.businessState.*` labels (e.g. **Frei** / **Free**, not P0.2 “Verfügbar”) |
| Ready-to-Rent drilldown row status chip | `readiness` | P1.5 `isReadyToRent` + deterministic not-ready labels |
| Vehicle Detail | explicit per-dimension (unchanged visually) | existing detail panels |

### Readiness not-ready label precedence (deterministic)

1. `businessState === OUT_OF_SERVICE` OR `operationalAvailability === UNAVAILABLE` → `fleet.rowProjection.readiness.blocked`
2. `operationalAvailability === NEEDS_VERIFICATION` → `fleet.operationalAvailability.needsVerification`
3. `healthEvaluability === NOT_EVALUABLE` → `fleet.healthEvaluation.notEvaluable`
4. else → `fleet.rowProjection.readiness.notReady`

**Never** render P0.2 green “Verfügbar” / `fleet.operationalAvailability.available` as the Ready-to-Rent primary badge when `isReadyToRent === false`.

### Fleet Command tab rename (authority unchanged)

| Tab key | Before label | After label (DE / EN) | Count authority |
|---------|--------------|----------------------|-----------------|
| `Available` | Avail. | Frei / Free | P0.1 `operationalStatus === 'available'` (unchanged) |

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
| `getVehicleRowOperationalDisplay()` | Stage 2B — surface-aware labels/tones from projection |
| `FleetOperatorRow` | Primary status chip = business workflow (`fleet_command` surface) |
| `CompactFleetDrawerVehicleRow` | Primary status chip = readiness (`ready_to_rent` surface) |
| `FleetCommandPanel` | Tab labels via `fleet.command.tab.*` i18n (Frei/Free replaces Avail.) |

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
| **2B** | ✅ Label clarity (Avail. → Frei/Free); readiness-primary Ready-to-Rent badge; business-primary Fleet Command badge |
| **3A** | ✅ Shared `VehicleHealthFindingIcons` + `vehicle-health-finding-presentation.ts` (no consumer cutover) |
| **3B** | ✅ Fleet Command + Ready-to-Rent rows consume `VehicleHealthFindingIcons` from `activeHealthFindings[]` |
| **4** | Vehicle Detail header chip strip consumes same projection |
| **5** | Cross-surface contract CI gate + legacy `pickModuleReason` cleanup after all consumers cut over |

---

## Stage 3A — health finding icon contract (2026-08)

| Field | Value |
|-------|-------|
| **Resolver** | `resolveVehicleHealthFindingPresentation()` + `aggregateActiveHealthFindingsForDisplay()` |
| **Component** | `VehicleHealthFindingIcons` — renders only supplied `activeHealthFindings[]` |
| **Telltale registry** | `resolveDashboardTelltaleIconSrc()` in `dashboard-warning-lights-display.ts` (canonical) |
| **Consumer cutover** | **None** — Fleet/Ready-to-Rent reason chips unchanged |

### Icon asset matrix

| Finding type | Source data | Existing asset | Selected asset | Reason |
|--------------|-------------|----------------|----------------|--------|
| TIRE | Rental Health `modules.tires` | `VehicleHealthBox` → `motor-filter.svg` (+90°) | `assets/icons/vehicle-health/motor-filter.svg` | Matches Vehicle Detail health vocabulary |
| BRAKE | Rental Health `modules.brakes` | `VehicleHealthBox` → `brake.svg` | `assets/icons/vehicle-health/brake.svg` | Same |
| BATTERY | Rental Health `modules.battery` | `VehicleHealthBox` → `car-battery.svg` | `assets/icons/vehicle-health/car-battery.svg` | Same |
| DTC | Rental Health `modules.error_codes` | Telltale CEL / engine warning | `assets/icons/telltale/cel.svg` | Distinct from dashboard telltales |
| DASHBOARD_WARNING | `metadata.telltaleKey` | `DashboardWarningLightsPanel.iconForKey` | `resolveDashboardTelltaleIconSrc(key)` | Preserves specific telltale identity |
| SERVICE / COMPLIANCE | Rental Health modules | Lucide wrench / shield-alert | Icon component | Secondary domains; bounded support |

### Severity / tone

| Finding severity | Status tone | CSS variables |
|------------------|-------------|---------------|
| `critical` | `critical` | `--status-critical` |
| `warning` | `watch` | `--status-watch` |

No icon when `findings.length === 0`. No green/healthy placeholder icons.

### Aggregation rules

| Type | Rule |
|------|------|
| TIRE / BRAKE / BATTERY / SERVICE / COMPLIANCE | Domain-level aggregation; highest severity wins |
| DTC | One icon + optional count badge |
| DASHBOARD_WARNING | Dedupe same `telltaleKey`; preserve distinct telltales |

**Cross-domain policy:** health-domain findings and dashboard telltales are **not** deduplicated (e.g. TIRE + TPMS both render).

### Overflow

`splitAggregatedFindingsForDisplay(presentations, maxVisible)` — shows first N−1 + `+M` overflow chip with accessible list of hidden findings.

Tests: `vehicle-health-finding-presentation.test.ts` (H1–H16 + KS MX 2024 fixture).

---

## Stage 3B — Fleet Command + Ready-to-Rent consumer cutover (2026-08)

| Field | Value |
|-------|-------|
| **Consumers** | `FleetOperatorRow`, `CompactFleetDrawerVehicleRow` |
| **Health findings** | `VehicleHealthFindingIcons` ← `rowOperationalProjection.activeHealthFindings` |
| **Operational attention** | `resolveRowOperationalAttentionBadge()` — separate chip; not derived from icons |
| **Aggregate health** | Unchanged — `healthDisplay` / `StatusChip` (P0.4) |
| **Primary row status** | Unchanged — Fleet = business (Stage 2B); Ready-to-Rent = P1.5 readiness |
| **Dashboard warning lights** | Passthrough on rental-health batch (`dashboard_warning_lights`); no per-row API |

### Data flow

```
VehicleData + rentalHealth (+ embedded dashboard_warning_lights)
  → buildFleetVehicleContexts / buildVehicleRowOperationalProjection
    → rowOperationalProjection.activeHealthFindings[]
      → VehicleHealthFindingIcons (Fleet + Ready-to-Rent)
```

`composeFleetDashboardWarningLightsAccessor()` reuses embedded rental-health telltales; explicit accessor wins when supplied. **No N+1** — server already fetches telltales during rental-health evaluation.

### Health vs operational attention split

| Domain | Presentation | Source |
|--------|--------------|--------|
| Active health findings | `VehicleHealthFindingIcons` | `activeHealthFindings[]` |
| Operational attention | Compact reason chip | `projection.attention`, connectivity fallback, non-health `reasonBadge` |
| Aggregate health | Heart `StatusChip` | P0.4 `healthEvaluation` |
| Business / readiness | Primary status `StatusChip` | Stage 2B surface mapping |

Single textual health reasons (`pickModuleReason` / `resolveReasonBadgeFromUi` health text) are **suppressed** when icons render the same finding. Operational attention codes (`AUTHORIZATION_REQUIRED`, `DEVICE_UNPLUGGED`, `INTEGRATION_ERROR`, `NEEDS_VERIFICATION`, etc.) remain visible.

### Bypassed paths (compact rows only)

- `FleetOperatorRow` / `CompactFleetDrawerVehicleRow` no longer render `reasonBadge` for health findings
- `shouldSuppressHealthReasonBadgeText()` blocks duplicate health text when icons are authoritative

### Remaining legacy (Stage 4/5)

- `pickModuleReason` / `buildReasonBadge` / `resolveReasonBadgeFromUi` still used by `fleetVehicleDisplay.ts` and Vehicle Detail surfaces
- Vehicle Detail health box / overview unchanged in Stage 3B

Tests: `vehicle-row-health-consumer-cutover.test.ts` (B1–B16 + KS MX + cross-surface matrix + N+1 structural proof).

---

## Files

| Path | Role |
|------|------|
| `frontend/src/rental/lib/vehicle-row-operational-projection.ts` | Contract types + builder |
| `frontend/src/rental/lib/vehicle-row-operational-projection.test.ts` | Fixtures + invariants |
| `frontend/src/rental/lib/vehicle-row-operational-display.ts` | Stage 2B display mapping |
| `frontend/src/rental/lib/vehicle-row-operational-display.test.ts` | Invariants A1–A8 + six-vehicle matrix |
| `frontend/src/rental/lib/fleet-operator-panel.ts` | Context wiring |
| `frontend/src/rental/components/fleet-operator/FleetCommandView.tsx` | Runtime readiness wiring |
| `frontend/src/rental/components/fleet-operator/FleetCommandPanel.tsx` | Tab i18n cutover |
| `frontend/src/rental/components/fleet-operator/FleetOperatorRow.tsx` | Business-primary row badge |
| `frontend/src/rental/components/dashboard/CompactFleetDrawerVehicleRow.tsx` | Readiness-primary row badge |
| `frontend/src/rental/lib/vehicle-health-finding-presentation.ts` | Stage 3A icon resolver + aggregation |
| `frontend/src/rental/lib/vehicle-health-finding-presentation.test.ts` | H1–H16 + KS MX fixture |
| `frontend/src/rental/components/health/VehicleHealthFindingIcons.tsx` | Shared compact icon strip component |
| `frontend/src/rental/lib/dashboard-warning-lights-display.ts` | `resolveDashboardTelltaleIconSrc` registry |
| `frontend/src/rental/lib/vehicle-row-health-consumer.ts` | Stage 3B dashboard-warning passthrough accessor |
| `frontend/src/rental/lib/vehicle-row-operational-attention.ts` | Stage 3B health vs attention split |
| `frontend/src/rental/lib/vehicle-row-health-consumer-cutover.test.ts` | B1–B16 consumer tests + fixture matrix |
| `backend/src/modules/rental-health/rental-health.service.ts` | `dashboard_warning_lights` batch passthrough |
