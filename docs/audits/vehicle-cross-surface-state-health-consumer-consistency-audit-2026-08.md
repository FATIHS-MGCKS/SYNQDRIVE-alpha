# Vehicle Cross-Surface State / Health Consumer Consistency Audit — Stage 1

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-cross-surface-state-health-consumer-consistency-audit-2026-08` |
| **Mode** | Read-only — no runtime code changes, no production mutations |
| **Workstream** | Frontend consumer consistency (post P0/P1 operational-state closure) |
| **Main SHA audited** | `b053bcc0` (`main`, includes PR #1339 P1 FINAL + PR #1344 fixture repair) |
| **Prior closure context** | P1 canonical cutovers, booking eligibility, notifications, legacy-authority cleanup, dashboard fixture repair |
| **Audit date (UTC)** | 2026-08-27 |
| **Explicit non-goals** | Reopen P0/P1 operational-state architecture; implement icon UI; change canonical semantics |

---

## 1. Executive verdict

SynqDrive’s **canonical backend projections (P0.1–P0.4) are sound and largely wired on the frontend after P1 FINAL**, but **three high-traffic surfaces still disagree in production** because they intentionally or accidentally consume **different authority layers** for counts, badges, readiness, and health findings.

**Root finding:** The inconsistencies are **not** primarily caused by missing backend data or broken fleet-map transport. They are caused by **frontend consumer contract fragmentation**:

1. **Fleet Command “Avail.” tab count** = **P0.1 business workflow** (`operationalState.status === AVAILABLE`), while **row availability badge** = **P0.2 `operationalAvailability`** (can show green “Verfügbar” for `AVAILABLE` even when P1.5 readiness is false).
2. **Ready-to-Rent drilldown** counts = **P1.5 `deriveIsReadyForRenting`** (subset of business-available), while its row **status chip** also binds **P0.2** via `resolveCanonicalFleetVehicleDisplayState` → `statusBadge` (not readiness).
3. **Compact health/issue chips** on Fleet Command and Ready-to-Rent show **at most one** reason via `resolveReasonBadgeFromUi` (canonical) or `pickModuleReason` (legacy) — **first-finding-wins**, while Vehicle Detail Overview/Health can show **all modules** via Rental Health V1 + module intelligence APIs.

**Verdict:** **FAIL on cross-surface user-visible consistency (I1, I3, I5)** despite **PASS on canonical authority presence (I10)** after P1 FINAL. Stage 2 should introduce a **shared frontend vehicle-row projection contract** without reopening P0/P1 backend semantics.

---

## 2. Surface-by-surface consumer graph

### A) Dashboard → Operations → “Bereit zur Vermietung” drilldown

| Display element | UI component | Hook / builder | Adapter / selector | API / data | Canonical source |
|-----------------|--------------|----------------|--------------------|------------|------------------|
| KPI “X bereit” | Dashboard KPI card | `resolveReadyForRentingKpiCounts` (`dashboardSliceAccess.ts`) | `slice.groups['ready-now'].count` | `buildDashboardRuntime` → `dashboardSliceBuilder.ts` | **P1.5** `VehicleRuntimeState.isReadyToRent` |
| KPI “Y nicht bereit” | same | `resolveReadyForRentingKpiCounts` | `slice.groups['available-but-not-ready'].count` | same | **P1.5** `!isReadyToRent` among `operationalStatus === 'available'` |
| Slice hint “N verfügbar · M nicht bereit” | `buildReadyToRentSlice` | `dashboardSliceBuilder.ts:447–482` | `available.length`, `notReady.length` | runtime vehicle states | **business available count** + **P1.5 not-ready count** |
| Row section (Ready vs Not ready) | drawer groups | `buildReadyToRentDrawerGroups` (`dashboardDrilldownRowDisplay.ts`) | `ready-now` / `available-but-not-ready` | same slice | **P1.5** `isReadyToRent` |
| Row **status chip** (e.g. “Verfügbar”) | `CompactFleetDrawerVehicleRow.tsx:98–112` | `resolveCanonicalFleetVehicleDisplayState` | `fleetDisplay.statusBadge` ← `resolveAvailabilityBadgeFromUi` | `GET …/fleet-map` per vehicle | **P0.2** `operationalAvailability` |
| Row **health chip** (Gut/Warnung/Kritisch) | `CompactFleetDrawerVehicleRow.tsx:93–97` | same | `fleetDisplay.healthDisplay` ← `resolveHealthDisplayFromUi` | fleet-map `healthEvaluation` | **P0.4** `healthEvaluation` + evaluability |
| Row **reason chip** (e.g. “Reifen beobachten”) | `CompactFleetDrawerVehicleRow.tsx:114–118` | `resolveDrawerVehicleReasonBadge` | `fleetDisplay.reasonBadge` ← `resolveReasonBadgeFromUi` | `uiProjection.operator/attention.primaryReason` | **Single** canonical primary reason |
| Readiness (fallback path only) | same row, no `vehicle` | `runtimeReadinessLabel` | `state.isReadyToRent` | `vehicleRuntimeStateBuilder.ts` | **P1.5** (only when fleet display absent) |

**Readiness authority chain:**

```
GET /organizations/:orgId/fleet-map (VehicleData[])
  → buildVehicleRuntimeStates (vehicleRuntimeStateBuilder.ts)
    → deriveIsReadyForRenting (rentalReadiness.ts)
      → isReadyToRent
  → buildReadyToRentSlice (dashboardSliceBuilder.ts)
    → groups ready-now | available-but-not-ready
```

**Badge authority chain (parallel, not readiness):**

```
VehicleData + healthEvaluation + connectivityRuntime
  → buildFleetVehicleUiProjection (fleet-vehicle-ui-projection.ts)
  → resolveCanonicalFleetVehicleDisplayState (fleetVehicleDisplay.ts)
    → resolveAvailabilityBadgeFromUi (fleet-p1-3-display.ts) → statusBadge
    → resolveHealthDisplayFromUi → healthDisplay
    → resolveReasonBadgeFromUi → reasonBadge (max 1)
```

---

### B) Fleet → Fleet Command vehicle list

| Display element | UI component | Hook / builder | Adapter / selector | API / data | Canonical source |
|-----------------|--------------|----------------|--------------------|------------|------------------|
| Tab count **“Avail. N”** | `FleetCommandPanel` tabs | `FleetCommandView` → `resolveFleetTabCountsFromRuntime` | `state.operationalStatus === 'available'` | `dashboardRuntime.vehicleStates` | **P0.1 business workflow** via `mapCanonicalOperationalStatusToRuntime` |
| Tab filter membership | `applyFleetCommandFilters` | `fleet-command-filters.ts` | `resolveFleetCommandTabForVehicle` → `selectIsCurrentlyAvailable` | `VehicleData.operationalState` | **P0.1 business workflow** |
| Row **availability badge** | `FleetOperatorRow.tsx:61–68` | `resolveFleetVehicleDisplayState` + `uiProjection` | `statusBadge` ← `resolveAvailabilityBadgeFromUi` | fleet-map | **P0.2** `operationalAvailability` |
| Row **health chip** | `FleetOperatorRow.tsx:69` | same | `healthDisplay` ← `resolveHealthDisplayFromUi` | fleet-map `healthEvaluation` | **P0.4** |
| Row **reason chip** | `FleetOperatorRow.tsx` | same | `reasonBadge` | `resolveReasonBadgeFromUi` or legacy `buildReasonBadge` | **Single** reason |
| Row background severity | `FleetCommandPanel` | `resolveFleetCommandRowSeverity` (`fleet-operator-panel.ts:137`) | blends attention, rental_blocked, modules, visual | fleet-map + rental health map | **Mixed**: P0.1 attention + Rental Health V1 modules + legacy visual |
| Sort order | fleet list | `fleetOperationalSortScore` | `primaryStatus` from display resolver | display state | **Composite** operational sort |

**Avail. count chain:**

```
dashboardRuntime.vehicleStates[].operationalStatus
  → resolveFleetTabCountsFromRuntime (runtimeSliceConsistency.ts:60–77)
    → Available: filter operationalStatus === 'available'
```

**Documented semantic** (`fleet-command-filters.ts:13–17`): tabs use **business workflow**, not P0.2 availability or connectivity.

---

### C) Vehicle Detail → Overview / Health

| Display element | UI component | Hook / builder | Adapter / selector | API / data | Canonical source |
|-----------------|--------------|----------------|--------------------|------------|------------------|
| Header **connection badge** | `VehicleConnectionBadge` | `resolveVehicleDetailConnectivityPresentation` | P1.2 ui projection / connectivity DTO | fleet-map `connectivityRuntime` | **P0.1** connectivity |
| Header **health chip** | `VehicleHealthChip` | `useEffectiveHealth` + `resolveHealthDisplayFromUi` | prefers `healthEvaluation` when present | fleet-map + `GET …/rental-health` | **P0.4** when `healthEvaluation` set; else **Rental Health V1** fallback |
| Overview **VehicleHealthBox** | `VehicleHealthBox` / mapper | `useVehicleHealthBoxData` | `vehicle-health-box.mapper.ts` | rental-health + module APIs (tires, brakes, battery, DTC, dashboard warnings) | **Rental Health V1** + per-module intelligence |
| Health tab panel | `HealthVehicleDetailPanel` / `HealthErrorsView` | module hooks | per-domain adapters | `rental-health`, `health/summary`, `dashboardWarningLights`, etc. | **Full module enumeration** |
| Brakes / tires / battery compact bars | `SegmentedHealthIndicator` in `VehicleHealthBox` | `health-segment-display.ts` | module-specific mappers | module APIs | Per-domain canonical module state |
| Dashboard warning lights | `DashboardWarningLightsPanel` | `dashboard-warning-lights-display.ts` | telltale presentation | `vehicleIntelligence.dashboardWarningLights` | **DashboardWarningLightsService** read model |

**Dual health layer on Vehicle Detail header:**

```typescript
// VehicleDetailHeaderBadges.tsx:107–109
const canonicalHealth = vehicle.healthEvaluation
  ? resolveHealthDisplayFromUi(buildFleetVehicleUiProjection(vehicle, { locale }))
  : null;
// Falls back to mapHealthSeverityDisplay(rentalHealth) when healthEvaluation absent
```

Overview/Health tab does **not** use P0.4 alone; it renders **all active Rental Health modules** and separate telltale/DTC surfaces.

---

## 3. Availability / readiness authority matrix

| Concept | Code symbol / field | Authority layer | Used by |
|---------|---------------------|-----------------|---------|
| `businessState` | `operationalState.status` / `VEHICLE_OPERATIONAL_STATUS` | P0.1 business workflow | Fleet tab filter/count, runtime `operationalStatus`, readiness precondition |
| `operationalAvailability` | `vehicle.operationalAvailability.state` | P0.2 projection slice | Row `statusBadge` (“Verfügbar”, “Prüfung erforderlich”, …) |
| Ready / not ready | `deriveIsReadyForRenting` → `isReadyToRent` | P1.5 dashboard runtime | Ready-to-Rent KPI, drawer groups, popup readiness pill |
| Available (Fleet Avail.) | `operationalStatus === 'available'` | P0.1 mapped to runtime | Fleet Command tab count + filter |
| Rental eligibility | `rental_blocked`, `blocking_reasons`, P1.6 booking gates | Rental Health V1 + booking adapters | Booking picker, readiness blockers |
| Attention state | `connectivityRuntime.attentionState`, `ui.attention` | P0.1 / P1.2 | Row severity tint, reason badge fallback |
| Connectivity verification | `NEEDS_VERIFICATION`, `CONNECTIVITY_VERIFICATION_REQUIRED` | P0.2 + connectivity | Blocks P1.5 readiness; may still show business-available tab |

### Explicit answers (Section B)

**1. Is Fleet Command “Avail.” based on businessState, P0.2, rental eligibility, or something else?**

**businessState (P0.1).** `resolveFleetTabCountsFromRuntime` counts `state.operationalStatus === 'available'`, which is mapped from `selectOperationalStatus(vehicle)` / `operationalState.status`. It is **not** P0.2 `operationalAvailability`, not P1.5 readiness, not rental eligibility.

**2. What makes Ready-to-Rent produce “4 bereit · 2 nicht bereit”?**

`buildReadyToRentSlice` filters runtime states where `operationalStatus === 'available'`, then splits by `isReadyToRent` (P1.5). Example: 6 business-available vehicles → 4 pass `deriveIsReadyForRenting`, 2 fail (dirty, `NEEDS_VERIFICATION`, health blockers, soft blocks, etc.). The hint string uses `available.length` and `notReady.length` (`dashboardSliceBuilder.ts:467–470`).

**3. Why can NOT_READY still render green “Verfügbar”?**

**Intentional authority split.** `CompactFleetDrawerVehicleRow` binds `fleetDisplay.statusBadge` (P0.2), not `rentalDisplay` or `isReadyToRent`. A vehicle can have P0.2 `operationalAvailability === AVAILABLE` (green “Verfügbar”) while P1.5 `isReadyToRent === false` (placed in “Nicht bereit” group). Readiness is conveyed by **group placement**, not the green chip.

**4. Are Fleet Command counts and row badges driven by the same authority?**

**No.** Count/filter = P0.1 business.available. Row badge = P0.2 `operationalAvailability`. A vehicle in Avail. tab can show “Prüfung erforderlich” (NEEDS_VERIFICATION) on the row.

**5. Are Ready-to-Rent counts and row badges driven by the same authority?**

**No.** Counts/groups = P1.5 readiness. Row status chip = P0.2 availability badge.

**6. Are any frontend consumers still translating AVAILABLE / NEEDS_VERIFICATION / BLOCKED / UNKNOWN independently?**

**Yes, by design across layers** (not duplicate P0.2 re-derivation on canonical path):

| Consumer | Translation location |
|----------|---------------------|
| P0.2 badge labels | `mapOperationalAvailabilityPresentation` (`operational-availability/presentation.ts`) |
| P1.5 readiness gate | `deriveIsReadyForRenting` checks `operationalAvailability !== AVAILABLE` |
| Legacy path (tests only on live surfaces post-P1 FINAL) | `resolveOperationalStatusBadge`, `buildReasonBadge`, `pickModuleReason` in `fleetVehicleDisplay.ts` when `uiProjection` absent |
| Booking eligibility | `booking-operational-p1-6-cutover` adapters |

Live production calls per P1 FINAL: **11/11 use `uiProjection`** via `resolveCanonicalFleetVehicleDisplayState` or explicit `buildFleetVehicleUiProjection`.

**7. Remaining local / legacy fallbacks**

| Fallback | Location | Live? |
|----------|----------|-------|
| `pickModuleReason` first-finding-wins | `fleetVehicleDisplay.ts:545–559` | Only when `uiProjection` absent (legacy/tests) |
| `buildReasonBadge` rental health modules | `fleetVehicleDisplay.ts:562–606` | Legacy path |
| `resolveHealthDisplay` from `healthStatus` / rental health | `fleetVehicleDisplay.ts:726–732` | When `healthEvaluationBadge` false and no uiProjection |
| `resolveOperationalStatusBadge` business-only | `fleetVehicleDisplay.ts:613–638` | When `operationalAvailabilityBadge` false |
| `useEffectiveHealth` Rental Health V1 | `FleetContext.tsx` | Vehicle Detail header fallback; module chips elsewhere |
| `visual.isBlocked` for rental display | bypassed on canonical path per P1 FINAL domain separation | N/A on canonical path |
| `fleetSignalAgeMs` / `resolveTelemetryFreshness` | `fleetVehicleDisplay.ts` | Bypassed when `uiProjection` set |
| Runtime row readiness labels | `CompactFleetDrawerVehicleRow` fallback without `vehicle` | Edge case only |

---

## 4. Health authority matrix

| Finding / display | Fleet Command row | Ready-to-Rent row | Vehicle Detail Overview | Vehicle Detail Health tab |
|-------------------|-------------------|-------------------|-------------------------|---------------------------|
| Aggregate health label | P0.4 `healthEvaluation` → `resolveHealthDisplayFromUi` | same | Rental Health V1 + P0.4 header | Rental Health V1 summary |
| Health evaluability | P0.4 in ui projection | same | `mapDataCoverageDisplay` | explicit in Health tab |
| Tires finding | At most 1 chip via reason/legacy `pickModuleReason` | same | `VehicleHealthBox` tires segment + detail | Tire module panel |
| Brakes finding | same | same | brakes segment | Brake module panel |
| Battery finding | same | same | battery segment | Battery module panel |
| DTC / error codes | same (precedence: error_codes first in legacy order) | same | faults stat + DTC panel | HealthErrorsView DTC |
| Dashboard warnings | not shown as icons | not shown | telltale quick view block | `DashboardWarningLightsPanel` |
| Attention “Prüfung erforderlich” | via P0.2 badge or `operator.primaryReason` chip | same | connectivity / readiness context | connectivity + health separate |

**Classification:** Fleet Command and Ready-to-Rent use **(b) different presentation of same P0.4 aggregate** for the heart chip, but **(c) locally reconstructed single-finding chips** for reason text. Vehicle Detail uses **(a) full canonical health projections per module** plus **(d) legacy Rental Health V1** on header fallback.

**`REASON_MODULE_ORDER` (legacy chip precedence):** `error_codes` > `service_compliance` > `brakes` > `tires` > `battery` (`fleetVehicleDisplay.ts:497–504`).

**Canonical chip (`resolveReasonBadgeFromUi`):** returns only `operator.primaryReason` OR `attention.primaryReason` — still **one label** (`fleet-p1-3-display.ts:118–128`).

---

## 5. Six-vehicle production comparison matrix

**Production live snapshot:** **NOT PERFORMED** in this Cloud Agent runtime (no authenticated org-scoped prod API session). Values below synthesize **prior read-only forensic audits** + **code-derived consumer behavior** at SHA `b053bcc0`. Treat as **expected consumer divergence**, not a live timestamped prod dump.

| Vehicle | Backend canonical (documented) | Fleet Avail. tab | Fleet row badge (P0.2) | Ready-to-Rent group | Compact reason chip (typical) | Vehicle Detail |
|---------|-------------------------------|------------------|------------------------|---------------------|------------------------------|----------------|
| **KS MX 2024** | P0.2 AVAILABLE post-consent; multi-module Rental Health warnings/critical (service, battery, tires, DTC per history) | In Avail. (business AVAILABLE) | “Verfügbar” if P0.2 AVAILABLE | Often **not ready** if service/health blockers | **One** of: service overdue, tire watch, etc. (precedence) | **All** modules visible |
| **KS MS 661** | Post-backfill: ACTIVE link, P0.2 AVAILABLE | Avail. | “Verfügbar” | Ready if clean + no blockers | primaryReason or module pick | Full modules |
| **KS FH 660E** | Same as KS MS 661 | Avail. | “Verfügbar” | Context-dependent | single chip | Full modules |
| **HMÜ C 215** | P0.2 NEEDS_VERIFICATION (mapping gap audit); connectivity UNKNOWN | Avail. (business) | “Prüfung erforderlich” | **Not ready** (P0.2 ≠ AVAILABLE) | connectivity primary reason | connectivity + health separate |
| **WOB L 7503** | NEEDS_VERIFICATION (offline telemetry) per consent audit | Avail. | “Prüfung erforderlich” | Not ready | verification / offline reason | full health if evaluable |
| **WOB L 9755** | Same pattern as WOB L 7503 | Avail. | “Prüfung erforderlich” | Not ready | single chip | full modules |

**Observed prod pattern explaining “Avail. 6” vs “4 bereit · 2 nicht bereit”:**

- **6** = all vehicles with `operationalState.status === AVAILABLE` (includes NEEDS_VERIFICATION and not-ready).
- **4 + 2** = same 6 business-available vehicles split by P1.5 readiness (4 ready, 2 not ready).
- Numbers are **consistent with code** but **confusing to operators** because labels sound synonymous (“Avail.” vs “bereit”).

---

## 6. KS MX 2024 finding-loss forensic trace

**Vehicle ID (documented):** `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`  
**Org (documented):** `faa710c9-6d91-4079-a7d5-91fdccdec14a`

### Active findings available (historical prod + code paths)

From ChangesView / prior audits, KS MX 2024 has concurrently exhibited:

| Domain | Example finding | Backend / Rental Health source |
|--------|-----------------|-------------------------------|
| Service | Service überfällig (critical) | `service_compliance` module |
| Battery | Batterie-Warnung / low voltage | `battery` module + HM signals |
| Tires | Reifen beobachten | `tires` module warning |
| DTC | Active fault codes | `error_codes` module |
| Dashboard lights | Telltales via HM | `DashboardWarningLightsService` |
| Connectivity | Resolved post-consent backfill | `operationalAvailability` AVAILABLE |

### What each surface receives

| Surface | Data loaded | Findings surfaced |
|---------|-------------|-------------------|
| Vehicle Detail Health | Full rental-health map + module APIs + telltales | **All** modules in panels and overview box |
| Vehicle Detail header chip | P0.4 aggregate label (+ tooltip reasons from modules when evaluable) | **One** aggregate label; tooltip may list multiple |
| Fleet Command row | fleet-map slices + rental health in context | **One** `reasonBadge` text; heart chip = aggregate P0.4 |
| Ready-to-Rent row | same as Fleet row display resolver | **One** reason chip |

### Why only “Reifen beobachten” may appear in compact row

**Not transport loss.** Rental Health modules are present in `healthMap`. Loss happens in **selection/rendering**:

1. **Canonical path:** `resolveReasonBadgeFromUi` returns only `operator.primaryReason` or `attention.primaryReason` — if operator precedence selected a tire-related reason, only that string renders.
2. **Legacy path:** `pickModuleReason` walks `REASON_MODULE_ORDER`. If `error_codes` and `service_compliance` are not `critical`/`warning` operative modules but `tires` is `warning`, tires wins among modules — producing **“Reifen beobachten”** (`moduleReasonText`, `fleetVehicleDisplay.ts:533–536`).
3. **No multi-finding array** exists on fleet row contract — `FleetVehicleDisplayState.reasonBadge` is `| null` singular.

**Conclusion:** Other findings are **not dropped server-side**; they are **suppressed by single-chip contract and precedence**, while Vehicle Detail renders the full module set.

---

## 7. Existing health icon / component inventory (Vehicle Detail)

| Domain | Component / file | Icon source | Condition input | Color / severity helper | Reusable in compact fleet row? |
|--------|------------------|-------------|-----------------|-------------------------|--------------------------------|
| **Brakes** | `VehicleHealthBox` module row; `HealthVehicleDetailPanel` | `assets/icons/vehicle-health/brake.svg` | Rental Health `brakes` + `BrakeHealthSummary` | `segmentFromHealthState`, `health-segment-display.ts` | **Yes** — SVG + segment tone |
| **Tires** | `VehicleHealthBox` | `assets/icons/vehicle-health/motor-filter.svg` (rotated) | `tireUiStatus`, tire summary API | `tireStatusToSegment` | **Yes** |
| **Battery** | `VehicleHealthBox` | `assets/icons/vehicle-health/car-battery.svg` | canonical battery adapter / rental health battery | `resolveCanonicalBatteryUiSeverity`, `mapCanonicalBatteryUiSeverityToScore` | **Yes** |
| **DTC / error codes** | Health tab DTC panel; faults stat in box | `assets/icons/telltale/cel.svg` (MIL) | `error_codes` module, DTC APIs | `rentalHealthStateToTone`, module state | **Yes** — cel icon for powertrain/emergency |
| **Dashboard warnings** | `DashboardWarningLightsPanel`, overview quick view | `assets/icons/telltale/*.svg` (oil, cel, brake-pad, tire-pressure, battery) | `dashboard-warning-lights-display.ts` | `telltaleTileStatusLabel`, tone per telltale | **Yes** — per-telltale icons |
| **Aggregate health chip** | `HealthStatusChip` / `StatusChip` | Lucide `heart` | P0.4 or Rental Health aggregate | `healthChipStateFromTone` | Already used in fleet rows |
| **3-bar module indicator** | `SegmentedHealthIndicator.tsx` | bars (no domain icon) | `SegmentLevel` 0–3 | `TONE_CLASS` in component | Partial — compact but not domain-distinct |

**Fleet rows today:** heart icon + text chips only; **no per-domain icons** despite assets existing.

---

## 8. Legacy / local fallback inventory

See Section 3 table. Post-P1 FINAL, live tenant surfaces call `resolveCanonicalFleetVehicleDisplayState` or pass `uiProjection` explicitly. Legacy paths remain for:

- Unit tests without full projection fixtures
- Deprecated helpers (`countFleetVehiclesBySelector`, `resolveOperationalStatusBadge`)
- Vehicle Detail header when `healthEvaluation` absent
- `CompactFleetDrawerVehicleRow` runtime-only fallback branch

**Must not revive:** `visual.isBlocked` driving readiness/rental display on canonical path (fixed PR #1339).

---

## 9. Invariant results (I1–I10)

| ID | Statement | Result | Evidence |
|----|-----------|--------|----------|
| **I1** | Same vehicle, same timestamp: identical operational availability across three surfaces | **FAIL** | Fleet Avail. tab uses P0.1; badges use P0.2; readiness uses P1.5 |
| **I2** | Counts and rows within one consumer share authority | **PARTIAL** | Ready-to-Rent: KPI/groups align (P1.5) but row badge is P0.2. Fleet: tab count P0.1 vs badge P0.2 |
| **I3** | NOT_READY must not get misleading green “Verfügbar” | **FAIL** | By design when P0.2 AVAILABLE; chip does not reflect P1.5 |
| **I4** | Health severity/evaluability identical across consumers | **PARTIAL** | P0.4 matches on fleet rows when `healthEvaluation` present; Vehicle Detail header falls back to Rental Health V1 |
| **I5** | Compact view may truncate text but not replace multiple findings with one arbitrary chip | **FAIL** | `resolveReasonBadgeFromUi` + `pickModuleReason` enforce single chip |
| **I6** | Health icon only when canonical finding exists | **PASS** (future icons N/A today) | Current heart chip always shown when health display resolves; domain icons not implemented |
| **I7** | Icon severity from one shared mapping | **PARTIAL** | P0.4 presentation shared on fleet; module icons use `health-segment-display` / telltale mappers — not wired to fleet rows |
| **I8** | Connectivity/offline must not fabricate health condition | **PASS** | P0.4 evaluability gates; `resolveHealthDisplayFromUi` returns non-evaluable label |
| **I9** | Health must not fabricate operational readiness | **PASS** | P1.5 uses explicit readiness inputs; health blockers via `reasonBlocksReadyForRenting` |
| **I10** | Legacy fields never outrank P0/P1 projections | **PASS** on live canonical path | P1 FINAL B=0 without uiProjection on production call sites |

---

## 10. Test coverage gaps

### Existing tests (partial cross-surface)

| Test file | Coverage |
|-----------|----------|
| `connectivity-cross-surface-regression.test.ts` | Telemetry / connectivity consistency |
| `fleet-operational-p1-3-cutover.test.ts` | P0.2 badge + P0.4 health on fleet row |
| `vehicle-detail-operational-p1-4-cutover.test.ts` | Vehicle detail vs fleet row availability |
| `dashboard-operational-p1-5-cutover.test.ts` | P1.5 readiness vs P0.2; cross-surface fleet consistency |
| `booking-operational-p1-6-cutover.test.ts` | Booking vs P0.2 |
| `vehicle-operational-state-p1-final-closure.test.ts` | Handover canonical authority |
| `runtimeSliceConsistency.test.ts` | KPI vs drawer counts within dashboard |
| `dashboardDrilldownRowDisplay.test.ts` | Ready-to-rent drawer display |

### Missing tests (Stage 2 targets)

1. **Single fixture → three-surface snapshot** asserting `operationalAvailability`, `isReadyToRent`, `healthEvaluation`, and **`activeHealthFindings[]`** for Fleet row, Ready-to-Rent row, Vehicle Detail header.
2. **Multi-module vehicle** proving compact row exposes finding set (or ordered icons), not one arbitrary module string.
3. **I3 negative test:** NOT_READY vehicle must not show readiness-green chip if Stage 2 changes chip semantics.
4. **Fleet Avail. count vs P0.2 badge** intentional documentation test (or changed contract).
5. **KS MX 2024-shaped fixture** with service + battery + tires + DTC all warning — assert no silent dropping.

---

## 11. Root causes ranked

### P0 (operator confusion / trust)

1. **Homonymous labels** — “Avail.”, “Verfügbar”, “bereit” map to different authorities (P0.1, P0.2, P1.5).
2. **NOT_READY + green Verfügbar** — status chip shows P0.2 while readiness is in group only (I3 fail).
3. **Single reason chip** hides concurrent health findings (I5 fail).

### P1 (contract / architecture debt)

4. **No shared `activeHealthFindings[]` projection** for compact surfaces.
5. **Vehicle Detail dual health** — P0.4 header vs Rental Health V1 overview/modules without unified compact export.
6. **Fleet row severity** mixes attention, rental health modules, and legacy visual signals beyond P0.4.

### P2 (quality / maintainability)

7. Legacy `pickModuleReason` path still in codebase (test-only on live surfaces).
8. Missing cross-surface contract tests.
9. Dashboard hint mixes `available.length` (business) with not-ready (P1.5) without explicit labeling.

---

## 12. Proposed shared consumer contract (Stage 2 recommendation only)

Introduce **`VehicleRowOperationalProjection`** (frontend-only adapter output) consumed by Fleet Command, Ready-to-Rent rows, and optionally Vehicle Detail compact header.

```typescript
interface ActiveHealthFinding {
  type: 'TIRE' | 'BRAKE' | 'BATTERY' | 'DTC' | 'DASHBOARD_WARNING' | 'SERVICE' | 'COMPLIANCE';
  severity: 'good' | 'warning' | 'critical' | 'unknown';
  reasonCode: string;           // canonical code, not rendered German text
  localizationKey: string;      // i18n key for label
  count?: number;                 // e.g. DTC count
  source: 'rental_health' | 'health_evaluation' | 'dashboard_warnings' | 'operational_projection';
}

interface VehicleRowOperationalProjection {
  vehicleId: string;
  projectionTimestamp: string;  // fleet-map fetchedAt or server asOf

  businessState: 'AVAILABLE' | 'RENTED' | 'RESERVED' | 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'UNKNOWN';

  operationalAvailability: {
    state: 'AVAILABLE' | 'NEEDS_VERIFICATION' | 'UNAVAILABLE' | 'UNKNOWN';
    localizationKey: string;
    tone: StatusTone;
  };

  readiness: {
    isReadyToRent: boolean;
    localizationKey: string;      // e.g. fleet.readiness.ready | notReady
    tone: StatusTone;
  };

  connectivity: {
    overallState: string;
    attentionState: string;
    telemetryState: string;
    localizationKey: string;
  };

  healthEvaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN';

  healthCondition: {
    state: 'good' | 'warning' | 'critical' | 'unknown';
    localizationKey: string;
    tone: StatusTone;
  };

  attention: {
    state: 'NONE' | 'WATCH' | 'ACTION_REQUIRED' | 'CRITICAL';
    primaryReasonCode: string | null;
    localizationKey: string | null;
  };

  activeHealthFindings: ActiveHealthFinding[];  // ordered by canonical severity, no first-wins drop
}
```

**Separation rules:**

- Never derive `readiness.isReadyToRent` from `healthCondition` alone.
- Never derive `healthCondition` from connectivity offline alone (respect evaluability).
- `activeHealthFindings` populated from Rental Health operative modules + dashboard warnings + DTC; P0.4 aggregate remains separate summary.
- All UI strings via `localizationKey`; German production text is never SoT.

**Compact row rendering (Stage 3+):** map `activeHealthFindings` to existing telltale/vehicle-health SVGs with shared `health-segment-display` / `rentalHealthStateToTone` mappers.

---

## 13. Recommended staged implementation plan

| Stage | Scope | Outcome |
|-------|-------|---------|
| **Stage 2a** | Add `buildVehicleRowOperationalProjection()` adapter + tests only | Contract + fixtures; no UI change |
| **Stage 2b** | Align labels: Fleet “Avail.” tooltip / rename vs Ready-to-Rent “bereit” | Reduce P0 operator confusion |
| **Stage 2c** | Ready-to-Rent row chip: show readiness badge OR dual-chip (availability + readiness) | Fix I3 |
| **Stage 3** | Fleet + Ready-to-Rent compact domain icons from `activeHealthFindings` | Fix I5/I6/I7 |
| **Stage 4** | Vehicle Detail header consumes same projection for chip strip | Fix I4 partial |
| **Stage 5** | Cross-surface contract test suite in CI | Prevent regression |

---

## 14. Files likely to change (future stages)

| Stage | Files |
|-------|-------|
| Adapter | `frontend/src/rental/lib/vehicle-row-operational-projection.ts` (new), `fleet-vehicle-ui-projection.ts`, `fleetVehicleDisplay.ts` |
| Fleet row UI | `FleetOperatorRow.tsx`, `fleetOperatorUi.ts` |
| Dashboard row UI | `CompactFleetDrawerVehicleRow.tsx`, `dashboardDrilldownRowDisplay.ts` |
| Vehicle detail | `VehicleDetailHeaderBadges.tsx`, `vehicle-detail-operational-display.ts` |
| i18n | `frontend/src/rental/i18n/translations/{de,en}.ts` |
| Tests | new `vehicle-row-operational-projection.test.ts`, extend `dashboard-operational-p1-5-cutover.test.ts` |
| Icons wiring | reuse `assets/icons/vehicle-health/*`, `assets/icons/telltale/*`, `SegmentedHealthIndicator` patterns |

---

## 15. Files / domains that must NOT change

| Domain | Reason |
|--------|--------|
| `backend/src/modules/vehicles/operational/projection/*` | P0.2 canonical semantics closed |
| `vehicle-operational-projection.builder.ts` `selectPrimaryReason` precedence | Backend SoT |
| `deriveIsReadyForRenting` business rules | P1.5 closed |
| `fleet-command-filters.ts` tab = business workflow | Unless explicit product decision to remap tabs |
| DIMO connectivity / segments architecture | Out of scope |
| DB schema / Prisma models | Audit-only workstream |
| Weakening UNKNOWN / NEEDS_VERIFICATION behavior | Explicit constraint |

---

## 16. Risks and rollback boundaries

| Risk | Mitigation |
|------|------------|
| Operators trained on “Verfügbar” meaning “ready” | Stage 2b labeling + readiness chip before icons |
| Icon clutter on narrow rows | Cap visible icons; overflow “+N” with tooltip listing `activeHealthFindings` |
| Performance (extra mapping per row) | Build projection once in `buildFleetVehicleContexts` |
| Rental Health / P0.4 drift | Adapter reads both; P0.4 wins for aggregate, modules for findings list |
| Rollback | UI-only stages revert independently; adapter can ship dark behind feature flag |

**Rollback boundary:** Stages 2c–3 are reversible UI-only. Do not rollback P1 FINAL canonical authority wiring.

---

## Appendix H — Production read-only evidence status

| Item | Status |
|------|--------|
| Live API queries for six vehicles | **Not executed** (no prod auth in audit runtime) |
| Prior forensic audits referenced | `dimo-vehicle-provider-consent-backfill-phase1-2026-08.md`, `hmue-c215-operational-state-forensic-2026-08.md`, ChangesView KS MX entries |
| Distinction preserved | Backend canonical from audits; frontend derivation from code trace; visible UI = composition of both |

---

## Appendix — SynqDrive Code documentation

| Doc | Updated |
|-----|---------|
| Changes (master UI) | **Yes** — Stage 2A + Stage 2B entries |
| Architektur (master UI) | **Yes** — `VEHICLE_ROW_OPERATIONAL_PROJECTION_CONTRACT_2026-08.md` |

---

## Stage 2A implementation (2026-08-27)

| Field | Value |
|-------|-------|
| **Phase** | Shared frontend contract — no visible UI cutover |
| **Adapter** | `frontend/src/rental/lib/vehicle-row-operational-projection.ts` |
| **Integration** | `buildFleetVehicleContexts()` → `rowOperationalProjection`; `FleetCommandView` passes P1.5 readiness when `dashboardRuntime` present |
| **Tests** | `vehicle-row-operational-projection.test.ts` — fixtures A–F, invariants C1–C10, six production-shaped vehicles |
| **Architecture** | `architecture/VEHICLE_ROW_OPERATIONAL_PROJECTION_CONTRACT_2026-08.md` |

**Stage 2A confirms:** `activeHealthFindings[]` preserves concurrent module findings (KS MX 2024-shaped fixture ≥ 6 findings) without `pickModuleReason` / single `primaryReason` collapse.

*Stage 1 audit complete. Stage 2A adds contract + tests only — visible UI unchanged.*

---

## Stage 2B implementation (2026-08-27) — availability/readiness display cutover

| Field | Value |
|-------|-------|
| **Phase** | User-visible availability/readiness semantics only |
| **Display adapter** | `frontend/src/rental/lib/vehicle-row-operational-display.ts` → `getVehicleRowOperationalDisplay()` |
| **Fleet Command authority** | **P0.1 business workflow** — tab filter/count unchanged |
| **Fleet Command tab label** | Renamed **Avail.** → **Frei** / **Free** (`fleet.command.tab.businessAvailable*`) |
| **Fleet Command row badge** | Primary chip = **businessState** (`fleet.businessState.*`), not P0.2 `statusBadge` |
| **Ready-to-Rent row badge** | Primary chip = **readiness** (P1.5), never green P0.2 “Verfügbar” when `isReadyToRent === false` |
| **Tests** | `vehicle-row-operational-display.test.ts` — invariants A1–A8, six-vehicle matrix |
| **Non-goals honored** | No health finding icons; no Vehicle Detail visual redesign; no P0/P1 backend changes |

### Fleet Command authority decision

**Keep P0.1 business workflow** for tab membership and counts (`resolveFleetTabCountsFromRuntime` → `operationalStatus === 'available'`). Tab label renamed to disambiguate from rental readiness (“Bereit zur Vermietung”).

### Ready-to-Rent authority decision

**P1.5 `isReadyToRent`** drives primary row status chip via `getVehicleRowOperationalDisplay({ surface: 'ready_to_rent' })`. Operational availability may still exist on the projection but does not masquerade as readiness.

### i18n keys (Stage 2B)

| Key | DE | EN | Dimension |
|-----|----|----|-----------|
| `fleet.command.tab.businessAvailable` | Frei | Free | Fleet tab (P0.1) |
| `fleet.businessState.available` | Frei | Free | Fleet row business badge |
| `fleet.rowProjection.readiness.ready` | Bereit | Ready | Readiness |
| `fleet.rowProjection.readiness.notReady` | Nicht bereit | Not ready | Readiness |
| `fleet.rowProjection.readiness.blocked` | Blockiert | Blocked | Readiness (blocked) |
| `fleet.operationalAvailability.needsVerification` | Prüfung erforderlich | Check required | Readiness / P0.2 |
| `fleet.healthEvaluation.notEvaluable` | Nicht bewertbar | Not evaluable | Readiness |

Reused: `fleet.operationalAvailability.*`, `fleet.healthEvaluation.notEvaluable`, `fleet.rowProjection.readiness.*` (Stage 2A).

### Six-vehicle before/after matrix (fixture-shaped)

| Vehicle | businessState | operationalAvailability | readiness | Fleet Command badge (after) | Ready-to-Rent badge (after) | Before confusion |
|---------|---------------|-------------------------|-----------|----------------------------|----------------------------|------------------|
| KS MX 2024 | AVAILABLE | AVAILABLE | true | Frei | Bereit | Row could show P0.2 Verfügbar |
| KS MS 661 | AVAILABLE | AVAILABLE | true | Frei | Bereit | Same |
| KS FH 660E | AVAILABLE | AVAILABLE | true | Frei | Bereit | Same |
| HMÜ C 215 | AVAILABLE | NEEDS_VERIFICATION | false | Frei | Prüfung erforderlich | Was in “Nicht bereit” with green Verfügbar |
| WOB L 7503 | AVAILABLE | NEEDS_VERIFICATION | false | Frei | Prüfung erforderlich | Same |
| WOB L 9755 | AVAILABLE | NEEDS_VERIFICATION | false | Frei | Prüfung erforderlich | Same |

**Note:** Fleet Command “Frei” count (P0.1 business-available) may legitimately exceed Ready-to-Rent “bereit” count (P1.5 subset) — semantic truth preserved.

### Invariant test results (A1–A8)

| ID | Result |
|----|--------|
| A1 | PASS — tab count matches `applyFleetCommandFilters` business AVAILABLE membership |
| A2 | PASS — ready/not-ready drawer groups align with `isReadyToRent` |
| A3 | PASS — readiness=false never gets success-tone P0.2 “Verfügbar” primary badge |
| A4 | PASS — business AVAILABLE ≠ readiness true |
| A5 | PASS — operational AVAILABLE ≠ readiness true |
| A6 | PASS — Fleet AVAILABLE count can differ from ready count |
| A7 | PASS — `primaryRowStatusDimension` differs by surface (`business` vs `readiness`) |
| A8 | PASS — labels from shared i18n keys, not local raw-state maps |

### Legacy cleanup boundary (report only — not removed)

| Helper | Status |
|--------|--------|
| `resolveAvailabilityBadgeFromUi` / `statusBadge` in fleet display | Still used for data-quality hints / Vehicle Detail; Fleet Command row primary chip no longer binds it |
| `runtimeReadinessLabel` in `CompactFleetDrawerVehicleRow` | Fallback when fleet vehicle absent |
| `pickModuleReason` / `buildReasonBadge` | Unchanged — Stage 3 health UI |

### Stage 3 boundary

- Replace single reason chip with `activeHealthFindings[]` domain icons (tire/brake/battery/DTC/telltale)
- Vehicle Detail header chip strip from shared projection
- Legacy `pickModuleReason` cleanup after all consumers cut over

*Stage 2B complete — display semantics cut over; health finding UI deferred to Stage 3.*
