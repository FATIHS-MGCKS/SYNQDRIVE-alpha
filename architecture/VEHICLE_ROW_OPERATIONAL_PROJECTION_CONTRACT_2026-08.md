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
| **4** | ✅ Vehicle Detail header aligned to shared projection + telltale registry consolidation |
| **5** | Cross-surface contract CI gate + legacy `pickModuleReason` cleanup after all consumers cut over |

---

## Stage 3A — health finding icon contract (2026-08)

| Field | Value |
|-------|-------|
| **Resolver** | `resolveVehicleHealthFindingPresentation()` + `aggregateActiveHealthFindingsForDisplay()` |
| **Component** | `VehicleHealthFindingIcons` — renders only supplied `activeHealthFindings[]` |
| **Telltale registry** | `resolveDashboardTelltaleIconSrc()` + `DashboardTelltaleIcon` in `dashboard-warning-lights-display.ts` (canonical) |
| **Consumer cutover** | **None** — Fleet/Ready-to-Rent reason chips unchanged |

### Icon asset matrix

| Finding type | Source data | Existing asset | Selected asset | Reason |
|--------------|-------------|----------------|----------------|--------|
| TIRE | Rental Health `modules.tires` | `VehicleHealthBox` → `motor-filter.svg` (+90°) | `assets/icons/vehicle-health/motor-filter.svg` | Matches Vehicle Detail health vocabulary |
| BRAKE | Rental Health `modules.brakes` | `VehicleHealthBox` → `brake.svg` | `assets/icons/vehicle-health/brake.svg` | Same |
| BATTERY | Rental Health `modules.battery` | `VehicleHealthBox` → `car-battery.svg` | `assets/icons/vehicle-health/car-battery.svg` | Same |
| DTC | Rental Health `modules.error_codes` | Telltale CEL / engine warning | `assets/icons/telltale/cel.svg` | **DTC-only** — never used as unknown telltale fallback |
| DASHBOARD_WARNING (known key) | `metadata.telltaleKey` | Per-key telltale SVG | `resolveDashboardTelltaleIconSrc(key)` → specific asset | e.g. TPMS, oil, brake-pad, battery, CEL for `check_engine_light` / `engine_limp_mode` |
| DASHBOARD_WARNING (unknown key) | `metadata.telltaleKey` | Lucide `alert-triangle` | Generic instrument-cluster warning | **UNKNOWN TELLTALE → CEL: FORBIDDEN** |
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

| Domain | Presentation | Source | Classification |
|--------|--------------|--------|----------------|
| Active health findings | `VehicleHealthFindingIcons` | `activeHealthFindings[]` | Machine-readable finding `type` / `reasonCode` |
| Operational attention | Compact reason chip | `projection.attention`, connectivity fallback, non-health `reasonBadge` | Machine-readable `FleetReasonBadge.domain` / `code` |
| Aggregate health | Heart `StatusChip` | P0.4 `healthEvaluation` | Unchanged |
| Business / readiness | Primary status `StatusChip` | Stage 2B surface mapping | Unchanged |

**Machine authority rule:** rendered localized strings are **not** domain authority. `FleetReasonBadge.domain` and projection reason codes classify health vs operational vs workflow. Regex/text pattern matching is **not** part of the contract.

Single textual health reasons (`pickModuleReason` / `resolveReasonBadgeFromUi` health domain) are **suppressed** when `domain === 'health'` and `activeHealthFindings.length > 0`. `HEALTH_RENTAL_BLOCKED` without concrete findings may still render as unique blocker attention.

### Bypassed paths (compact rows only)

- `FleetOperatorRow` / `CompactFleetDrawerVehicleRow` no longer render `reasonBadge` for health findings
- `shouldSuppressHealthReasonBadgeText()` blocks duplicate health text when icons are authoritative

### Remaining legacy (Stage 4/5)

- `pickModuleReason` / `buildReasonBadge` / `resolveReasonBadgeFromUi` still used by `fleetVehicleDisplay.ts` and Vehicle Detail surfaces
- Vehicle Detail health box / overview unchanged in Stage 3B

Tests: `vehicle-row-health-consumer-cutover.test.ts` (B1–B16 + KS MX + cross-surface matrix + N+1 structural proof).

---

## Stage 4 — Vehicle Detail alignment (2026-08)

| Field | Value |
|-------|-------|
| **Scope** | Semantic alignment — not layout redesign |
| **Header aggregate** | `resolveVehicleDetailCanonicalHealthDisplay()` — P0.4 `healthEvaluation` via `resolveHealthDisplayFromUi` (same as Fleet rows) |
| **Header finding strip** | Optional `VehicleDetailHeaderFindingIcons` from `buildVehicleDetailRowOperationalProjection().activeHealthFindings` |
| **Fallback** | When P0.4 absent: Rental Health V1 via `mapHealthSeverityDisplay` only — never overrides canonical P0.4 |
| **Telltale registry** | `DashboardWarningLightsPanel`, `QuickView`, `DetailDrawer` → `resolveDashboardTelltaleIconSrc()` (duplicate `iconForKey` removed) |
| **Rich surfaces unchanged** | `VehicleHealthBox`, `HealthErrorsView`, `HealthVehicleDetailPanel` retain module APIs and detailed layout |

### Vehicle Detail consumer graph

```
VehicleData + rentalHealth (+ dashboard_warning_lights)
  → buildVehicleDetailRowOperationalProjection()
    → healthCondition / healthEvaluability / activeHealthFindings / attention
  → resolveVehicleDetailCanonicalHealthDisplay() [header aggregate when P0.4 present]
  → VehicleDetailHeaderFindingIcons [compact summary, optional]
  → VehicleHealthBox / HealthErrorsView [module APIs — richer density]
```

### Evaluability invariants

| State | Header aggregate | Fabricated module health? |
|-------|------------------|---------------------------|
| `EVALUABLE` | P0.4 condition (good/warning/critical) | No |
| `NOT_EVALUABLE` | Evaluability label, status `unknown` | No |
| `PARTIALLY_EVALUABLE` | Evaluability label, not forced good | No |

### Icon vocabulary (single registry)

| Finding | Asset | Consumers |
|---------|-------|-----------|
| TIRE | `motor-filter.svg` (+90°) | `vehicle-health-finding-presentation`, `VehicleHealthBox` |
| BRAKE | `brake.svg` | Same |
| BATTERY | `car-battery.svg` | Same |
| DTC | `cel.svg` | DTC / error_codes domain only |
| DASHBOARD_WARNING (known) | `resolveDashboardTelltaleIconSrc(key)` → specific telltale SVG | Row icons + Vehicle Detail telltale panels |
| DASHBOARD_WARNING (unknown) | Lucide `alert-triangle` via `DashboardTelltaleIcon` | Generic instrument-warning fallback — **not CEL** |

DTC and dashboard telltales remain separate domains; both may coexist. Unknown telltale keys must never fall back to `cel.svg`.

Tests: `vehicle-detail-row-alignment.test.ts` (V1–V16 + cross-surface matrix + KS MX).

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
| `frontend/src/rental/lib/dashboard-warning-lights-display.ts` | `resolveDashboardTelltaleIconSrc` + `resolveDashboardTelltaleIcon` registry |
| `frontend/src/rental/components/health/DashboardTelltaleIcon.tsx` | Shared telltale icon renderer (specific SVG or generic `alert-triangle`) |
| `frontend/src/rental/lib/dashboard-telltale-icon-registry.test.ts` | T1–T12 telltale semantic integrity tests |
| `frontend/src/rental/lib/vehicle-row-health-consumer.ts` | Stage 3B dashboard-warning passthrough accessor |
| `frontend/src/rental/lib/fleet-reason-badge-domain.ts` | Machine-readable `FleetReasonBadge.domain` classification |
| `frontend/src/rental/lib/fleet-reason-badge-domain.test.ts` | L1–L10 language-independence tests |
| `frontend/src/rental/lib/vehicle-row-health-consumer-cutover.test.ts` | B1–B16 consumer tests + fixture matrix |
| `frontend/src/rental/lib/vehicle-detail-row-projection.ts` | Stage 4 Vehicle Detail shared projection builder |
| `frontend/src/rental/lib/vehicle-detail-row-alignment.test.ts` | V1–V16 + cross-surface matrix |
| `frontend/src/rental/components/vehicle-detail/VehicleDetailHeaderBadges.tsx` | P0.4 header + optional finding icons |

---

## STAGE 5 — FINAL CLOSURE (2026-08-27)

Production-readiness certification of the complete cross-surface contract. No new
semantics, no new UI, no backend truth changes.

### Final cross-surface authority matrix

| Surface | Business State | Operational Availability | Readiness | Health Aggregate | Active Findings | Attention | Legacy authority remaining? |
|---------|----------------|--------------------------|-----------|------------------|-----------------|-----------|------------------------------|
| Fleet Command | P0.1 (`selectOperationalStatus` → `businessState`) | P0.2 (`operationalAvailability`) | P1.5 (`getReadiness` → projection) | P0.4 (`healthEvaluation` via ui projection) | shared `activeHealthFindings[]` | canonical operational attention (`resolveRowOperationalAttentionBadge`) | No |
| Ready-to-Rent | P0.1 | P0.2 | P1.5 (readiness-primary badge) | P0.4 | shared `activeHealthFindings[]` | canonical operational attention | No |
| Vehicle Detail Header | P0.1 | P0.2 | — (readiness not asserted; `authorityPresent=false`) | P0.4 (`resolveVehicleDetailCanonicalHealthDisplay`) | shared `activeHealthFindings[]` (optional header icons) | canonical | No |
| Vehicle Detail Overview | P0.1 | P0.2 | — | P0.4 | shared projection | canonical | No |
| Vehicle Detail Health | P0.1 | — | — | P0.4 aggregate; module APIs for density | module read models (richer density, same truth) | canonical | No (module detail is intentional density, not competing authority) |
| Dashboard Warning Lights | — | — | — | — | canonical telltale read model (`dashboard_warning_lights`) | — | No (single registry `resolveDashboardTelltaleIcon`) |

### First-finding / single-reason helper audit (final)

| Helper | Verdict |
|--------|---------|
| `pickModuleReason` | **REMOVED** (Stage 5) — was reachable only on the legacy no-`uiProjection` path (test-only; every live tenant caller passes `uiProjection`). Module detail is carried by `activeHealthFindings[]`. |
| `moduleReasonText` / `REASON_MODULE_ORDER` / local `extractCount` in `fleetVehicleDisplay.ts` | **REMOVED** with `pickModuleReason`. |
| `buildReasonBadge` | **RETAINED** (legacy fallback path only, reached when `uiProjection` absent — no live tenant caller). Remaining branches: concrete blocking reason, workflow overdue (RETURN/PICKUP), visual reason, generic `HEALTH_GENERIC`. No per-module first-finding collapse remains. |
| `resolveReasonBadgeFromUi` | **RETAINED** — live consumer: `resolveFleetVehicleDisplayState` (canonical path). Output flows through `resolveRowOperationalAttentionBadge`, which suppresses health-domain badges when findings render and only passes operational/workflow domains. |
| `resolveRowOperationalAttentionBadge` | **RETAINED** — live consumers: `FleetOperatorRow`, `CompactFleetDrawerVehicleRow` (operational attention, not health). |
| `FleetVehicleDisplayState.reasonBadge` direct render | **RETAINED** for Active Rentals drawer (`ActiveRentalDrawerRowCard` via `resolveDrawerVehicleReasonBadge`) — workflow/handover surface outside the three-surface health contract. |

### Duplicate mapper audit (final)

- Health condition → tone: single authority `resolveHealthDisplayFromUi` (used by fleet display, row projection, detail projection).
- Telltale key → asset: single registry `dashboard-warning-lights-display.ts` (`resolveDashboardTelltaleIcon`); consumers render via `DashboardTelltaleIcon`. Bounded exception: `HealthErrorsView.tsx` renders `battery.svg` directly inside a battery-specific slot guarded by key-based `isBatteryTelltaleActive` — no competing key→asset mapping.
- Module severity: single authority `operativeSeverityFromRentalModule` (`operationalIssueTaxonomy`).
- Finding → icon/tooltip/aria: single authority `vehicle-health-finding-presentation.ts`.

### Language-independence (final)

Machine classification in the cross-surface contract uses typed fields only
(`type`, `severity`, `reasonCode`, `source`, `domain`, enums). Remaining
`includes(...)`/regex sites outside the contract operate on backend-origin
identifiers or raw backend reason strings (e.g. `operationalIssueTaxonomy`
issueType codes, `vehicleRuntimeStateBuilder` backend reason normalization,
`fleet-map-vehicle-mapper` legacy backend healthStatus strings) — never on
rendered localized labels. `isConcreteReason` / `isTelemetryReason` in
`fleetVehicleDisplay.ts` are presentation-hygiene filters (they gate whether raw
backend text may render, they do not classify machine state).

### N+1 / data flow certification

- Fleet Command: `buildFleetVehicleContexts` — batch `getHealth` accessor + embedded
  `dashboard_warning_lights` passthrough (`composeFleetDashboardWarningLightsAccessor`). No per-row provider or telltale fetch.
- Ready-to-Rent: same shared batched flow.
- Vehicle Detail: already-loaded `VehicleData` + the vehicle's Rental Health response
  (bounded per-detail request — intentional, single vehicle) + embedded warning lights.
- Backend passthrough (`dashboard_warning_lights` in `VehicleHealth`): read-only, produced
  from the same `Promise.allSettled` fetch used for the `vehicle_alerts` module — zero
  additional provider calls, bounded payload, additive optional field, tenant-facing DTO only.

### KS MX 2024 final matrix (fixture-shaped, read-only)

business `AVAILABLE` · operational availability `AVAILABLE` · readiness `false` ·
evaluability `EVALUABLE` · aggregate `warning` · findings = {BATTERY critical, SERVICE critical,
DTC warning ×2, BRAKE warning, TIRE warning, DASHBOARD_WARNING (TPMS)} · attention: none fabricated.
Fleet Command: business-primary "Frei/Free" + full icon strip; Ready-to-Rent: readiness-primary
"Nicht bereit" + same icon strip; Vehicle Detail: P0.4 aggregate + same finding set at higher density.
No surface reduces the set to a single "Reifen beobachten"; no surface fabricates findings.

### Stage 5 test evidence

`vehicle-cross-surface-stage5-final.test.ts`: M1–M25 canonical fixture matrix asserted across
fleet + detail projections (business/availability/readiness/evaluability/condition/findings/attention),
S1–S4 no-duplicate-health-text gates, D1–D5 domain-independence contradiction gates.
Stage 2–4 regressions: C1–C10, A1–A8, H1–H16, B1–B16, L1–L10, V1–V16, T1–T12 — all green.

### Production-readiness verdict

Cross-surface vehicle state / health workstream **CLOSED**. Authority matrix has no
tenant-facing legacy authority; first-finding collapse removed; multi-finding preserved;
DTC ≠ dashboard warning; unknown telltale → generic (never CEL); no N+1 regression.
