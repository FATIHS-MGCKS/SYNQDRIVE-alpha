# Vehicle Detail Connectivity UI/UX Certification — P1.8C (2026-08)

Final certification slice for the P1.8 connectivity UX/UI refinement track.

- P1.8A — Vehicle Detail Overview Connectivity Card (PR #1350, merged)
- P1.8B — Vehicle Detail Connectivity Tab + shared detail sections (PR #1353, merged)
- P1.8C — this certification (tests + targeted consistency hardening only)

Baseline: `main` @ `676796022059b2b1810863bc46fee90f0e8bd00f` (merge commit of #1353).

## Scope and non-goals

P1.8C proves that the same canonical connectivity runtime state
(`VehicleConnectivityRuntimeState` / `GET /organizations/:orgId/fleet-connectivity/:vehicleId`)
produces semantically consistent output across all P1.8 surfaces. It is not a
redesign. No backend semantics, connectivity runtime builder, telemetry
thresholds, booking/readiness semantics, or P1 operational-state architecture
were changed.

## Certified surfaces

| # | Surface | Projection under test |
|---|---------|----------------------|
| 1 | Fleet list / map connectivity | `resolveFleetVehicleDisplayState` + `buildFleetVehicleUiProjection` |
| 2 | Fleet Connectivity detail drawer | `FleetConnectivityDetailSections` (`variant="drawer"`) |
| 3 | Vehicle Detail Overview connectivity card | `buildVehicleConnectivityOverviewView` |
| 4 | Vehicle Detail Connectivity tab | `FleetConnectivityDetailSections` (`variant="page"`) |
| 5 | Vehicle Detail header connectivity badge | `resolveVehicleDetailConnectivityPresentation` |

Certification suite: `frontend/src/rental/lib/connectivity-cross-surface-certification.test.tsx`
(30 tests). One deterministic fixture builder (`buildConnectivityScenario`)
derives runtime, fleet-connectivity detail, device-connection summary, and
fleet projection vehicle from a single canonical scenario spec, so every
surface is fed the same canonical state.

## Scenario matrix

| Scenario | Canonical input | Result |
|----------|----------------|--------|
| A | live / ACTIVE / PLUGGED_CONFIRMED / no episode / NONE | PASS — healthy/live on all five surfaces |
| B | standby / ACTIVE / UNKNOWN / no episode / NONE | PASS — no critical offline presentation; device stays Unknown |
| C | signal_delayed / ACTIVE / UNKNOWN / no episode / WATCH | PASS — watch semantics, never escalated to critical |
| D | offline / ACTIVE / UNKNOWN / no episode / WATCH (critical regression case) | PASS — telemetry Offline, provider Active, device Unknown, no interruption on every surface; no surface claims connected/live |
| E | DEVICE_UNPLUGGED / ACTIVE / UNPLUGGED_CONFIRMED / open episode / CRITICAL | PASS — unplug + active interruption visible with chip emphasis; provider stays independently Active |
| F | AUTHORIZATION_REQUIRED / REAUTH_REQUIRED | PASS — authorization problem visible, no conflation with unplugging, recommended action = reauthorize provider |
| G | INTEGRATION_ERROR / provider ERROR | PASS — integration issue clear, device state independent |
| H | UNKNOWN / NO_LINK / UNKNOWN / no episode | PASS — no fabricated healthy state, no false active interruption |
| I | recovered episode (live, no active episode, recovery in timeline) | PASS — current state healthy, timeline still shows recovery + unplug, no stale interruption |

## Core invariants (asserted in tests)

- `provider ACTIVE != telemetry LIVE` — provider link renders with neutral
  tone and its own label (`Authorized`); scenario D proves offline telemetry
  coexists with an active provider on every surface.
- `no active episode != vehicle online` — scenarios B/C/D/H show "No active
  interruption" while telemetry is standby/delayed/offline/no-signal.
- `physical device UNKNOWN != connected` — Unknown renders with noData tone
  and is never presented as `Device connected`.
- `attention CRITICAL != operationally unavailable` — unchanged; the existing
  cross-surface regression (`booking_operational_gate` follows P0.2) still passes.

## Legacy contradiction certification

Changing only legacy fields (`online`, `lastSignal`/`signalAgeMs`,
`healthStatus`, device-connection snapshot fields
`currentDeviceConnectionStatus`, `lastDevicePluggedInAt`,
`lastWebhookReceivedAt`, `webhookConfigured`, plug counters) does not alter
any canonical presentation:

- Header stays `Offline` when the runtime says OFFLINE even with fresh legacy
  timestamps and `online: true`; stays `Live` when the runtime says live even
  with 100h-stale legacy timestamps.
- Overview card output is byte-identical when only legacy summary fields are
  mutated. No legacy field re-entered as authority in P1.8 surfaces.

## Header consistency verdict: PASS

The Vehicle Detail header connectivity badge (`VehicleConnectionBadge` in
`VehicleDetailHeaderBadges.tsx`) derives label/tone exclusively from
`resolveVehicleDetailConnectivityPresentation`, which projects the canonical
runtime through `buildFleetVehicleUiProjection`. It therefore cannot say Live
while the canonical runtime says Offline, and it renders
`DEVICE_UNPLUGGED` critical when the canonical physical device state is
UNPLUGGED_CONFIRMED (both asserted in tests).

The supplementary `ObdUnpluggedBadge` is gated on
`shouldShowObdUnpluggedBadge`, which fires only on an explicit snapshot
`obdIsPluggedIn === false` (the same snapshot rule Fleet Connectivity uses).
It is additive unplug evidence: it can never claim "connected", and
null/undefined/true suppress it, so it cannot contradict a canonical
UNPLUGGED_CONFIRMED (the primary label already shows the unplug) nor fabricate
health for an UNKNOWN device. No header correction was needed.

## Surface certifications

- Overview card: PASS — consumes `connectivityRuntime`; primary state is
  telemetry; provider/device/interruption separate; no "DIMO LTE_R1
  verbunden", no "Status (Webhook)" (source-level guards); no badge overload
  (dimension rows are label/value text unless genuinely high-attention).
- Connectivity tab: PASS — real tab registered; uses the canonical
  fleet-connectivity detail API and shared `FleetConnectivityDetailSections`
  with `variant="page"`; no duplicated state mapper (source-level guard);
  mobile single-column (`grid-cols-1`), desktop paired sections
  (`lg:grid-cols-2`), technical section collapsed by default.
- Fleet drawer: PASS — extraction kept the drawer as shell-only around the
  shared sections (`variant="drawer"`), narrow single-column (no
  `lg:grid-cols-2`), same canonical dimension values as the page variant
  (asserted by extracting and comparing dimension test-ids across variants).
- DE/EN: PASS — scenario D certified in both locales; all canonical dimension
  keys resolve in `de` and `en`; `vehicleDetail.connectivity*` keys are shell
  copy only and no longer duplicate canonical state label values.

## Production corrections (minimal)

One copy/i18n consistency finding was corrected:

- `vehicleDetail.connectivity.noActiveInterruption` /
  `vehicleDetail.connectivity.activeInterruption` duplicated
  `fleetConnectivity.detail.noActiveInterruption` /
  `fleetConnectivity.detail.activeInterruption` with identical DE/EN values
  (introduced across P1.8A/P1.8B). The Overview card presentation
  (`vehicle-connectivity-presentation.ts`) now reuses the
  `fleetConnectivity.detail.*` keys and the duplicates were removed from
  `de.ts`/`en.ts`. Rendered strings are unchanged in both locales — semantics
  and visible copy identical, single label source restored.

No other production code changed. Backend/runtime semantics unchanged.

## Regression summary

- `connectivity-cross-surface-certification.test.tsx` — 30 passed (new)
- `connectivity-cross-surface-regression.test.ts` — 22 passed
- `fleet-connectivity-detail-sections.test.tsx` — 11 passed
- `VehicleConnectivityTab.test.tsx` — 6 passed
- `vehicle-connectivity-presentation.test.ts` — 8 passed (P1.8A)
- `vehicle-detail-a11y.ui.test.tsx` — 2 passed
- Fleet Connectivity ui/utils/filters/presentation — 27 passed
- P1.3 / P1.4 / P1.6 / P1 FINAL operational cutover suites — 125 passed
- Focused battery total: 231 passed, 0 failed
- `npm run build` (tsc -b + vite) — PASS

## Final P1.8 closure verdict

- CROSS-SURFACE CONNECTIVITY SEMANTICS: PASS
- PROVIDER ACTIVE != TELEMETRY LIVE: PASS
- NO ACTIVE EPISODE != VEHICLE ONLINE: PASS
- PHYSICAL DEVICE UNKNOWN PRESERVED: PASS
- HEADER CONSISTENCY: PASS
- OVERVIEW CARD: PASS
- VEHICLE CONNECTIVITY TAB: PASS
- FLEET CONNECTIVITY DRAWER: PASS
- LEGACY AUTHORITY REINTRODUCED: NO
- BACKEND/RUNTIME SEMANTICS CHANGED: NO

P1.8 CONNECTIVITY UX/UI REFINEMENT: CLOSED.
