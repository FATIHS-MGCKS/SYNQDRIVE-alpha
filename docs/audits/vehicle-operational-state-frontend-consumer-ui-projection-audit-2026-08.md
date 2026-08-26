# Vehicle Operational State Architecture — P1 Frontend Consumer & UI Projection Audit

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08` |
| **Mode** | Read-only — no runtime code changes, no production mutations |
| **Workstream** | Vehicle operational state architecture (continuation) |
| **Main SHA audited** | `7d92e6877c426679b0bcc77a0573a8d0b6f1af78` (PR #1307 merged) |
| **Context** | DIMO per-vehicle consent ledger Phase 2 production apply **CLOSED** (KS trio ACTIVE/AVAILABLE) |
| **Audit date (UTC)** | 2026-08-26 |

---

## A. Executive verdict

SynqDrive has a **mature canonical backend** for vehicle operational/connectivity state (P0.1 connectivity runtime → P0.2 operational projection → P0.3/P0.4 fleet-map slices), but the **frontend is only partially cut over**.

**Migrated (canonical):**

- Fleet list / map HUD badges → P0.2 `operationalAvailability` + P0.4 `healthEvaluation` via `GET /organizations/:orgId/fleet-map`
- Fleet Connectivity tab → full P0.1 connectivity DTO via `GET …/fleet-connectivity`
- Master Connected Vehicles → server-computed operational projection

**Still parallel / legacy:**

- Dashboard Fleet Readiness & “Ready to Rent” KPIs → client `vehicleRuntimeStateBuilder` + `telemetryFreshness.ts` (not P0.2)
- Vehicle detail connection badge → `useVehicleLiveMapStore` + legacy `onlineStatus` (24h) vs canonical 48h offline
- Booking picker → `isVehicleOffline()` (48h telemetry heuristic), ignores P0.2 `NEEDS_VERIFICATION`
- Multiple timestamp-based client derivations across dashboard, fleet visual state, insights

**Verdict:** The architecture is sound and documented; **UI cutover is not complete**. A controlled phased migration is required before declaring consumer correctness closed.

---

## B. Canonical source-of-truth map

### Layer model (do not collapse)

| Layer | Domain | Authority | Key types / fields |
|-------|--------|-----------|-------------------|
| **A** Raw provider facts | DB snapshots, links, consents, episodes | Prisma + DIMO/HM ingest | `latestState`, `dataSourceLinks`, `providerConsents`, `deviceConnectionEpisodes` |
| **B** Provider link | Authorization/mapping | `ProviderLinkStateBuilder` | `providerLinkState`: `ACTIVE`, `REAUTH_REQUIRED`, `REVOKED`, `NO_LINK`, `ERROR`, `UNKNOWN` |
| **C** Telemetry freshness | Signal age | `telemetry-freshness.resolver` + `vehicle-state-interpreter.ts` | `telemetryState`: `live`, `standby`, `signal_delayed`, `offline`, `no_signal` (15m / 24h / 48h) |
| **D** Physical device | Plug/unplug evidence | `physical-device-evidence.ts` | `physicalDeviceState`: `PLUGGED_CONFIRMED`, `PLUGGED_INFERRED`, `UNPLUGGED_CONFIRMED`, `UNKNOWN`, `NOT_APPLICABLE` |
| **E** Data coverage | Signal completeness | `fleet-data-coverage.ts` | `dataCoverageState`: `GOOD`, `PARTIAL`, `INSUFFICIENT`, … |
| **F** Connectivity synthesis | P0.1 runtime | `VehicleConnectivityRuntimeStateBuilder` | `overallState`, `attentionState`, `reasonCodes`, `recommendedAction` |
| **G** Operational projection | P0.2 cross-domain | `vehicle-operational-projection.builder.ts` | `businessState`, `operationalAvailability`, `healthEvaluability`, `operatorSummary.primaryReason` |

**File anchors:**

- Types: `backend/src/modules/vehicles/connectivity/domain/connectivity-domain.types.ts`
- P0.2 types: `backend/src/modules/vehicles/operational/projection/vehicle-operational-projection.types.ts`
- Builder: `backend/src/modules/vehicles/operational/projection/vehicle-operational-projection.builder.ts`
- Service: `backend/src/modules/vehicles/operational/projection/vehicle-operational-projection.service.ts`
- Batch assembly: `backend/src/modules/vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler.ts`

### API exposure to frontend

| Endpoint | What UI gets |
|----------|--------------|
| `GET /organizations/:orgId/fleet-map` | `connectivityRuntime` (P0.1), `operationalAvailability` (P0.3 slice), `healthEvaluation` (P0.4 slice), legacy `status`/`operationalState` |
| `GET …/fleet-connectivity` | Full connectivity list/detail: `overallState`, `providerLinkState`, `telemetryState`, `recommendedAction`, … |
| `GET …/vehicles/:id/device-connection` | Device episodes + runtime |
| `GET …/rental-health/*` | Mechanical health condition (separate from connectivity) |
| **No dedicated P0.2 projection HTTP endpoint** | Full projection computed internally; sliced into fleet-map DTOs |

**Frontend mirrors:** `frontend/src/lib/api.ts` — `FleetMapVehicleResponse`, `FleetOperationalAvailabilityResponse`, `FleetHealthEvaluationResponse`

### P0.1 connectivity runtime fields

**Authority:** `backend/src/modules/vehicles/connectivity/domain/connectivity-domain.types.ts`

| Field | Enum / values |
|-------|---------------|
| `providerLinkState` | `ACTIVE`, `REAUTH_REQUIRED`, `REVOKED`, `NO_LINK`, `ERROR`, `UNKNOWN` |
| `telemetryState` | `live`, `standby`, `signal_delayed`, `offline`, `no_signal` |
| `physicalDeviceState` | `PLUGGED_CONFIRMED`, `PLUGGED_INFERRED`, `UNPLUGGED_CONFIRMED`, `UNKNOWN`, `NOT_APPLICABLE` |
| `dataCoverageState` | `GOOD`, `PARTIAL`, `INSUFFICIENT`, `UNKNOWN`, `NOT_APPLICABLE` |
| `attentionState` | `NONE`, `WATCH`, `ACTION_REQUIRED`, `CRITICAL` |
| `overallState` | `TELEMETRY_ACTIVE`, `STANDBY`, `SOFT_OFFLINE`, `OFFLINE`, `DEVICE_UNPLUGGED`, `AUTHORIZATION_REQUIRED`, `NO_ACTIVE_DATA_SOURCE`, `INTEGRATION_ERROR`, `UNKNOWN` |
| `recommendedAction` | `NONE`, `CHECK_DEVICE`, `REAUTHORIZE_PROVIDER`, `CONNECT_DATA_SOURCE`, `REVIEW_CONNECTIVITY`, `WAIT_FOR_TELEMETRY`, `CHECK_INTEGRATION` |

**Telemetry thresholds** (`backend/src/modules/vehicles/vehicle-state-interpreter.ts`):

| State | Threshold |
|-------|-----------|
| `live` | < 15 min |
| `standby` | 15 min – 24 h |
| `signal_delayed` | 24 h – 48 h |
| `offline` | ≥ 48 h |
| `no_signal` | no usable timestamp |

### P0.2 operational projection fields

**Authority:** `backend/src/modules/vehicles/operational/projection/vehicle-operational-projection.types.ts`

| Field | Enum / values |
|-------|---------------|
| `businessState` | `AVAILABLE`, `RENTED`, `RESERVED`, `IN_SERVICE`, `OUT_OF_SERVICE`, `UNKNOWN` |
| `operationalAvailability` | `AVAILABLE`, `NEEDS_VERIFICATION`, `UNAVAILABLE`, `UNKNOWN` |
| `healthEvaluability` | `EVALUABLE`, `PARTIALLY_EVALUABLE`, `NOT_EVALUABLE`, `UNKNOWN` |
| `attention` | `NONE`, `WATCH`, `ACTION_REQUIRED`, `CRITICAL` |
| `operatorSummary.primaryReason` | Precedence-selected from connectivity + projection codes |
| `operatorSummary.recommendedAction` | Passthrough from connectivity |

**`primaryReason` precedence** (`vehicle-operational-projection.builder.ts` → `selectPrimaryReason`):

1. `BUSINESS_WORKFLOW_BLOCKED`
2. `HEALTH_RENTAL_BLOCKED`
3. `DEVICE_UNPLUG_WEBHOOK`
4. `CONNECTIVITY_CONFIRMED_INTERRUPTION`
5. `DEVICE_CHECK_REQUIRED`
6. `CONNECTIVITY_VERIFICATION_REQUIRED`
7. `TELEMETRY_OFFLINE`
8. `DATA_COVERAGE_INSUFFICIENT`
9. `INSUFFICIENT_CROSS_DOMAIN_EVIDENCE`
10. else first code in list

### P0.4 health evaluability (fleet consumer)

**Authority:** `backend/src/modules/vehicles/operational/fleet-health-evaluation.dto.ts`

| API field | Internal source |
|-----------|-----------------|
| `healthEvaluation.evaluability` | `projection.healthEvaluability` |
| `healthEvaluation.condition` | `projection.evidence.healthConditionState` |
| `healthEvaluation.pipelineAvailability` | `projection.evidence.healthPipelineAvailability` |
| `healthEvaluation.source` | constant `'p0.2_projection'` |

---

## C. Frontend consumer matrix

Representative inventory (~35+ touchpoints). Risk: P0 = incorrect business decision; P1 = materially misleading; P2 = inconsistent UX; P3 = cosmetic.

| # | Surface | Route / entry | Component / file | Audience | Displayed state | Data source | Canonical? | Legacy? | Semantic issue | Risk | Cutover |
|---|---------|---------------|------------------|----------|-----------------|-------------|------------|---------|----------------|------|---------|
| 1 | Fleet list row | `?view=fleet` tab status | `FleetOperatorRow.tsx` | Org Admin | P0.2 availability + P0.4 health chips | fleet-map `operationalAvailability`, `healthEvaluation` | YES | Telemetry warning secondary | Dual badge + visual layer | P2 | Done |
| 2 | Map HUD | `?view=fleet` map | `FleetMapVehicleStatusHud.tsx` | Org Admin | Same as row | fleet-map | YES | Map tone from `fleetVisualState` | Map color ≠ P0.2 badge | P2 | Partial |
| 3 | Map markers | fleet map | `fleetVisualState.ts` | Org Admin | Color tone (ready/offline/attention) | Client `resolveTelemetryFreshness` + business | PARTIAL | Re-derives visual status | “Offline” on map ≠ P0.2 UNAVAILABLE | P1 | P1.5 |
| 4 | Fleet Connectivity tab | `?view=fleet` connectivity | `FleetConnectivityTab.tsx` | Org Admin | `overallState`, `providerLinkState`, actions | `GET …/fleet-connectivity` | YES | — | Correct surface for provider auth | — | Done |
| 5 | Dashboard Ready to Rent KPI | `?view=dashboard` | `rentalReadiness.ts`, `vehicleRuntimeStateBuilder.ts` | Org Admin | “Ready” count | Client runtime; blocks on `telemetryState === 'offline'` | NO | Full client derivation | Ready ≠ P0.2 AVAILABLE | P0 | P1.5 |
| 6 | Dashboard Data Freshness | dashboard | `controlSignalsBuilder.ts` | Org Admin | soft-offline / offline counts | Runtime `vehicleStates` | NO | Client buckets | Infrastructure freshness ≠ availability | P1 | P1.5 |
| 7 | Dashboard StatInlineDetail | dashboard drilldown | `StatInlineDetail.tsx` | Org Admin | “Not Ready” if offline | `isVehicleOffline()` (48h) | PARTIAL | Not P0.2 | Telemetry blocks display readiness | P1 | P1.5 |
| 8 | Fleet Readiness notifications | dashboard | `FleetReadinessAttentionPanel.tsx` | Org Admin | Grouped readiness issues | Backend notifications API | YES | — | Separate from connectivity tab | P2 | P1.6 |
| 9 | Vehicle detail header | vehicle views | `VehicleDetailHeaderBadges.tsx` | Org Admin | Connection badge (5-state) | `useVehicleLiveMapStore` / live telemetry poll | PARTIAL | Uses legacy `onlineStatus` fallback | No `providerLinkState`; 24h vs 48h schism | P0 | P1.4 |
| 10 | Vehicle detail OBD | vehicle header | `ObdUnpluggedBadge` | Org Admin | Unplugged | OBD plug index | YES (device) | Separate from telemetry age | Good separation | — | Done |
| 11 | Vehicle Health (fleet) | `?view=fleet` condition | `fleet-health-control-center.ts` | Org Admin | Good/Warning/Critical bands | Rental health API | YES (health) | `data_stale` separate | Does not use telemetry offline for severity | — | Done |
| 12 | Vehicle Health (detail) | `?view=health-errors` | `HealthVehicleDetailPanel.tsx` | Org Admin | Module states + `data_stale` | Rental health per module | YES | — | Stale ≠ mechanical defect | — | Done |
| 13 | Booking picker | `?view=new-booking` | `booking-vehicle-preflight.ts` | Org Admin | Hard-block offline/rental_blocked | `isVehicleOffline` + rental health | PARTIAL | Ignores P0.2 `NEEDS_VERIFICATION` | Auth gap not blocked at picker | P0 | P1.5 |
| 14 | Master Connected Vehicles | `/master?view=vehicles` | `ConnectedVehiclesListView.tsx` | Platform | `telemetryFreshness`, `attention.primaryReason` | Admin operational APIs | YES | — | Correct for platform ops | — | P1.7 |
| 15 | Master org list | `/master?view=organizations` | `OrganizationsView.tsx` | Platform | `attention`, `connectivityHealth` | Admin org operational API | YES | — | Platform vs tenant separated | — | Done |
| 16 | Operator quick view | `/operator` | `operatorStatus.ts` | Worker | Business badges only | fleet-map + health | PARTIAL | No connectivity | By design omission | P3 | Optional |
| 17 | Fleet Command filters | fleet tabs | `fleet-command-filters.ts` | Org Admin | Available/Rented/Offline tabs | `selectOperationalStatus` + telemetry | PARTIAL | “Offline” tab = client telemetry | Tab semantics mixed | P1 | P1.3 |
| 18 | Insights / action queue | dashboard | `deriveOperationalInsights.ts` | Org Admin | soft-offline/offline insights | Runtime states | NO | Client | Duplicate operational machine | P1 | P1.5 |

### Cross-cutting frontend foundations

| Layer | Path | Role |
|-------|------|------|
| Telemetry freshness (5-state) | `frontend/src/rental/lib/telemetryFreshness.ts` | Client SoT for signal age (15m / 24h / 48h) |
| Offline helper | `frontend/src/rental/data/vehicles.ts` → `isVehicleOffline()` | True for `offline` \| `no_signal` |
| Business operational status | `frontend/src/rental/lib/vehicle-operational-state/selectors.ts` | `selectOperationalStatus` — business workflow |
| P0.2 operational availability | `frontend/src/rental/lib/operational-availability/*` | Presentation from fleet-map projection |
| P0.4 health evaluability | `frontend/src/rental/lib/fleet-health-evaluation/*` | Condition + evaluability badge |
| Composite fleet visual | `frontend/src/rental/lib/fleetVisualState.ts` | Map tones, readiness — mixed |
| Dashboard runtime | `frontend/src/rental/components/dashboard/runtime/vehicleRuntimeStateBuilder.ts` | Parallel client operational model |
| Primary vehicle feed | `useFleetMapStore` → `GET …/fleet-map` | `fleet-map-vehicle-mapper.ts` |

---

## D. Backend → UI data-flow analysis

### Vehicle List (canonical path — migrated)

```
DB (vehicle, links, consents, snapshots, health)
  → VehicleConnectivityRuntimeProjectionService
  → VehicleOperationalProjectionService.getVehicleProjections() [batch]
  → vehicles.service#getFleetMapData()
  → FleetMapVehicleDto { operationalAvailability, healthEvaluation, connectivityRuntime }
  → useFleetMapStore → fleet-map-vehicle-mapper.ts
  → fleetVehicleDisplay.ts (flags: operationalAvailabilityBadge, healthEvaluationBadge)
  → mapOperationalAvailabilityPresentation() / mapFleetHealthPresentation()
  → FleetOperatorRow / FleetMapVehicleStatusHud
```

**Recompute point:** `fleetVisualState.ts` still derives map tones independently.

### Dashboard / Fleet Readiness (parallel path)

```
DB → fleet-map (partial fields)
  → useFleetVehicles()
  → vehicleRuntimeStateBuilder.ts
      → resolveTelemetryFreshness() [CLIENT]
      → deriveIsReadyForRenting() [blocks on telemetryState === 'offline']
  → controlSignalsBuilder / deriveOperationalInsights
  → KPIs, Fleet State Board, Data Freshness panel
```

**Recompute:** Full P0.2 bypass; second operational state machine on client.

### Vehicle Detail

```
fleet-map (initial) + GET /telemetry (poll) + GET /live-gps
  → useVehicleLiveMapStore (onlineStatus 3-state legacy)
  → VehicleConnectionBadge → resolveTelemetryFreshness()
Rental health → separate API → VehicleHealthChip
(P0.2 operationalAvailability NOT in header)
```

### Vehicle Health

```
GET …/rental-health/fleet | per-vehicle rental-health
  → fleet-health-control-center.ts (bands from overall_state + rental_blocked)
  → data_stale flagged separately (48h module rule)
NO connectivity runtime on this path
```

### Notifications

```
Backend notification registry (issueType, attentionScope)
  → GET …/notifications?attentionScope=fleet_readiness
  → fleet-readiness-attention-projection.ts (grouping only)
Dashboard ops notifications → insights adapter (may reference runtime telemetry)
```

### Master Admin monitoring

```
GET /admin/dashboard/operational
GET /admin/vehicles/operational/*
  → server telemetryFreshness buckets + attention DTOs
  → cv.utils.ts (presentation only, no client threshold re-derivation)
```

---

## E. Legacy derivation inventory

| # | File | Logic | Inputs | Output | Canonical equivalent | Removable after cutover? | Risk |
|---|------|-------|--------|--------|---------------------|--------------------------|------|
| 1 | `backend/.../vehicle-state-interpreter.ts` | `onlineStatus=OFFLINE` at ≥24h; `telemetryFreshness=offline` at ≥48h | timestamps | Dual semantics | Use `telemetryState` only | After live-map migration | P0 |
| 2 | `vehicleRuntimeStateBuilder.ts` | Builds dashboard runtime model | fleet-map + health + `resolveTelemetryFreshness` | `telemetryState`, `rentalReadiness` | P0.2 projection fields | Yes | P0 |
| 3 | `rentalReadiness.ts:74` | `if (telemetryState === 'offline') return false` | Runtime telemetry | ready/not_ready | `operationalAvailability` + business rules | Yes | P0 |
| 4 | `isVehicleOffline()` in `vehicles.ts` | `offline \| no_signal` from freshness | timestamps | boolean offline | P0.2 or connectivity `telemetryState` | Partial | P1 |
| 5 | `fleetVisualState.ts` | `isStale`, attention tones from telemetry + health | fleet-map vehicles | mapTone, chips | Shared UI projection | Yes | P1 |
| 6 | `fleet-operator-panel.ts` | Attention bucket: offline + soft-offline | runtime states | filter counts | P0.2 `attention` | Yes | P2 |
| 7 | `controlSignalsBuilder.ts` | Aggregates soft_offline/offline from runtime | dashboard vehicleStates | KPI counts | Backend connectivity summary or projection | Yes | P1 |
| 8 | `useVehicleLiveMapStore.ts` | Holds `onlineStatus` 3-state | telemetry poll | legacy status | `connectivityRuntime.telemetryState` | Yes | P0 |
| 9 | `fleetVehicleDisplay.ts` `resolveHealthDisplay()` | Fallback `healthStatus → good` when P0.4 flag off | legacy string | health chip | `mapFleetHealthPresentation()` | Yes (remove flag) | P1 |
| 10 | `booking-vehicle-preflight.ts` | Hard block `isVehicleOffline` | 48h freshness | picker disabled | P0.2 UNAVAILABLE + business | Partial | P0 |
| 11 | `deriveOperationalInsights.ts` | Counts soft_offline/offline vehicles | runtime | insight cards | Projection-based insights | Yes | P2 |
| 12 | `fleet-connectivity.presentation.ts` `formatLastTelemetry` | Display age labels | timestamp | UI string | Presentation only (OK) | N/A | P3 |

### Timestamp heuristic inventory

| Location | Heuristic | Threshold |
|----------|-----------|-----------|
| `telemetryFreshness.ts` | Age from canonical observation timestamps | 15m / 24h / 48h |
| `fleet-connectivity.presentation.ts` → `formatLastTelemetry` | Hours-ago label | <5m “live”; <48h hours; else absolute |
| `VehicleConnectionBadge` | Display age from `signalAgeMs` | Hours until 24h, then days |
| Health `data_stale` | Module freshness | Backend `RENTAL_HEALTH_STALE_MS` = 48h |

---

## F. Semantic collision table

| UI label (DE/EN) | Current source | Actual technical meaning | Ambiguity | Canonical replacement |
|------------------|----------------|------------------------|-----------|------------------------|
| “Offline” / `Fahrzeug offline` | `isVehicleOffline`, dashboard runtime, fleet Offline tab | Telemetry ≥48h or no signal | ≠ provider auth failure; ≠ business OUT_OF_SERVICE | P0.2 reason `TELEMETRY_OFFLINE` or connectivity `telemetryState` |
| “Offline” (24h) | Legacy `onlineStatus` in live map | Telemetry ≥24h | **Differs from canonical 48h** | Deprecate; use `telemetryState` |
| “Verfügbar” (fleet badge) | P0.2 `operationalAvailability=AVAILABLE` | Cross-domain ops availability | ≠ business tab “Available” | Keep; clarify tooltip via `primaryReason` |
| “Available” (business tab) | `selectOperationalStatus` / `operationalState` | Rental workflow state | ≠ provider reachable | Keep separate; never merge badges |
| “Ready to Rent” (dashboard KPI) | `deriveIsReadyForRenting` | Business available + clean + **not telemetry offline** | Conflates telemetry with rental readiness | Explicit: business ready + optional P0.2 gate |
| “Prüfung erforderlich” | P0.2 `NEEDS_VERIFICATION` | Auth/connectivity verification needed | ≠ mechanical defect | Correct — extend to booking/dashboard |
| “Nicht bewertbar” | P0.4 `NOT_EVALUABLE` | Health evidence insufficient | ≠ vehicle broken | Correct |
| “Gut” (health chip) | P0.4 condition when evaluable | Mechanical health summary | Blocked when not evaluable | Correct on fleet row |
| “Signal delayed” / soft-offline | Dashboard runtime `signal_delayed` | 24–48h telemetry | ≠ authorization issue | Connectivity presentation layer |
| `REAUTH_REQUIRED` (connectivity tab) | `providerLinkState` | Consent/auth ledger | Only shown on connectivity tab | Project to user-facing reason, not raw enum |

---

## G. Invariant checklist (I1–I12)

| ID | Invariant | Result | Evidence |
|----|-----------|--------|----------|
| I1 | Stale telemetry ≠ mechanical defect | **PASS** | `fleet-health-control-center.ts` — severity from `overall_state`/`rental_blocked`; `data_stale` separate; tests assert no downgrade from stale alone |
| I2 | TELEMETRY_STANDBY ≠ operationally unavailable | **PARTIAL** | P0.2 maps standby → often `NEEDS_VERIFICATION` not `UNAVAILABLE`; dashboard **FAILS** — `rentalReadiness` blocks only on `offline`, not standby |
| I3 | Auth problems ≠ physical device failure | **PASS** on connectivity tab; **PARTIAL** elsewhere | Connectivity tab separates `providerLinkState` vs `physicalDeviceState`; detail header lacks provider link |
| I4 | Physical device ≠ DIMO auth problem | **PASS** | `ObdUnpluggedBadge` separate from connection badge; backend builder keeps dimensions separate |
| I5 | businessState=AVAILABLE not overridden by client heuristic | **FAIL** | Dashboard `deriveIsReadyForRenting` blocks on `telemetryState === 'offline'` independent of P0.2; booking uses `isVehicleOffline` |
| I6 | PARTIALLY_EVALUABLE not shown as fully green | **PASS** on fleet row (P0.4); **PARTIAL** on dashboard health aggregates | `mapFleetHealthPresentation` gates “Gut” |
| I7 | UNKNOWN not silently OK | **PASS** on P0.3 badge (neutral “Status unbekannt”); **PARTIAL** on legacy paths when flags off | `createFleetOperationalAvailabilityUnknownFallback()` |
| I8 | primaryReason matches hierarchy | **PASS** backend; **PARTIAL** frontend | Builder `selectPrimaryReason()` deterministic; `presentation.ts` maps only 4 reason keys |
| I9 | recommendedAction matches reason | **PASS** on connectivity tab; **PARTIAL** fleet availability tooltip | Connectivity drawer shows paired fields; availability reason mapping incomplete |
| I10 | No second operational state machine | **FAIL** | `vehicleRuntimeStateBuilder` + `fleetVisualState` + dashboard insights parallel P0.2 |
| I11 | Infrastructure vs vehicle state separate | **PASS** Master; **PARTIAL** tenant | Master uses platform DTOs; dashboard “Data Freshness” blurs fleet telemetry KPI with ops readiness |
| I12 | Timestamps displayed, not redefining state | **PARTIAL** | Detail badge shows age; but `resolveTelemetryFreshness` **does** define state from timestamps client-side |

---

## H. Persona / audience projection findings

| Audience | Appropriate projection | Current gaps |
|----------|------------------------|--------------|
| **Org Admin** | User-facing availability + reason + action; hide raw enums | Fleet row OK; dashboard/booking/detail still technical/legacy |
| **Sub Admin** | Same as org admin, scoped | Same fleet-map path |
| **Worker (operator)** | Business status + tasks; minimal connectivity | `operatorStatus.ts` — intentionally no telemetry (OK) |
| **Driver** | Minimal | No significant connectivity consumption found |
| **Master Admin** | Full technical: `providerLinkState`, freshness buckets, attention | `ConnectedVehiclesHub` — correct; distinguish from tenant “Offline” |

**Adaptation required:** Org-facing surfaces need a controlled UI projection — not raw `REAUTH_REQUIRED`, but mapped reasons (e.g. “Fahrzeugdaten derzeit nicht aktuell” / “Anbieter-Verbindung prüfen”).

---

## I. i18n findings

**Locales in repo:** de, en, fr, nl, es, it, pl, cs (`frontend/src/rental/i18n/translations/`)

| Area | Status |
|------|--------|
| P0.3 `fleet.operationalAvailability.*` | **Complete** — tested across 8 locales |
| P0.4 `fleet.healthEvaluation.*` | **Complete** — tested across 8 locales |
| `fleetConnectivity.*` (~158 keys) | **DE + EN only** — fr/nl/es/it/pl/cs missing |
| Hardcoded DE | `VEHICLE_OFFLINE_LABEL` in `vehicles.ts`; dashboard components (`FleetReadinessScore`, `DataFreshnessIndicator`) use inline DE/EN ternaries |
| Reason keys gap | `CONSENT_MISSING`, `DATA_COVERAGE_INSUFFICIENT`, `LINK_ACTIVE` etc. exist under `fleetConnectivity.reason.*` but not under `fleet.operationalAvailability.reason.*` |
| Enum leakage | Connectivity tab shows technical `overallState` labels (acceptable for power users); fleet badges do not leak enums |

---

## J. Test coverage / gaps

**Backend:** Strong — 50+ spec files for projection, connectivity runtime, fleet-map P0.3/P0.4, provider link, provenance regressions.

**Frontend:** Good for migrated surfaces — `fleet-operational-availability-display.test.ts`, `fleet-health-evaluation-display.test.ts`, `telemetryFreshness.test.ts`, `connectivity-cross-surface-regression.test.ts`, `fleet-health-control-center.test.ts`.

| Scenario | Covered? |
|----------|----------|
| 1. healthy + live | Backend yes; frontend partial |
| 2. healthy + standby | Backend yes; dashboard runtime yes |
| 3. soft-offline, business available | Insights tests; **no P0.2 badge E2E** |
| 4. hard offline | `telemetryFreshness.test.ts`; booking preflight |
| 5. missing authorization | Backend connectivity specs; **no fleet badge E2E for KS-class recovery** |
| 6. reauth required | Connectivity tab tests; not dashboard/detail |
| 7. physical device issue | `physical-device-evidence` backend; OBD badge frontend |
| 8. partially evaluable | P0.4 display tests |
| 9. unknown | P0.3 unknown fallback tests |
| 10. canonical unavailable | Builder specs |
| 11. provider outage vs vehicle | **Gap** — no multi-vehicle UI test |
| 12. state recovery | Phase 2 prod evidence; **no automated UI regression** |
| 13. reason/action consistency | Backend yes; frontend partial (4 reason keys) |
| 14. no frontend re-derivation from timestamps | **FAIL** — `telemetryFreshness.ts` is intentional client mirror but violates ideal |

---

## K. Documentation vs code

| Doc | Verdict | Notes |
|-----|---------|-------|
| `architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md` | **DOC MATCHES CODE** | Layers A–F, physical device rules |
| `docs/audits/vehicle-operational-projection-p0-2-design-2026-08.md` | **DOC MATCHES CODE** | Builder consumes P0.1 by reference |
| `docs/audits/fleet-operational-availability-p0-3-2026-08.md` | **DOC MATCHES CODE** | Fleet row migrated; dashboard explicitly not |
| `docs/audits/fleet-health-evaluability-p0-4-2026-08.md` | **DOC MATCHES CODE** | Evaluability on fleet-map only |
| `architecture/DIMO_VEHICLE_PROVIDER_CONSENT_BACKFILL_2026-08.md` | **DOC MATCHES CODE** | Phase 2 closed; KS trio ACTIVE/AVAILABLE |
| `ArchitekturView.tsx` / `ChangesView.tsx` | **DOC MATCHES CODE** | Accurate migration status |
| `docs/audits/vehicle-connectivity-operational-state-audit-2026-08.md` | **DOC DRIFT** | Referenced in rules but **not present** in workspace |

---

## L. Risk register

| Risk | Severity | Description |
|------|----------|-------------|
| Dashboard “Ready to Rent” uses client telemetry offline | **P0** | Can mark business-available vehicle not ready based on 48h rule while P0.2 says AVAILABLE |
| Booking picker ignores P0.2 `NEEDS_VERIFICATION` | **P0** | Vehicle could be bookable while auth still flagged on other surfaces |
| Dual offline thresholds (24h vs 48h) | **P0** | `onlineStatus` vs `telemetryFreshness` schism in live map |
| Second operational state machine on client | **P1** | `vehicleRuntimeStateBuilder` duplicates P0.2 |
| Map tone ≠ fleet badge semantics | **P1** | Operators see conflicting signals |
| `fleetConnectivity.*` i18n only DE/EN | **P1** | Non-DE/EN locales get broken connectivity tab |
| Legacy health fallback when P0.4 flag off | **P2** | False “Gut” if flag disabled |
| Operator surface omits connectivity | **P3** | Intentional; document only |

---

## M. Recommended UI projection architecture (propose only — not implemented)

**Finding:** Partial layers already exist — do **not** add a third domain model.

```
Canonical backend (existing)
  VehicleConnectivityRuntimeState          [P0.1]
  VehicleOperationalProjection             [P0.2 internal]
  FleetMap slices: operationalAvailability, healthEvaluation, connectivityRuntime

                    ↓ extend (not replace)

Frontend contract layer (NEW — P1.1)
  types: CanonicalVehicleOperationalView
  source: fleet-map DTO + optional fleet-connectivity detail
  normalize: single mapper in rental/lib/operational-projection/

                    ↓

UI projection layer (NEW — P1.2)
  VehicleOperationalUiProjection
    - availabilityPresentation  (from P0.3 mapper — already exists)
    - healthPresentation        (from P0.4 mapper — already exists)
    - connectivityPresentation  (extract from fleet-connectivity.presentation.ts)
    - attentionPresentation     (severity + label from attention + primaryReason)
    - technicalDetail?          (Master Admin only — raw enums)

                    ↓

Dumb consumers (P1.3+)
  FleetOperatorRow, Dashboard KPIs, VehicleDetailHeader, BookingPicker, etc.
```

**Principles:**

1. One mapper entry: `mapVehicleOperationalUiProjection(vehicle, { audience, t })`
2. No `Date.now() - timestamp` state classification outside `telemetryFreshness.ts` until fully replaced by backend `connectivityRuntime.telemetryState` on fleet-map
3. Business filters continue using `selectOperationalStatus`; availability badges use P0.2 only
4. Master Admin keeps technical projection path (already server-side)

---

## N. Phased cutover plan (propose only — not implemented)

| Phase | Scope | Key files | Prereq | Risk | Tests | Prod behavior change |
|-------|-------|-----------|--------|------|-------|---------------------|
| **P1.1** Canonical frontend contract | TS types + mapper from fleet-map DTO | `api.ts`, new `operational-projection/` | None | Low | Unit mapper tests | No |
| **P1.2** Shared UI projection | Unify presentation modules under one facade | `operational-availability/`, `fleet-health-evaluation/`, `fleet-connectivity.presentation.ts` | P1.1 | Low | Presentation tests | No |
| **P1.3** Vehicle List completion | Map markers use projection; remove legacy health fallback flag | `fleetVisualState.ts`, `fleetVehicleDisplay.ts` | P1.2 | Med | Fleet display tests | **Yes** — map colors may shift |
| **P1.4** Vehicle Detail cutover | Header badge from `connectivityRuntime`; deprecate `onlineStatus` | `VehicleDetailHeaderBadges.tsx`, `useVehicleLiveMapStore.ts` | P1.2 | High | Detail + live map tests | **Yes** — badge timing may change (24h→48h alignment) |
| **P1.5** Dashboard / Fleet Readiness | Replace `vehicleRuntimeStateBuilder` readiness with P0.2 fields | `rentalReadiness.ts`, `vehicleRuntimeStateBuilder.ts`, `controlSignalsBuilder.ts` | P1.2 | High | Dashboard regression suite | **Yes** — KPI counts may change |
| **P1.6** Notifications alignment | Map notification causes to projection reasons | `fleet-readiness-attention-projection.ts` | P1.5 | Med | Notification tests | Possible |
| **P1.7** Master Admin parity | Ensure technical view uses same canonical enums | `master/connected-vehicles/*` | P1.1 | Low | Master tests | Low |
| **P1.8** Booking picker | Gate on P0.2 `operationalAvailability` + business rules | `booking-vehicle-preflight.ts` | P1.2 | High | Booking E2E | **Yes** — selection rules |
| **P1.9** Legacy removal | Remove `onlineStatus` consumer paths, runtime builder duplication | Multiple | P1.3–P1.8 | Med | Full regression | Yes |
| **P1.10** i18n completion | `fleetConnectivity.*` → 8 locales; remove hardcoded DE | `translations/*` | P1.2 | Med | i18n tests | Copy only |
| **P1.11** E2E verification | Scenarios 1–14 matrix; KS post-repair regression | `e2e/` | P1.3–P1.10 | — | New E2E specs | — |

---

## O. GO / NO-GO

| Question | Answer |
|----------|--------|
| **GO for beginning P1 implementation?** | **YES** — audit complete; canonical backend ready; phased plan defined |
| **UI CUTOVER READY (full cutover)?** | **NO** |

### Blockers for full cutover

1. No unified frontend UI projection facade — presentation split across 3+ modules with parallel dashboard runtime
2. Dashboard + booking + vehicle detail still on client-derived telemetry/business rules, not P0.2
3. `onlineStatus` 24h vs `telemetryState` 48h schism in live map store
4. `fleetConnectivity.*` i18n missing in 6 locales
5. P0.2 reason mapping incomplete in availability presentation (4 of 10+ codes)
6. No E2E proving post-consent KS recovery through fleet badges end-to-end

---

## Final gates

| Gate | Result |
|------|--------|
| CONSENT LEDGER (context) | **CLOSED** — KS trio ACTIVE/AVAILABLE (Phase 2) |
| CANONICAL BACKEND READY | **YES** |
| FLEET LIST/MAP CUT OVER | **PARTIAL** (badges yes, map tones no) |
| FULL UI CONSUMER CORRECTNESS | **NO** |
| **UI CUTOVER READY** | **NO** |

**STOP.** Await explicit authorization for P1.1 implementation.

---

## P. P1.1 implementation — Canonical frontend contract (2026-08-26)

| Field | Value |
|-------|-------|
| **Phase** | P1.1 — Canonical frontend contract |
| **Branch** | `cursor/vehicle-operational-state-p1-1-canonical-contract-90ec` |
| **Visible UI behavior changed** | **NO** |
| **Legacy consumers removed** | **NO** |

### Files created

| Path | Role |
|------|------|
| `frontend/src/rental/lib/operational-projection/types.ts` | `CanonicalVehicleOperationalView`, `CanonicalField<T>`, backend enum re-exports |
| `frontend/src/rental/lib/operational-projection/provenance.ts` | `presentField` / `absentField` helpers |
| `frontend/src/rental/lib/operational-projection/map-fleet-map-to-canonical.ts` | Single normalization mapper |
| `frontend/src/rental/lib/operational-projection/map-fleet-map-to-canonical.test.ts` | 21 focused Vitest cases |
| `frontend/src/rental/lib/operational-projection/index.ts` | Public module exports |
| `architecture/VEHICLE_OPERATIONAL_STATE_FRONTEND_CONTRACT_P1_1_2026-08.md` | Normative P1.1 contract doc |

### Files changed (documentation only)

| Path | Change |
|------|--------|
| `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` | This §P section |
| `frontend/src/master/components/ChangesView.tsx` | V4.9.960 changelog entry |
| `frontend/src/master/components/ArchitekturView.tsx` | P1.1 architecture entry |

### `CanonicalVehicleOperationalView` contract

```typescript
interface CanonicalVehicleOperationalView {
  vehicleId: string;
  business: {
    businessState: CanonicalField<BusinessOperationalState>;       // absent on fleet-map today
    operationalAvailability: CanonicalField<OperationalAvailabilityState>;
  };
  connectivity: {
    overallState: CanonicalField<OverallConnectivityState>;
    providerLinkState: CanonicalField<ProviderLinkState>;
    telemetryState: CanonicalField<FleetTelemetryFreshness>;
    physicalDeviceState: CanonicalField<PhysicalDeviceState>;
    dataCoverageState: CanonicalField<FleetDataCoverageState>;
    attentionState: CanonicalField<ConnectivityAttentionState>;
    reasonCodes: CanonicalField<readonly string[]>;
    recommendedAction: CanonicalField<ConnectivityRecommendedAction>;
  };
  health: {
    evaluability: CanonicalField<HealthEvaluabilityState>;
    condition: CanonicalField<FleetHealthConditionState>;
    pipelineAvailability: CanonicalField<'ready' | 'partial' | 'unavailable' | null>;
  };
  operator: {
    primaryReason: CanonicalField<string | null>;
    recommendedAction: CanonicalField<string>;
    attention: CanonicalField<string>;
    reasonCodes: CanonicalField<readonly string[]>;
  };
}
```

`CanonicalField<T>` carries `{ value, presence: 'present' | 'absent', source }` to distinguish backend-supplied `UNKNOWN` from a missing slice.

### Mapper input → output provenance matrix

| Canonical field | Primary source | Fallback source |
|-----------------|----------------|-----------------|
| `vehicleId` | `fleet_map.id` | — |
| `business.businessState` | — | **absent** (not on fleet-map; never inferred from legacy `status`) |
| `business.operationalAvailability` | `fleet_map.operationalAvailability.state` | **absent** if slice missing |
| `connectivity.*` | `fleet_map.connectivityRuntime` (complete snapshot) | `fleet_connectivity.detail` **whole-slice only** when runtime absent |
| `health.*` | `fleet_map.healthEvaluation` | **absent** if slice missing |
| `operator.primaryReason` | `fleet_map.operationalAvailability.primaryReason` | **absent** |
| `operator.recommendedAction` | `fleet_map.operationalAvailability.recommendedAction` | **absent** |
| `operator.attention` | `fleet_map.operationalAvailability.attention` | **absent** |
| `operator.reasonCodes` | `fleet_map.operationalAvailability.reasonCodes` | **absent** |

**Explicitly ignored inputs:** `onlineStatus`, `telemetryFreshness`, `lastSeenAt`, `signalAgeMs`, `isFresh`, legacy `status`.

### P1.1 final contract hardening (2026-08-26)

- Added `field-semantics.ts` + `connectivity-enums.ts` — strict per-field guards
- Omitted fields no longer coerced to `NONE`, `[]`, or `null`
- Unrecognized enums => `absent` (not coerced to UNKNOWN/available/good)
- `fleetConnectivityDetail` documented as whole-slice fallback only; runtime wins when both present
- Tests: 29 cases (`map-fleet-map-to-canonical.test.ts`)

### Tests (29 cases)

Covers: ACTIVE+live+AVAILABLE, ACTIVE+standby+AVAILABLE, offline+NEEDS_VERIFICATION/UNAVAILABLE, REAUTH_REQUIRED, REVOKED, DEVICE_UNPLUGGED, AUTHORIZATION_REQUIRED, NO_ACTIVE_DATA_SOURCE, UNKNOWN, EVALUABLE/PARTIALLY_EVALUABLE/NOT_EVALUABLE health, missing connectivityRuntime, missing healthEvaluation, backend UNKNOWN vs absent, reasonCodes/recommendedAction preservation, no timestamp-derived availability fallback, fleet-connectivity detail enrichment.

Command: `npx vitest run src/rental/lib/operational-projection/map-fleet-map-to-canonical.test.ts`

### Remaining legacy consumers (unchanged)

- `fleet-map-vehicle-mapper.ts` — still maps to `FleetMapVehicleRow` / `VehicleData`
- `fleetVehicleDisplay.ts`, `fleetVisualState.ts` — map tones + legacy telemetry
- `vehicleRuntimeStateBuilder.ts`, `controlSignalsBuilder.ts` — dashboard readiness
- `VehicleDetailHeaderBadges.tsx`, `useVehicleLiveMapStore.ts` — detail connection badge
- `booking-vehicle-preflight.ts` — booking picker offline gate
- `operational-availability/presentation.ts`, `fleet-health-evaluation/presentation.ts` — direct slice presentation (not yet behind P1.2 facade)

### P1.1 gate

| Gate | Result |
|------|--------|
| P1.1 CANONICAL FRONTEND CONTRACT | **PASS** |
| P1.2 READY | **YES** (contract + tests in place; no UI cutover started) |
| UI CUTOVER READY | **NO** (unchanged from audit §O) |

**STOP.** P1.2 not started.

---

## Q. P1.2 implementation — Shared UI projection facade (2026-08-26)

| Field | Value |
|-------|-------|
| **Phase** | P1.2 — Shared presentation facade |
| **Visible UI behavior changed** | **NO** |
| **Consumer cutover** | **NO** |

### Presentation inventory (pre-P1.2)

| Module | Function | Reuse in P1.2 |
|--------|----------|---------------|
| `operational-availability/presentation.ts` | `mapOperationalAvailabilityPresentation` | **Wrapped** — availability slice |
| `fleet-health-evaluation/presentation.ts` | `mapFleetHealthPresentation` | **Wrapped** — health slice |
| `fleet-connectivity.presentation.ts` | `overallStateLabel`, `attentionTone`, `recommendedActionLabel`, etc. | **Wrapped** — connectivity/attention slices |
| `operational-availability/presentation.ts` REASON_LABEL_KEYS | 4 of 9+ P0.2 codes | **Extracted** → `OPERATIONAL_PRIMARY_REASON_LABEL_KEYS` (9 codes + unknown fallback) |

### Files created

| Path | Role |
|------|------|
| `operational-projection/ui/types.ts` | `VehicleOperationalUiProjection` contract |
| `operational-projection/ui/primary-reason-presentation.ts` | Extended primaryReason mapping + safe unknown fallback |
| `operational-projection/ui/map-connectivity-presentation.ts` | Connectivity + attention + operator presentation |
| `operational-projection/ui/map-vehicle-operational-ui-projection.ts` | **Public facade** |
| `operational-projection/ui/map-availability-ui-presentation.ts` | Provenance-aware availability slice mapper |
| `operational-projection/ui/map-health-ui-presentation.ts` | Provenance-aware health slice mapper |
| `operational-projection/ui/map-vehicle-operational-ui-projection.test.ts` | 53 P1.2 tests |
| `operational-projection/ui/index.ts` | Public exports |
| `architecture/VEHICLE_OPERATIONAL_STATE_UI_PROJECTION_P1_2_2026-08.md` | Normative P1.2 doc |

### Public facade

```typescript
mapVehicleOperationalUiProjection(
  canonical: CanonicalVehicleOperationalView,
  options: { audience: 'org_admin' | 'master_admin' | 'worker'; t: OperationalTranslator },
): VehicleOperationalUiProjection
```

### `VehicleOperationalUiProjection` structure

- `availability` — `UiPresentationSlice<AvailabilityUiPresentation>` (state labels + provenance-aware operator sub-fields)
- `health` — `UiPresentationSlice<HealthUiPresentation>` (evaluability labels + provenance-aware condition/pipeline sub-fields)
- `connectivity` — per-field connectivity presentations (overallState, providerLink, telemetry, device, coverage, recommendedAction, reasonCodes)
- `attention` — operator attention + reason/action presentation
- `operator` — primaryReason, recommendedAction, attention, reasonCodes (with absent/present semantics)
- `technicalDetail?` — master_admin only (raw canonical enums)

### primaryReason coverage (DE/EN)

All 9 backend precedence codes now mapped:

`BUSINESS_WORKFLOW_BLOCKED`, `HEALTH_RENTAL_BLOCKED`, `DEVICE_UNPLUG_WEBHOOK`, `CONNECTIVITY_CONFIRMED_INTERRUPTION`, `DEVICE_CHECK_REQUIRED`, `CONNECTIVITY_VERIFICATION_REQUIRED`, `TELEMETRY_OFFLINE`, `DATA_COVERAGE_INSUFFICIENT`, `INSUFFICIENT_CROSS_DOMAIN_EVIDENCE`

Unknown future codes: `fleet.operationalAvailability.reason.unknown` (org_admin); raw code in `technicalDetail` (master_admin).

### P1.2 review fix — availability/health provenance (2026-08-26)

**Root cause:** Initial P1.2 wrapped legacy `mapOperationalAvailabilityPresentation` / `mapFleetHealthPresentation` via adapter DTOs that fabricated `null`, `[]`, `NONE`, and `unknown` when canonical operator/health fields were `absent`.

**Fix:** Dedicated `mapAvailabilityUiPresentation` and `mapHealthUiPresentation` compose state-only labels from P0.3/P0.4 helpers and map each semantic sub-field independently with `UiPresentationSlice` (`presence: absent` when canonical absent). No legacy flat DTO adapter.

**Cross-slice tests added:** 14 (tests 1–12 + 2 dumb-consumer guards) proving `ui.availability` and `ui.health` preserve absent vs explicit-null/[]/NONE/unknown semantics.

### P1.2 final review fix — technical detail provenance (2026-08-26)

**Root cause:** `mapTechnicalDetail()` used `readCanonicalField(...) ?? null` and `absent → []` for `reasonCodes`, collapsing absent canonical fields into explicit null/[].

**Fix:** `TechnicalDetailProjection` fields are now `UiPresentationSlice<T>` via `map-technical-detail.ts` (`mapCanonicalFieldToTechnicalSlice`). Master admin technical detail preserves absent vs explicit null/[]/NONE/UNKNOWN.

**Technical detail tests added:** 14 (12 provenance scenarios + org_admin/worker guards).

### Tests

- P1.1 regression: **29 passed**
- P1.2 facade: **67 passed** (30 scenarios + 14 availability/health provenance + 14 technical detail + 9 primaryReason coverage)
- Related presentation regression: **146 total passed**

### Legacy consumers (intentionally unchanged)

FleetOperatorRow, FleetMapVehicleStatusHud, fleetVisualState, dashboard runtime, VehicleDetailHeaderBadges, booking preflight, fleet-map-vehicle-mapper — still use direct slice presentation or legacy paths.

### P1.2 gate

| Gate | Result |
|------|--------|
| P1.2 SHARED UI PROJECTION | **PASS** |
| PROVENANCE PRESERVATION | **PASS** |
| TECHNICAL DETAIL PROVENANCE | **PASS** |
| ABSENT != NULL / [] / NONE / UNKNOWN | **PASS** |
| P1.1 REGRESSION | **PASS** |
| NO SECOND STATE MACHINE | **PASS** |
| NO TIMESTAMP RE-DERIVATION | **PASS** |
| NO LEGACY ONLINESTATUS DEPENDENCY | **PASS** |
| VISIBLE UI BEHAVIOR CHANGED | **NO** |
| P1.3 READY | **YES** |

**STOP.** P1.3 not started.

---

## R. P1.3 implementation — Fleet list / map consumer cutover (2026-08-26)

| Field | Value |
|-------|-------|
| **Phase** | P1.3 — Fleet list + map consumer cutover |
| **Visible UI behavior changed** | **YES** (Fleet marker tone, semantic badges, attention offline semantics) |
| **Consumer cutover** | **Fleet list row, map HUD, map marker tone only** |

### Consumers migrated

| Consumer | Before | After |
|----------|--------|-------|
| `FleetOperatorRow` | Direct P0.3/P0.4 slice flags | `uiProjection` → `resolveFleetVehicleDisplayState` |
| `FleetMapVehicleStatusHud` | Direct slice flags | Same |
| `fleetVisualState` / map markers | `isVehicleOffline()` + `resolveTelemetryFreshness()` | `deriveFleetVisualStateFromUiProjection()` when `uiProjection` present |
| `fleetVehicleDisplay` | Legacy health/telemetry fallback possible | Projection path; no false Gut when health absent |
| `FleetView` geojson | Legacy visual derivation | `getUiProjection` from `FleetVehicleContext` |

### Files created

| Path | Role |
|------|------|
| `fleet-vehicle-ui-projection.ts` | `VehicleData` → fleet-map DTO → P1.1 → P1.2 bridge |
| `fleet-visual-from-projection.ts` | Map marker visual precedence from P1.2 |
| `fleet-p1-3-display.ts` | Availability/health/telemetry display from P1.2 |
| `fleet-operational-p1-3-cutover.test.ts` | 19 P1.3 tests |
| `architecture/VEHICLE_OPERATIONAL_STATE_FLEET_CONSUMER_CUTOVER_P1_3_2026-08.md` | Normative P1.3 doc |

### Map marker precedence

1. Critical / action-required (attention, UNAVAILABLE, DEVICE_UNPLUGGED, AUTHORIZATION_REQUIRED)
2. Operationally unavailable → `blocked`
3. Needs verification → `stale`
4. Active business workflow (rented / reserved / maintenance)
5. Available → `ready` (standby does **not** downgrade)
6. Unknown / no data

### Fleet Command filter semantics

| Filter / bucket | Semantic domain |
|-----------------|-----------------|
| Available / Reserved / Active / Maintenance / Unknown tabs | **Business workflow** (`operationalState`) |
| Attention bucket offline | Canonical `connectivityRuntime.overallState === OFFLINE` (not `isVehicleOffline`) |
| Attention bucket soft-offline | Canonical `SOFT_OFFLINE` / needs verification (not 24–48h client threshold alone) |

### Legacy removed from P1.3 fleet path

- `isVehicleOffline()` — not used by fleet row/HUD/marker when `uiProjection` wired
- `resolveTelemetryFreshness()` — not used for operational map tone when projection present
- `onlineStatus` / `lastSeenAt` / `signalAgeMs` — informational only; canonical wins in conflict tests
- False `Gut` health fallback when `healthEvaluation` absent

### Legacy retained (intentional)

- `deriveFleetVisualState()` without `uiProjection` — non-fleet callers / direct unit tests
- Dashboard runtime, Vehicle Detail, booking preflight — unchanged (P1.4+)

### Tests

| Suite | Result |
|-------|--------|
| P1.3 focused | **19 passed** |
| P1.1 regression | **29 passed** |
| P1.2 regression | **67 passed** |
| Fleet regression bundle | **223 passed** (15 files) |
| Frontend build | **PASS** |

### Expected visible changes

- Map markers: `AVAILABLE` + `STANDBY` remain ready (not offline)
- Map markers: canonical `OFFLINE` + `NEEDS_VERIFICATION` → stale (not blocked unless UNAVAILABLE)
- Health: absent / PARTIALLY_EVALUABLE / NOT_EVALUABLE never show Gut on Fleet row
- Filter tabs unchanged (business); attention offline follows connectivity runtime

### P1.3 gates

| Gate | Result |
|------|--------|
| P1.3 FLEET LIST CUTOVER | **PASS** |
| P1.3 MAP HUD CUTOVER | **PASS** |
| P1.3 MAP MARKER CUTOVER | **PASS** |
| P1.3 FILTER SEMANTICS | **PASS** |
| NO CLIENT TIMESTAMP OPERATIONAL DERIVATION (fleet P1.3) | **PASS** |
| NO LEGACY ONLINESTATUS OPERATIONAL DEPENDENCY (fleet P1.3) | **PASS** |
| NO FALSE HEALTHY FALLBACK (fleet P1.3) | **PASS** |
| CROSS-SURFACE CONSISTENCY | **PASS** |
| P1.1/P1.2 REGRESSION | **PASS** |
| P1.4 READY | **YES** |

**STOP.** P1.4 not started.

---

## R.1 P1.3 review hardening (PR #1320 — 2026-08-26)

| Fix | Detail |
|-----|--------|
| Provenance | Removed `vehicleDataToFleetMapResponse()` round-trip; added `mapFleetStoreVehicleToCanonicalVehicleOperationalView()` |
| Store mapper | `mapOperationalAvailability` / `mapHealthEvaluation` no longer coerce absent → null/[]/NONE/unknown |
| Precedence | Critical connectivity (`DEVICE_UNPLUGGED`, `AUTHORIZATION_REQUIRED`, `INTEGRATION_ERROR`, `CRITICAL` attention, `UNAVAILABLE`) outranks availability UNKNOWN/absent |
| Health map attention | `NOT_EVALUABLE` / `PARTIALLY_EVALUABLE` no longer force map attention marker |
| i18n | Map marker labels use P1.2 / `fleetConnectivity.*` / `formatVehicleOperationalStatusLabel` — no new hardcoded EN strings |

P1.3 tests: **45/45** (added precedence A–G, provenance, health evaluability, i18n, contract-drift A–H).

### R.2 Contract-drift enum hardening (PR #1320 — 2026-08-26)

Fleet store mapper no longer calls `normalize*()` helpers that coerce unrecognized enum values to UNKNOWN. Guards (`isOperationalAvailabilityState`, `isHealthEvaluabilityState`, `isFleetHealthConditionState`, `isPipelineAvailability`) preserve explicit UNKNOWN vs future/absent semantics on the P1.3 canonical path.

---

## S. P1.4 implementation — Vehicle Detail header / connectivity cutover (2026-08-26)

| Field | Value |
|-------|-------|
| **Phase** | P1.4 — Vehicle Detail header + connectivity presentation |
| **Branch** | `cursor/vehicle-operational-state-p1-4-vehicle-detail-90ec` |
| **Baseline main** | `df674776` (P1.3 merged #1320) |

### Detail consumers migrated

| File | Migration |
|------|-----------|
| `VehicleDetailHeaderBadges.tsx` | `VehicleConnectionBadge` + `VehicleHealthChip` use P1.2 projection |
| `VehicleDetailHeader.tsx` | Readiness chip passes `uiProjection` to `resolveFleetVehicleDisplayState` |
| `OverviewLiveMapCard.tsx` | Map tracking badge from `resolveVehicleDetailMapTrackingBadge` |
| `vehicle-detail-operational-display.ts` | New detail bridge (connectivity + cross-surface helpers) |
| `vehicles.ts` | `connectivityRuntime?` on `VehicleData` type |

### Canonical input source

`selectedVehicle` from fleet-map store (`GET /organizations/:orgId/fleet-map`) — fields:

- `connectivityRuntime` (P0.1)
- `operationalAvailability` (P0.3)
- `healthEvaluation` (P0.4)

Bridge: `buildFleetVehicleUiProjection()` → `mapVehicleOperationalUiProjection(audience: org_admin)`.

### Legacy timestamp rules removed/bypassed (Vehicle Detail only)

- `VehicleConnectionBadge` no longer calls `resolveTelemetryFreshness({ lastSignal, onlineStatus })`
- No 24h/48h client operational derivation in header connectivity path
- Informational last-data text via `formatLastTelemetry(connectivityRuntime.lastTelemetryAt)` only

### Badge semantics

| Badge | Authority |
|-------|-----------|
| Readiness / availability | `ui.availability` |
| Connection | `ui.connectivity` (+ critical `overallState` precedence) |
| Health | `ui.health` evaluability + condition |

### Expected visible changes

- STANDBY + old `lastSeenAt` → Standby/Verfügbar, not Offline
- `AUTHORIZATION_REQUIRED` overrides legacy ONLINE
- `NOT_EVALUABLE` / `PARTIALLY_EVALUABLE` → evaluability labels, not Gut
- Fleet row / map HUD / detail header agree on canonical state

### Remaining P1.5+ consumers

- Dashboard runtime / Fleet Readiness KPIs
- Booking picker `isVehicleOffline()` gate
- Notifications offline generation
- Master Admin redesign
- Global legacy helper deletion

### P1.3 stale docs corrected

`architecture/VEHICLE_OPERATIONAL_STATE_FLEET_CONSUMER_CUTOVER_P1_3_2026-08.md` canonical path updated to `mapFleetStoreVehicleToCanonicalVehicleOperationalView()` (removed `vehicleDataToFleetMapResponse()` round-trip reference).

### Tests

| Suite | Result |
|-------|--------|
| P1.4 focused | **21/21** |
| P1.3 regression | **45/45** |
| P1.2 regression | **67/67** |
| P1.1 regression | **29/29** |
| Vehicle detail bundle | **185/185** |
| Build/typecheck | **PASS** |

### P1.4 gates

| Gate | Status |
|------|--------|
| P1.4 VEHICLE DETAIL CUTOVER | **PASS** |
| NO LOCAL TIMESTAMP OPERATIONAL DERIVATION | **PASS** |
| NO LEGACY ONLINESTATUS AUTHORITY | **PASS** |
| CANONICAL REASON/ACTION | **PASS** |
| HEALTH EVALUABILITY SEMANTICS | **PASS** |
| CROSS-SURFACE CONSISTENCY | **PASS** |
| P1.1/P1.2/P1.3 REGRESSION | **PASS** |
| P1.5 READY | **YES** |

**STOP.** P1.5 not started.

---

## Related architecture references

- `architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md`
- `architecture/FLEET_CONNECTIVITY_RUNTIME_DOMAIN_2026-07-19.md`
- `docs/audits/vehicle-operational-projection-p0-2-design-2026-08.md`
- `docs/audits/fleet-operational-availability-p0-3-2026-08.md`
- `docs/audits/fleet-health-evaluability-p0-4-2026-08.md`
- `architecture/DIMO_VEHICLE_PROVIDER_CONSENT_BACKFILL_2026-08.md`
