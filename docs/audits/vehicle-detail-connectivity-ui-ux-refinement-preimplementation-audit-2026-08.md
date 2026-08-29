# P1.8 — Vehicle Detail Connectivity UX/UI Refinement — Pre-Implementation Audit

| Field | Value |
|-------|-------|
| **Audit date** | 2026-08-27 UTC |
| **Mode** | Read-only pre-implementation |
| **Repository** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **Scope** | Vehicle Detail connectivity presentation (Overview card + dedicated connectivity surface) |
| **Architecture constraint** | P1.1–P1.7 operational-state closure is authoritative — **no semantic reopening** |

---

## 1. Executive verdict

### Classification: **B — presentation + missing projection exposure**

| Dimension | Finding |
|-----------|---------|
| Backend canonical runtime | **Sound** — `VehicleConnectivityRuntimeState` is built, serialized, and attached to `device-connection`, `fleet-map`, and `fleet-connectivity/:vehicleId` APIs |
| Fleet Connectivity tab/drawer | **Canonical presentation exists** — `FleetConnectivityDetailDrawer` + `fleet-connectivity.presentation.ts` + full DE/EN i18n |
| Vehicle Detail Overview card | **Legacy episode-only presentation** — `VehicleDeviceConnectionCard` ignores `connectivityRuntime` on the same API response |
| Vehicle Detail header | **Parallel freshness path** — live telemetry poll + `resolveTelemetryFreshness`; does not read `connectivityRuntime` from fleet-map |
| Dedicated Vehicle Detail Connectivity tab | **Does not exist in code** — must be created or composed from existing Fleet Connectivity detail sections |
| Semantic/runtime defect | **None identified** for the example scenario (provider ACTIVE + telemetry OFFLINE + device UNKNOWN + no open episode) — mismatch is **presentation collapse**, not wrong backend truth |

**Precise explanation:** The operator confusion described in the task (Fleet shows Offline while Detail shows “DIMO LTE_R1 verbunden” + “Status (Webhook): Unbekannt” + “Keine offene Unterbrechung”) is explained by **three independent UI surfaces reading different authorities with legacy copy**, not by contradictory canonical runtime. The canonical dimensions already exist on the wire (`connectivityRuntime` on `GET …/device-connection` and `GET …/fleet-connectivity/:vehicleId`) but Vehicle Detail does not project them into operator-facing hierarchy.

`docs/audits/data/fleet-connectivity-consumer-wiring-2026-07.csv` marks `vehicle_device_connection_card` and `vehicle_detail_header` as **CANONICAL**, but repository code **does not yet consume** `connectivityRuntime` on those surfaces — the CSV reflects target wiring, not current UI.

**Not in repo (naming note):** No type named `CanonicalVehicleOperationalView`. Closest contracts:

- Connectivity runtime: `VehicleConnectivityRuntimeState` (`backend/.../connectivity-domain.types.ts`, `frontend/src/lib/api.ts`)
- Fleet connectivity UI projection: `FleetConnectivityListItem` / `FleetConnectivityDetail` + `fleet-connectivity.presentation.ts`
- Rental operational status (separate domain): `VehicleOperationalState` (`frontend/src/rental/lib/vehicle-operational-state/`)

---

## 2. Current component map

### 2.1 Vehicle Detail shell (context)

```
frontend/src/rental/App.tsx
├── VehicleDetailHeader          → VehicleDetailHeaderBadges (telemetry + OBD)
├── VehicleDetailTabBar          → 8 tabs (no connectivity tab)
└── VehicleDetailTabPanel
    ├── overview    → VehicleOverviewTab
    ├── trips       → VehicleTripsTab (+ TripDeviceConnectionEvidence)
    ├── health-errors → HealthErrorsView
    ├── damages / documents / vehicle-bookings / vehicle-tasks / vehicle-requirements
```

**Tab type:** `frontend/src/rental/lib/vehicle-overview.types.ts` — `VehicleDetailTab` has no `connectivity` key.

### 2.2 A — Overview → Connectivity card

| Layer | File | Role |
|-------|------|------|
| Host layout | `frontend/src/rental/components/vehicle-detail/VehicleOverviewTab.tsx` | Places card in `vo.healthColumn` below health box |
| **Connectivity card** | `frontend/src/rental/components/vehicle-detail/VehicleDeviceConnectionCard.tsx` | Self-fetching card; local `useState` + `useEffect` |
| Presentation helpers | `frontend/src/rental/lib/device-connection-ui.ts` | DE-hardcoded labels, formatters, visibility gate |
| UI primitives | `frontend/src/components/patterns/status.tsx` | `StatusChip` |
| Layout tokens | `frontend/src/rental/components/vehicle-detail/vehicle-overview-ui.ts` | `vo.mainGrid`, `vo.healthColumn`, mobile `gap-4` |
| Observability | `frontend/src/rental/lib/vehicle-detail-observability.ts` | `device_connection_error` signal |

**Sibling connectivity-adjacent surfaces on Overview (not the card):**

| Surface | File | Role |
|---------|------|------|
| Header badge (when on any vehicle-detail tab) | `VehicleDetailHeaderBadges.tsx` → `VehicleConnectionBadge` | Telemetry freshness dot + “Last Signal” |
| OBD unplug badge | `useFleetObdPlugIndex` + `ObdUnpluggedBadge` | Legacy `fleet-connectivity.vehicles[].obdIsPluggedIn` snapshot |
| Live map | `OverviewLiveMapCard.tsx` | Positional telemetry badges (Live / Last known / Signal issue) |
| Health box | `VehicleHealthBoxTelemetryBridge` | Rental health; `showDataBasis={false}` on Overview hides data-coverage block |

### 2.3 B — Dedicated Connectivity tab (current state)

**There is no Vehicle Detail Connectivity tab today.**

Audited **surrogate / target composition sources** for P1.8B:

| Surface | Location | Operator vs diagnostic |
|---------|----------|------------------------|
| **Fleet Connectivity detail drawer** (canonical) | `frontend/src/rental/components/fleet-connectivity/FleetConnectivityDetailDrawer.tsx` | Operator-grade sections A–E + technical collapsible |
| **Fleet Connectivity tab** (fleet hub) | `FleetConnectivityTab.tsx` | Fleet-wide list; not vehicle-detail scoped |
| **Data Analyse → Device Connection** | `frontend/src/rental/components/DataAnalyseView.tsx` → `DeviceConnectionTab` | Admin/diagnostic; same `device-connection` API, webhook metrics, raw debug |
| **Trips evidence** | `TripDeviceConnectionEvidence.tsx` | Trip-scoped episode evidence only |

**Recommended P1.8 interpretation:** “Connectivity tab” means **a new Vehicle Detail tab** that inlines or reuses `FleetConnectivityDetailDrawer` section components fed by `GET …/fleet-connectivity/:vehicleId`, not a refactor of an existing tab.

### 2.4 Fleet Connectivity detail drawer hierarchy (composition target)

```
FleetConnectivityDetailDrawer
├── DetailDrawer (patterns/detail-drawer.tsx)
├── OverallStateChip (fleet-connectivity.badges.tsx)
├── Section: Current state (overallState, lastTelemetry, attention, recommendation, primaryHint)
├── Section: Timeline (runtime timeline events)
├── Section: Data availability (coverage + per-signal grid)
├── Section: Integration (provider, device kind, authorization, consent, triggers, last fetch)
├── Collapsible: Technical (physicalDeviceState, odometer, location flag, calculatedAt, reconnectedSince, openEpisode)
└── SupportContextButton (fleet-connectivity context)
```

Presentation: `fleet-connectivity.presentation.ts` + `fleetConnectivity.*` i18n (`en.ts` / `de.ts`).

---

## 3. Current data-flow map

### 3.1 Overview connectivity card (`VehicleDeviceConnectionCard`)

```
GET /organizations/:orgId/vehicles/:vehicleId/device-connection
  backend: vehicles.service.getDeviceConnection()
    ├── DeviceConnectionQueryService.getVehicleSummary()
    │     └── buildDeviceConnectionSummary()  [device-connection-read-model.ts]
    └── VehicleConnectivityRuntimeProjectionService.projectForVehicle()
          └── serializeVehicleConnectivityRuntimeState() → connectivityRuntime

Frontend:
  api.vehicles.deviceConnection()
    → VehicleDeviceConnectionCard (uses summary fields only)
    → connectivityRuntime **discarded**
```

### 3.2 Per displayed value (Overview card)

| Rendered UI | Frontend field / helper | Backend authority | Classification |
|-------------|-------------------------|-------------------|----------------|
| Eyebrow “Konnektivität” | Hardcoded DE | — | LEGACY copy |
| Title “DIMO LTE_R1 verbunden” | `summary.lteR1Capable` → `DEVICE_CONNECTION_LABELS.lteR1Connected` | `Vehicle.hardwareType === 'LTE_R1'` | **MISLEADING** — hardware capability label, not link/telemetry state |
| Title fallback “DIMO Geräteverbindung” | Hardcoded | — | LEGACY |
| Top `StatusChip` | `severity` + `openUnpluggedEpisode` + `currentDeviceConnectionStatus` | Episode + event reconciliation | DERIVED (episode layer) |
| “Status (Webhook)” value | `currentDeviceConnectionStatus` → `deviceConnectionStatusLabel()` | Reconciled webhook events + persisted episode + DIMO anchor | DERIVED — **mislabeled** (not webhook-config status) |
| “Offene Unterbrechung” | `openUnpluggedEpisode`, `openUnpluggedSince`, `openUnpluggedDurationMs` | `DeviceConnectionEpisode` + event window | CANONICAL (episode) |
| “Keine offene Unterbrechung” | `!openUnpluggedEpisode` | Same | CANONICAL |
| Recent events (max 3) | `recentEvents[]` | `DimoDeviceConnectionEvent` (7d window) | DIAGNOSTIC |
| `connectivityRuntime` (not shown) | On API response | `VehicleConnectivityRuntimeStateBuilder` | CANONICAL — **unexposed** |

### 3.3 Vehicle Detail header (`VehicleConnectionBadge`)

```
useVehicleLiveMapStore (poll GET …/telemetry + …/live-gps)
  → lastSignal, onlineStatus (3-state store, not classification input)

resolveTelemetryFreshness({ lastSignal, onlineStatus })  [telemetryFreshness.ts]
  → live | standby | signal_delayed | offline | no_signal

Parallel (OBD):
useFleetObdPlugIndex → GET …/fleet-connectivity (deprecated vehicles[])
  → obdIsPluggedIn snapshot → ObdUnpluggedBadge
```

**Not used:** `selectedVehicle.connectivityRuntime` (field not on `VehicleData`; fleet-map runtime not joined into detail vehicle model).

### 3.4 Fleet list “Offline” vs Detail

| Surface | Authority | “Offline” meaning |
|---------|-----------|-------------------|
| Fleet Command / map rows | `resolveTelemetryFreshness(lastSignal)` via `fleetVehicleDisplay.ts` | Age ≥ 48h → `offline` / `no_signal` |
| Fleet Connectivity tab | `overallState` / `telemetryState` from runtime | `OFFLINE` / `SOFT_OFFLINE` synthesized |
| Vehicle Detail header | Live poll `lastSignal` + `resolveTelemetryFreshness` | Same 5-state age rules as fleet rows |
| Vehicle Detail Overview card | Episode webhook status | **Does not show telemetry offline at all** |

### 3.5 Dedicated connectivity detail (fleet API — future Vehicle Detail tab)

```
GET /organizations/:orgId/fleet-connectivity/:vehicleId
  → FleetConnectivityDetail (list item + provider, timeline, capabilities, webhook, timestamps)
  → Built from same runtime projection + device connection fields
```

---

## 4. Semantic matrix

| UI value (current) | Current label | Source field | Canonical authority | Meaning | Problem |
|--------------------|---------------|--------------|---------------------|---------|---------|
| Card title | DIMO LTE_R1 verbunden | `lteR1Capable` | Hardware type | “This vehicle has LTE_R1 hardware” | **MISLEADING** — reads as “connected now” |
| Card title alt | DIMO Geräteverbindung | hardcoded | — | Generic device connection section | Vague |
| Status chip (open) | Manipulationshinweis | `openUnpluggedEpisode` + severity | Episode | Tamper/unplug attention | OK but collapsed with plug status |
| Status chip | Wieder verbunden / abgezogen / Unbekannt | `currentDeviceConnectionStatus` | Webhook episode reconciliation | Last known plug evidence | OK internally; wrong prominence |
| Row 1 label | Status (Webhook) | hardcoded | — | Implies webhook pipeline | **LEGACY / implementation-facing** |
| Row 1 value | Unbekannt | `currentDeviceConnectionStatus === 'unknown'` | No reconciled plug/unplug conclusion | Insufficient episode evidence | Legitimate; label confuses |
| Row 2 | Keine offene Unterbrechung | `!openUnpluggedEpisode` | No active connectivity episode | No persisted open unplug episode | **MISLEADING** next to OFFLINE telemetry — different dimension |
| Telemetry (header only) | Offline / Live / … | `lastSignal` age | `telemetryState` / freshness resolver | Usable telemetry recency | Not on Overview card |
| Provider link | *(not shown on Detail)* | `connectivityRuntime.providerLinkState` | Provider link builder | Integration authorization | **Missing exposure** |
| Overall connectivity | *(not shown on Detail)* | `connectivityRuntime.overallState` | Runtime builder | Synthesized operator state | **Missing exposure** |
| Last telemetry | *(header partial)* | `lastSignal` from live poll | `lastTelemetryAt` / `lastProviderObservedAt` | Last trustworthy vehicle signal | Partial; not on card; poll may diverge from runtime |
| OBD badge | OBD unplugged | `obdIsPluggedIn` legacy fleet row | Snapshot | Physical snapshot | **DUPLICATED / LEGACY** vs `physicalDeviceState` |
| `webhookConfigured` | *(not on Overview card)* | `DeviceConnectionSummary.webhookConfigured` | Webhook configuration service | Trigger setup state | Shown in Data Analyse only |
| `dimoLinked` | *(not shown)* | summary | Provider link evidence | DIMO vehicle link exists | Not shown |

---

## 5. Duplication / legacy inventory

| Item | Status | Notes |
|------|--------|-------|
| `VehicleDeviceConnectionCard` episode-only model | **LEGACY presentation** | Pre-runtime-card; ignores `connectivityRuntime` |
| `DEVICE_CONNECTION_LABELS` DE constants | **LEGACY i18n** | Not `useLanguage`; blocks EN parity |
| “Status (Webhook)” label | **LEGACY** | Value is device connection status, not `webhookConfigured` |
| `lteR1Connected` headline | **MISLEADING** | Hardware badge presented as connection headline |
| `useFleetObdPlugIndex` + `ObdUnpluggedBadge` | **LEGACY parallel** | Deprecated `fleet-connectivity.vehicles[]`; diverges from `physicalDeviceState` |
| `onlineStatus` on telemetry DTO | **LEGACY** | 24h threshold; not used for classification in `resolveTelemetryFreshness` |
| Consumer wiring CSV “CANONICAL” for vehicle detail card | **ASPIRATIONAL** | Code not wired to runtime |
| `DataAnalyseView` `DeviceConnectionTab` | **DIAGNOSTIC duplicate** | Same API, richer webhook counters — keep out of Overview |
| `FleetConnectivityDetailDrawer` | **CANONICAL** | Reuse for Vehicle Detail tab |
| Split `ObdRowChip` / `DeviceConnectionWebhookChip` | **DEAD** | Replaced on fleet tab by `OverallStateChip` |
| `VehicleData` without `connectivityRuntime` | **PROJECTION GAP** | Runtime on fleet-map DTO not on detail vehicle model |

---

## 6. Overview-card UX findings

### Keep (conceptually)

- Compact card in Overview health column (operator glance).
- Open episode + rental-relevant unplug emphasis (when episode exists).
- Recent webhook events as **secondary** evidence (≤3 rows).

### Change

| Element | Recommendation |
|---------|----------------|
| Headline | Replace hardware “verbunden” with **primary telemetry state** (`telemetryState` / operator label from `fleetConnectivity` i18n) |
| Sub-hierarchy | Add **last signal + elapsed** (from runtime `lastTelemetryAt` or aligned freshness helper) |
| Provider | Separate row/chip: **provider link state** (`providerLinkState`) — never green “verbunden” unless telemetry supports it |
| Physical device | Operator label from `physicalDeviceState` — not “Webhook” jargon |
| Episode | Rename to operator language (“Gerät getrennt” / “Keine aktive Unterbrechung”) with tooltip explaining vs telemetry offline |
| Status chip | Use `OverallStateChip` or attention chip from runtime — not episode severity alone |

### Move to Connectivity tab only

- Webhook event list (>3), 24h/7d counters, trigger configuration, raw debug payloads.
- Per-signal data coverage grid.
- Integration/consent/trigger rows.
- Timeline with recovery timestamps.

### Disappear from Overview

- “Status (Webhook)” label.
- “DIMO LTE_R1 verbunden” as default headline when telemetry is offline.
- Implicit equating of `plugged` / `unknown` with fleet connectivity health.

---

## 7. Connectivity-tab UX findings

### Current state

No Vehicle Detail tab — implementation is **net-new shell** with **existing drawer content** extraction.

### FleetConnectivityDetailDrawer — reuse as-is (with layout adaptation)

| Section | Keep | Notes |
|---------|------|-------|
| Current state | ✅ | Primary operator diagnostic |
| Timeline | ✅ | Episode/runtime history |
| Data availability | ✅ | Coverage grid — diagnostic but valuable |
| Integration | ✅ | Provider link dimension explicit |
| Technical collapsible | ✅ | `physicalDeviceState`, open episode, calculatedAt |
| Read-only note | ✅ | Sets expectations |

### Data Analyse `DeviceConnectionTab` — do not duplicate verbatim

- Keep admin-oriented metrics (24h/7d counts, raw JSON) in Data Analyse.
- Vehicle Detail tab should use **fleet connectivity presentation**, not `DEVICE_CONNECTION_LABELS`.

### Health tab

- `HealthErrorsView` / data evidence — **not** a connectivity tab; avoid duplicating connectivity runtime there.

---

## 8. Proposed information architecture (implementation phase)

### Overview card (concise — answers in &lt;5 seconds)

1. **Primary state** — “Liefert das Fahrzeug nutzbare Telemetrie?” → `telemetryState` label + tone (`OverallStateChip` or dedicated telemetry chip).
2. **Freshness** — Last vehicle signal timestamp + relative duration (`formatLastTelemetry` from `fleet-connectivity.presentation.ts`).
3. **Attention** — Only if `attentionState !== NONE` or `requiresAction` (reason hint).
4. **Data source** — Provider/integration row: `providerLinkState` (ACTIVE ≠ online).
5. **Interruption** — One line: open episode yes/no + duration; link “Details” → Connectivity tab.

**Do not show on Overview:** webhook counters, trigger config, raw events list (or max 1 line “Letztes Geräteereignis”).

### Connectivity tab (deep diagnostics)

1. Current state panel (overall + dimensions table).
2. Timeline.
3. Data availability / signal grid.
4. Integration (provider, consent, triggers).
5. Technical (physical device, episode ids, calculatedAt).
6. Optional: link to Data Analyse for admin webhook debug (role-gated).

---

## 9. State presentation matrix (conceptual — no new backend semantics)

Uses existing enums: `TelemetryFreshness`, `ProviderLinkState`, `PhysicalDeviceState`, `OverallConnectivityState`, episode flags.

| Scenario | Primary (Overview) | Freshness row | Provider row | Physical / episode row |
|----------|-------------------|---------------|--------------|------------------------|
| LIVE (`telemetryState: live`) | Telemetry active (green) | “Live” / just now | ACTIVE → “Datenquelle verbunden” | No open episode |
| STANDBY | Standby (neutral) | Hours ago | ACTIVE | Episode independent |
| SOFT_OFFLINE (`signal_delayed`) | No data for several hours (watch) | 24–48h ago | ACTIVE | May have no episode |
| OFFLINE | Offline (critical) | &gt;48h / never | ACTIVE possible | No episode ≠ contradiction |
| UNKNOWN / NO_SIGNAL | Unknown / no data | Never / unknown | May be ACTIVE or NO_LINK | Device unknown |
| Provider ACTIVE + telemetry OFFLINE | **Offline** (telemetry) | Stale timestamp | **Integration active** (separate neutral/success) | Do not imply vehicle online |
| Device UNPLUGGED (`DEVICE_UNPLUGGED`) | Device disconnected | May still show last telemetry time | ACTIVE possible | Open episode + physical UNPLUGGED |
| Provider authorization failure | Authorization required | May vary | REAUTH_REQUIRED / REVOKED | N/A |
| Active interruption | Device disconnected / action required | Independent | Independent | Open episode + duration |
| Recovered / no interruption | Telemetry per freshness | Per freshness | Per link state | “No active interruption” |

Copy must come from `fleetConnectivity.*` keys, not `DEVICE_CONNECTION_LABELS`, for cross-surface parity with Fleet Connectivity.

---

## 10. Reusable SynqDrive UI primitives

| Primitive | Path | Use for P1.8 |
|-----------|------|--------------|
| `StatusChip` / tones | `frontend/src/components/patterns/status.tsx`, `status-utils.ts` | Telemetry, attention, provider |
| `OverallStateChip` | `fleet-connectivity/fleet-connectivity.badges.tsx` | Primary overall state |
| `DetailDrawer` / section pattern | `patterns/detail-drawer.tsx`, drawer `DetailSection` / `DetailRow` | Connectivity tab sections |
| `MetricCard` | `patterns/data-card.tsx` | Optional compact metrics |
| `surface-premium` / `surface-elevated` | `patterns/surface.ts`, `theme.css` | Card shells (match Overview) |
| `Collapsible` technical block | `components/ui/collapsible` | Technical diagnostics |
| `ErrorState` / loading | `patterns/states.tsx` | Tab fetch states |
| Presentation helpers | `fleet-connectivity.presentation.ts` | Labels, tones, `formatLastTelemetry` |
| Freshness (age only) | `telemetryFreshness.ts` | Align header + card if both show freshness |
| Layout tokens | `vehicle-overview-ui.ts` (`vo.*`) | Overview card spacing |
| Mobile shell | `vehicle-detail-mobile-ui.ts` | Touch targets, overflow |
| i18n | `fleetConnectivity.*` in `en.ts` / `de.ts` | All operator strings |

**Do not introduce:** new color tokens, new chip shapes, or a parallel connectivity label map.

---

## 11. Implementation slice proposal

### P1.8A — Overview Connectivity Card refactor

- Thin adapter: `device-connection` response → presentation view model (runtime required).
- Replace headline/chips/rows per §8 Overview hierarchy.
- Migrate strings to `fleetConnectivity.*` i18n.
- Remove misleading “verbunden” / “Status (Webhook)”.
- Header badge: optional alignment pass (read runtime from fleet-map or same API) — **separate sub-slice if scope creep**.

### P1.8B — Vehicle Detail Connectivity tab

- Add `connectivity` to `VehicleDetailTab` + tab bar + `App.tsx` panel.
- Fetch `api.vehicles.fleetConnectivityDetail(orgId, vehicleId)`.
- Extract shared sections from `FleetConnectivityDetailDrawer` into `FleetConnectivityDetailSections.tsx` (or similar) used by drawer + tab.
- Mobile: single-column sections; desktop: same content, wider layout (not a second drawer).

### P1.8C — Cross-surface regression / UI certification

- Extend `connectivity-cross-surface-regression.test.ts` with Vehicle Detail presentation fixtures.
- Playwright: Overview card shows telemetry OFFLINE + provider ACTIVE without contradictory headline.
- Snapshot/contract tests for new adapter (no semantic assertions on backend).

**Sequence rationale:** A delivers immediate operator fix on mobile Overview (screenshot pain point); B rehomes deep diagnostics without duplicating Fleet drawer logic; C locks semantics.

---

## 12. Exact expected file scope (implementation)

### Production

| File | Change |
|------|--------|
| `frontend/src/rental/components/vehicle-detail/VehicleDeviceConnectionCard.tsx` | Major — runtime-aware presentation |
| `frontend/src/rental/lib/device-connection-ui.ts` | Deprecate operator strings for Detail; keep trip/fleet helpers or split |
| **New** `frontend/src/rental/components/vehicle-detail/vehicle-connectivity-presentation.ts` | Thin adapter runtime + summary → view model |
| **New** `frontend/src/rental/components/vehicle-detail/VehicleConnectivityTab.tsx` | Tab shell |
| `frontend/src/rental/components/fleet-connectivity/FleetConnectivityDetailDrawer.tsx` | Extract shared sections |
| **New** `frontend/src/rental/components/fleet-connectivity/FleetConnectivityDetailSections.tsx` | Shared A–E sections |
| `frontend/src/rental/components/vehicle-detail/VehicleOverviewTab.tsx` | Optional “Details → tab” link |
| `frontend/src/rental/components/vehicle-detail/VehicleDetailTabBar.tsx` | New tab |
| `frontend/src/rental/lib/vehicle-overview.types.ts` | `connectivity` tab key |
| `frontend/src/rental/App.tsx` | Tab routing |
| `frontend/src/rental/components/vehicle-detail/VehicleDetailHeaderBadges.tsx` | Optional — runtime alignment |
| `frontend/src/rental/data/vehicles.ts` or fleet join | Optional — expose `connectivityRuntime` on detail vehicle |

### Tests

| File | Change |
|------|--------|
| **New** `vehicle-connectivity-presentation.test.ts` | Adapter matrix tests |
| `frontend/src/rental/lib/connectivity-cross-surface-regression.test.ts` | Detail surface scenarios |
| `frontend/e2e/vehicle-detail-flow.spec.ts` | Update test 20 expectations |
| `fleet-connectivity.presentation.test.ts` (if exists) or new | Section label contracts |

### i18n

| File | Change |
|------|--------|
| `frontend/src/rental/i18n/translations/en.ts` | `vehicleDetail.connectivity.*` tab labels + Overview-specific hints if needed |
| `frontend/src/rental/i18n/translations/de.ts` | Same |
| Reuse existing `fleetConnectivity.*` for dimension labels |

### Documentation (post-implementation, not in P1.8 audit)

- `docs/audits/data/fleet-connectivity-consumer-wiring-2026-07.csv` — update vehicle detail rows when wired
- `architecture/FLEET_CONNECTIVITY_CONSUMER_MIGRATION_2026-07-19.md` — add Vehicle Detail tab consumer

**Explicitly out of scope:** backend runtime builder, episode resolution, APIs, DB, polling intervals, webhook processing.

---

## 13. Test strategy

### Unit / contract

1. **Presentation adapter** — Given fixture `DeviceConnectionSummary` + `connectivityRuntime`, assert rendered view model fields (not DOM) for:
   - `providerLinkState: ACTIVE` + `telemetryState: offline` → primary = Offline, provider row ≠ “vehicle online”
   - `physicalDeviceState: UNKNOWN` + `openUnpluggedEpisode: false` → no “unplugged” headline
   - `overallState: DEVICE_UNPLUGGED` + open episode → interruption row active
2. **No client-side state machine** — Tests must fail if adapter recomputes freshness thresholds locally (must use API `telemetryState` or shared `resolveTelemetryFreshness` only when displaying age from timestamps already on DTO).
3. **i18n** — Overview card uses translation keys, not `DEVICE_CONNECTION_LABELS`, for operator-facing strings.

### Cross-surface regression (extend existing)

Scenario **Fleet OFFLINE + provider ACTIVE + physical UNKNOWN + no open episode**:

| Surface | Expected consistent messaging |
|---------|------------------------------|
| Fleet row | Offline / signal_delayed per age or runtime |
| Fleet Connectivity drawer | `overallState` OFFLINE or SOFT_OFFLINE; provider ACTIVE row |
| Vehicle Detail header | Offline freshness (if signal age matches) |
| Vehicle Detail Overview card | Primary telemetry offline; provider “active”; no “verbunden” headline |
| Vehicle Detail Connectivity tab | Dimension table shows split |

### E2E

- `vehicle-detail-flow.spec.ts` — replace “Konnektivität” + pulse assertions with runtime-aware copy.
- New: navigate to Connectivity tab; sections visible; no Fleet hub required.

### Guard tests

- `VehicleDeviceConnectionCard` must reference `connectivityRuntime` in source (contract grep test).
- No new imports of deprecated `fleet-connectivity.vehicles[]` for Detail tab.

---

## 14. Critical semantic check (dimensions)

| Dimension | Canonical field | Collapsed today? |
|-----------|-----------------|----------------|
| Telemetry connectivity | `telemetryState` / freshness age | **Yes** — Overview card omits; header only |
| Provider link | `providerLinkState` | **Yes** — “LTE_R1 verbunden” conflates hardware/link |
| Physical / webhook evidence | `physicalDeviceState` + episode fields | **Partial** — webhook status row mislabeled |
| Connectivity episode | `openUnpluggedEpisode` / `activeEpisode` | **Partial** — shown but confused with telemetry offline |
| Operational availability | `VehicleOperationalState` (rental) | Correctly separate — not on connectivity card |

**Issue 1 verified:** “verbunden” = `lteR1Capable` hardware label (`DEVICE_CONNECTION_LABELS.lteR1Connected`), **not** telemetry or provider link ACTIVE.

**Issue 2 verified:** “Unbekannt” = `currentDeviceConnectionStatus === 'unknown'` when reconciled events yield no plug/unplug conclusion; legitimate. “Webhook” in label is **implementation-facing** (`webhookConfigured` is a separate unused field on card).

**Issue 3 verified:** Telemetry OFFLINE (age ≥ 48h or no signal) is **orthogonal** to `openUnpluggedEpisode === false`. Episode tracks physical unplug events; offline tracks telemetry freshness.

**Issue 4 verified:** `lastTelemetryAt`, `providerLinkState`, `telemetryState`, `overallState` are on `connectivityRuntime` in API **without backend changes**. `lastSignal` available via live poll/header.

**Issue 5 verified:** `FleetConnectivityDetailDrawer` already has full diagnostics — **should be composed into new tab**, not duplicated into Overview.

---

## 15. Mobile-first review (current)

| Aspect | Current Overview card | Risk for P1.8 |
|--------|----------------------|---------------|
| Width | Full health column; `sm:grid-cols-2` inner grid | OK |
| Padding | `p-4`, nested `rounded-xl px-3 py-2` | Slightly heavy nesting |
| Typography | Eyebrow 11px; title `text-sm`; rows 12px | Hierarchy inverted (hardware title &gt; telemetry) |
| Badges | Chip top-right wraps with `flex-wrap` | OK |
| Whitespace | `h-28` skeleton; `space-y-3` | Acceptable |
| Touch targets | Card not primary CTA | Tab link needs ≥44px |
| i18n | DE-hardcoded | EN broken on mobile |
| Information density | Low telemetry signal, high misleading headline | Primary fix target |

Desktop: card sits in `lg:col-span-2` column beside map — same content rules apply.

---

## 16. Final GO / NO-GO

### P1.8A (Overview Connectivity Card): **GO**

| Criterion | Status |
|-----------|--------|
| Canonical data on wire | ✅ `connectivityRuntime` on device-connection |
| Presentation layer exists | ✅ `fleet-connectivity.presentation.ts` reusable |
| No backend semantic change required | ✅ |
| Risk | Low — thin adapter + UI swap |

### P1.8B (Connectivity tab): **GO** (with extraction prerequisite)

| Criterion | Status |
|-----------|--------|
| Detail API exists | ✅ `GET …/fleet-connectivity/:vehicleId` |
| UI sections exist | ✅ Drawer — extract before tab |
| Tab shell | ❌ Net-new wiring |
| Risk | Medium — routing + shared component extraction |

### P1.8 overall: **GO** — presentation refinement only; architecture closure preserved.

**NO-GO conditions (not met):** No evidence that runtime projection is wrong for the cited scenario; no missing canonical fields blocking Overview/tab.

---

## Appendix A — Key file index

| Path | Role |
|------|------|
| `frontend/src/rental/components/vehicle-detail/VehicleDeviceConnectionCard.tsx` | Overview connectivity card |
| `frontend/src/rental/lib/device-connection-ui.ts` | Legacy presentation helpers |
| `frontend/src/rental/components/fleet-connectivity/FleetConnectivityDetailDrawer.tsx` | Canonical detail UI |
| `frontend/src/rental/components/fleet-connectivity/fleet-connectivity.presentation.ts` | Labels/tones |
| `frontend/src/rental/lib/telemetryFreshness.ts` | Freshness age rules |
| `frontend/src/rental/components/vehicle-detail/VehicleDetailHeaderBadges.tsx` | Header telemetry |
| `backend/src/modules/dimo/device-connection-read-model.ts` | Episode summary builder |
| `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts` | Runtime SoT |
| `docs/audits/data/fleet-connectivity-consumer-wiring-2026-07.csv` | Consumer classification (aspirational for detail) |

---

*End of audit — read-only; no runtime code modified.*
