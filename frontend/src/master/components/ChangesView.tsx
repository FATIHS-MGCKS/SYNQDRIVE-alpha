import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  FileText,
  Filter,
  Layers,
  Loader2,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

export interface ChangesViewProps {
  isDarkMode: boolean;
}

export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  summary: string[];
  reason: string | null;
  previousBehavior: string | null;
  details: string | null;
  affectsArchitecture: boolean;
  module: string | null;
  createdAt: string;
}

const PRESET_MODULES = ['Insurance', 'Parts & Accessories', 'Master Admin', 'Vehicle Intelligence', 'Automation'] as const;

export const FALLBACK_ENTRIES: ChangelogEntry[] = [
  {
    id: 'fleet-shell-runtime-audit-hardening-2026-04-15',
    version: '4.6.24',
    title:
      'V4.6.24 Rental/Fleet runtime hardening — crash-path fix, SPA login fallback, and dead-page cleanup',
    summary: [
      'FIX: Rental shell no longer crashes when customer-detail IDs are malformed; TopBar receives a guarded `detailCustomerId` value',
      'FIX: Added app-level runtime error boundary for Rental shell to prevent single-component crashes from blanking the entire page',
      'FIX: Fleet map fetch now tolerates wrapped payload shapes (`{ data: [] }`) and filters invalid rows before mapping',
      'FIX: Backend SPA fallback now serves `/login` routes so auth redirects do not land on a white/404 page in production builds',
      'HARDENING: Enum label rendering in Fleet Condition and Health Errors now guards against non-string runtime payloads',
      'CLEANUP: Removed 5 unreferenced legacy Rental `*Page.tsx` files that were no longer part of active routing and used stale API contracts',
    ],
    reason:
      'The Fleet white-screen investigation showed that a single unsafe render path or auth-route mismatch could take down the whole Rental surface. Runtime guards and routing parity were required to reduce blast radius and improve recovery behavior.',
    previousBehavior:
      'Rental shell could hard-fail on malformed customer IDs, fleet payload shape drift, or auth redirects to `/login` without a matching SPA fallback route. Legacy page files also remained in-tree with stale API assumptions.',
    details: [
      'frontend/src/rental/App.tsx — guarded customer ID formatting + Rental app error boundary wrapping',
      'frontend/src/components/AppErrorBoundary.tsx — NEW reusable crash boundary with safe reload fallback',
      'frontend/src/rental/stores/useFleetMapStore.ts — response normalization + invalid-row filtering before mapping',
      'frontend/src/components/MapboxMap.tsx — map initialization error-state handling',
      'frontend/src/rental/components/FleetConditionView.tsx + FleetConditionDetailView.tsx + HealthErrorsView.tsx — safe enum label formatting',
      'backend/src/spa-fallback.controller.ts — added `/login` SPA fallback routes',
      'frontend/src/rental/{BookingsPage,CustomersPage,DashboardPage,StationsPage,VehiclesPage}.tsx — removed dead legacy pages',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fleet-view-defensive-runtime-fix-2026-04-15',
    version: '4.6.23',
    title:
      'V4.6.23 Fleet View — defensive runtime guards for malformed map/vehicle payloads',
    summary: [
      'FIX: Fleet view now sanitizes map-center input to prevent Mapbox initialization crashes on invalid coordinates',
      'FIX: Fleet map store now normalizes non-finite latitude/longitude/heading/signal age values before UI consumption',
      'FIX: Fleet vehicle mapping now guarantees a safe non-empty model fallback to prevent string-operation runtime crashes',
      'UX: Fleet screen now surfaces API fetch errors inline instead of silently failing with empty state',
      'HARDENING: Fleet table fallback text normalized to safe placeholders for missing optional fields',
    ],
    reason:
      'Fleet page navigation could fail or appear broken when backend/runtime data contained malformed numeric values or unexpectedly missing display strings. The view now degrades safely instead of crashing.',
    previousBehavior:
      'Invalid coordinate/model payloads could cascade into Fleet map/rendering failures with no visible in-view error state for users.',
    details: [
      'frontend/src/rental/stores/useFleetMapStore.ts — added finite-number sanitization and safe model fallback mapping',
      'frontend/src/rental/components/FleetView.tsx — added map-error banner, safe title derivation, and stricter coordinate filtering',
      'frontend/src/components/MapboxMap.tsx — added center sanitization guard before map initialization',
    ].join('\n'),
    affectsArchitecture: false,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'driving-analysis-canonical-observability-2026-04-15',
    version: '4.6.22',
    title:
      'V4.6.22 Driving Analysis — canonical trust diagnostics, assignment coverage metrics, and targeted test hardening',
    summary: [
      'OBSERVABILITY: Added first-class Prometheus counters for canonical trip assignment resolutions (`status`, `score_eligible`), legacy-vs-canonical score drift buckets, and zero-counter enrichment anomalies',
      'ASSIGNMENT COVERAGE: TripAssignmentService now records assignment/private scoring eligibility decisions during canonical assignment writes',
      'SCORE DRIFT: DrivingImpactService now emits drift telemetry when mirrored VehicleTrip.drivingScore meaningfully diverges from TripDrivingImpact.drivingStyleScore',
      'ZERO-COUNT MISMATCH GUARD: TripBehaviorEnrichmentService now detects and counts rows-present/zero-counters anomalies for HF and LTE_R1 enrichment paths',
      'TESTS: Added targeted unit tests for canonical trip analytics hydration, trip assignment/private resolution rules, and driver score aggregation',
      'TESTS: Extended DrivingImpactService tests to assert score-drift metric emission behavior',
    ],
    reason:
      'Canonical trip semantics and score truth were already refactored, but production trust still needed measurable runtime diagnostics for assignment eligibility, drift visibility, and enrichment mismatch detection plus explicit regression tests around those trust boundaries.',
    previousBehavior:
      'Trip analytics had limited runtime counters for private/unassigned assignment rates and canonical score drift; mismatch detection for rows-vs-counters was mostly implicit; assignment and canonical analytics services had weaker direct unit-test coverage.',
    details: [
      'backend/src/modules/observability/trip-metrics.service.ts — added canonical assignment, score drift, and counter-anomaly metrics',
      'backend/src/modules/vehicle-intelligence/trips/trip-assignment.service.ts — optional metric recording for canonical assignment resolution writes',
      'backend/src/modules/vehicle-intelligence/driving-impact/driving-impact.service.ts — score drift observation between legacy mirror and canonical style score',
      'backend/src/modules/vehicle-intelligence/trips/trip-behavior-enrichment.service.ts — HF/LTE_R1 zero-counter anomaly guards and instrumentation',
      'backend/src/modules/vehicle-intelligence/trips/trip-analytics-canonical.service.spec.ts — NEW canonical hydration/stats coverage',
      'backend/src/modules/vehicle-intelligence/trips/trip-assignment.service.spec.ts — NEW private/assigned resolution and metric coverage',
      'backend/src/modules/vehicle-intelligence/trips/driver-score.service.spec.ts — NEW assigned-trip aggregation coverage',
      'backend/src/modules/vehicle-intelligence/driving-impact/driving-impact.service.spec.ts — added score drift metric assertion',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'battery-health-canonical-truth-2026-04-13',
    version: '4.6.21',
    title:
      'V4.6.21 Battery Health — canonical LV/HV truth, evidence model, and honest runtime surfaces',
    summary: [
      'CANONICAL: New backend canonical battery resolver provides one runtime contract with explicit `lv`, `hv`, and `currentTelemetry` sections',
      'EVIDENCE: Added first-class `BatteryEvidence` persistence model with scope/source/value typing, observedAt preservation, provenance links, and metadata',
      'HV UPGRADE: DIMO snapshot query/processor now ingests stronger traction signals (provider SOH, charging state/power, temperature, gross/current energy, voltage, capacity) and feeds HV snapshot + evidence writes',
      'DOC CONFIRM FIX: BATTERY document confirm now respects `scope` + `recordKind`, stores explicit SOH as evidence, and creates BATTERY_REPLACEMENT events only for true replacement records',
      'HONEST UI: Removed voltage→fake-percent fallbacks in runtime cards; battery surfaces now show real health when available and explicit unavailable/no-data/calibrating states otherwise',
      'DETAIL FLOW: Health Errors view switched from stitched battery endpoints to canonical `battery-health-detail` and now separates current SoC/range/charging from health semantics',
      'COMPAT: Legacy battery routes remain temporarily available but are projected from canonical service output',
      'TESTS: Added targeted battery tests for document-confirm scope parsing, canonical HV precedence, and observedAt timestamp persistence',
    ],
    reason:
      'Battery runtime previously mixed LV voltage heuristics, HV capacity estimation, and live SoC/range into competing truths, including UI-level synthetic percentages and document-confirmed SOH meaning loss.',
    previousBehavior:
      'BATTERY confirms could synthesize 12.0V snapshots even with explicit SOH; HV provider SOH signals were underused; frontend cards derived fake health percentages from voltage; multiple battery endpoints were consumed independently.',
    details: [
      'backend/prisma/schema.prisma — added BatteryEvidence model/enums and HV telemetry columns in VehicleLatestState',
      'backend/src/modules/vehicle-intelligence/battery-health/canonical-battery-health.service.ts — NEW canonical summary/detail facade',
      'backend/src/modules/vehicle-intelligence/battery-health/battery-evidence.service.ts — NEW evidence write/read service',
      'backend/src/modules/vehicle-intelligence/battery-health/battery-document-confirmation.util.ts — NEW BATTERY confirm normalization utility',
      'backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts — canonical battery endpoints + BATTERY confirm semantics refactor',
      'backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts — added HV SOH/charging/temperature/current-energy signals',
      'backend/src/workers/processors/dimo-snapshot.processor.ts — normalized new HV signals and enriched HV snapshot writes',
      'backend/src/modules/vehicle-intelligence/battery-health/hv-battery-health.service.ts — provider SOH precedence + observedAt-aware evidence writes',
      'backend/src/modules/vehicle-intelligence/battery-health/battery-v2.service.ts — observedAt propagation + LV evidence writes',
      'backend/src/modules/vehicle-intelligence/battery-health/battery-health.service.ts — observedAt-aware snapshot writes + evidence emission',
      'backend/src/modules/vehicle-intelligence/health-summary/health-summary.service.ts — battery module fed from canonical battery summary',
      'backend/src/modules/vehicle-intelligence/health-summary/ai-health-care-aggregation.service.ts — battery reasoning aligned to canonical contract',
      'frontend/src/lib/api.ts — canonical battery DTOs + batteryHealthDetail API + typed hvBatteryStatus',
      'frontend/src/rental/App.tsx — removed voltage-derived fake battery health and clarified EV energy rendering',
      'frontend/src/rental/components/HealthErrorsView.tsx — canonical battery detail consumption + real week/month trend wiring + current telemetry section',
      'frontend/src/rental/components/FleetConditionView.tsx — removed fake voltage percentage fallback',
      'frontend/src/rental/components/FleetConditionDetailView.tsx — battery detail uses canonical LV status/condition/estimate semantics',
      'frontend/src/rental/components/DocumentUploadView.tsx — BATTERY template includes recordKind/scope',
      'frontend/src/rental/components/vehicle-insights-logic.ts — battery condition/status now sourced from canonical LV section',
      'frontend/src/rental/components/vehicle-forecast-engine.ts — battery planning trigger uses canonical battery condition/status',
      'frontend/src/master/components/PlatformVehiclesView.tsx — EV battery column clarified as Energy/SoC',
      'backend/src/modules/vehicle-intelligence/battery-health/canonical-battery-health.service.spec.ts — NEW HV precedence/freshness tests',
      'backend/src/modules/vehicle-intelligence/battery-health/battery-document-confirmation.util.spec.ts — NEW scope/record-kind parsing tests',
      'backend/src/modules/vehicle-intelligence/battery-health/battery-health.service.spec.ts — NEW observedAt persistence test',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'hm-health-auth-mqtt-v2-normalization-2026-04-15',
    version: '4.6.19',
    title:
      'V4.6.19 High Mobility Health — auth failure clarity + MQTT V2 nested signal normalization',
    summary: [
      'FIX: HM Health fetch now distinguishes missing OAuth credentials from runtime token-fetch/network failures instead of collapsing both into one generic "credentials not configured" message',
      'FIX: HM Health-APP ingestion now resolves MQTT V2 nested signal paths (e.g. data.diagnostics.*) and sample-array payloads according to HM schema',
      'FIX: hm_latest_health_states upsert now extracts scalar values and JSON signal payloads from nested MQTT samples, reducing false null fields for service/tire/oil indicators',
      'NEW: MQTT Health-APP push messages now bridge directly into hm_signal_group_states (SERVICE / TIRE_PRESSURE / AI_HEALTH_CARE) with merge semantics for sparse signal batches',
      'TEST: Extended high-mobility-mqtt-payload util tests for nested diagnostics arrays and signal value extraction',
    ],
    reason:
      'HM fleet-clearance vehicles can receive valid MQTT V2 messages while REST polling fails or token fetch is temporarily unavailable. Generic error messaging and flat-key parsing caused misleading diagnostics and null-heavy HM health state rows.',
    previousBehavior:
      'Auth errors from missing env keys and transient token-fetch failures were reported under the same message, and MQTT ingestion looked up flat keys like diagnostics.get.tire_pressures directly in payload.data, missing the documented nested V2 format.',
    details: [
      'backend/src/modules/high-mobility/high-mobility-health-fetch.service.ts — split auth-failure semantics for missing credentials vs token-fetch failures',
      'backend/src/modules/high-mobility/high-mobility-health-app-auth.service.ts — added last-failure context exposure for fetch service diagnostics',
      'backend/src/modules/high-mobility/high-mobility-health-app-ingestion.service.ts — nested MQTT V2 signal resolution + robust value/data extraction for hm_latest_health_states upsert',
      'backend/src/modules/high-mobility/high-mobility-signal-usage.service.ts — new MQTT snapshot bridge into hm_signal_group_states with non-destructive group-data merging',
      'backend/src/modules/high-mobility/high-mobility-mqtt-payload.util.ts — new helpers for signal-path conversion, sample unwrap, and nested signal lookup',
      'backend/src/modules/high-mobility/high-mobility-mqtt-payload.util.spec.ts — added coverage for nested diagnostics/tire-pressure sample parsing',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'High Mobility',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tire-health-canonical-lifecycle-refactor-2026-04-14',
    version: '4.6.18',
    title:
      'V4.6.18 Tire Health — canonical lifecycle + measurement orchestration with operational action model',
    summary: [
      'NEW: TireLifecycleService as canonical tire write path (recordMeasurement, rotate, replacement scopes, stored-set activation, install/upsert)',
      'UNIFIED: Tire measurement writers from tire modal, setup endpoints, org tire upsert, DIMO registration, and document extraction confirm now flow through one normalized command pipeline',
      'COMPLETED: single, axle, and full-set replacement now persist coherent events/history and trigger deterministic recalculation',
      'COMPLETED: stored tire set activation workflow with explicit odometer anchor and active/stored swap semantics',
      'READ MODEL: Tire summary/detail now expose operational actionState + actionReasons, measurementState, pressureContext (DIMO/HM freshness), and dataQualityWarnings',
      'HONESTY: Removed heuristic tire remaining-km fallback in Vehicle Health box when model output is unavailable',
      'UI: Tire modal replacement dialog now supports single/axle/full scopes and stored-set activation controls',
      'FIX: Forecast engine tire confidence thresholds corrected from 0-1 to 0-100 scale',
      'TESTS: Tire wear model unit tests now cover pressure freshness gating and ACTIVE setup query filtering',
      'DOCS: Architektur + Health Tracking docs updated to reflect canonical tire lifecycle flow and pressure-context semantics',
    ],
    reason:
      'Tire Health had fragmented write paths and partially implemented workflows, creating inconsistent lifecycle history and trust gaps. This refactor establishes one canonical command path and aligns backend/frontend around operationally truthful outputs.',
    previousBehavior:
      'Measurements, replacement, and registration/edit writes used multiple non-equivalent paths; single/axle replacement were placeholders; stored-set activation was missing; read model lacked explicit action semantics and pressure freshness context.',
    details: [
      'backend/src/modules/vehicle-intelligence/tires/tire-lifecycle.service.ts — NEW canonical orchestration service',
      'backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts — tire write endpoints + document TIRE confirm rerouted to canonical lifecycle commands',
      'backend/src/modules/vehicles/vehicles.service.ts — org tire upsert + DIMO manual tire registration rerouted to canonical lifecycle flow',
      'backend/src/modules/vehicle-intelligence/tires/tire-health.service.ts — read-model cleanup (pure summary/detail assembly, action state, pressure/data-quality context)',
      'backend/src/modules/vehicle-intelligence/tires/tire-wear-model.service.ts — active-setup consistency + stale/incomplete pressure safeguards',
      'frontend/src/rental/components/HealthErrorsView.tsx — canonical tire actions, replacement scopes, stored-set activation, dead tire-modal upload control removed',
      'frontend/src/rental/App.tsx — removed heuristic tire km fallback',
      'frontend/src/rental/components/FleetConditionView.tsx — tire action/warning signal surfaced',
      'frontend/src/rental/components/FleetConditionDetailView.tsx — tire action/pressure/data-quality context surfaced',
      'frontend/src/rental/components/vehicle-insights-logic.ts — tire action-aware readiness/risk synthesis',
      'frontend/src/rental/components/vehicle-forecast-engine.ts — tire confidence scale bug fix',
      'frontend/src/lib/api.ts — tire DTO + endpoint updates (activate stored set)',
      'backend/src/modules/vehicle-intelligence/tires/tire-health.spec.ts — added pressure freshness gating + ACTIVE setup filter tests',
      'frontend/src/master/components/ArchitekturView.tsx — updated tire architecture/signal documentation for canonical lifecycle + HM pressure context',
      'frontend/src/master/components/HealthTrackingView.tsx — updated tire flow/formula/confidence docs for canonical write/read semantics',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'brake-health-canonical-refactor-2026-04-15',
    version: '4.6.20',
    title:
      'V4.6.20 Brake Health — canonical V2 runtime truth, trip-based wear accumulation, and lifecycle write unification',
    summary: [
      'CANONICAL TRUTH: Runtime surfaces now use /brake-health/summary + /brake-health/detail as primary brake source; legacy /brake-status remains explicit deprecated heuristic only',
      'MODEL FIX: Temporal wear now accumulates incrementally from TripDrivingImpact rows since anchor; rolling profile fallback is limited to uncovered odometer gaps only',
      'BASELINE DISCIPLINE: Initialization now enforces usable anchor semantics (thickness + odometer), preventing false-initialized certainty',
      'STATE SEMANTICS: Brake read model now distinguishes MEASURED, ESTIMATED, WARNING_ONLY, and NO_BASELINE with explicit warnings and coverage metadata',
      'DOMAIN CLEANUP: BrakeLifecycleService now handles structured service semantics (inspection/pads/discs/fluid/full, scope, source, measured snapshot) for manual + document-confirmed flows',
      'RECALC CHAIN: Driving-impact processor now triggers scoped brake recalculation after successful trip impact computation',
      'FRONTEND ALIGNMENT: Health/overview/fleet/insights/forecast consumers migrated to canonical Brake V2 DTOs and limiting-component aware remaining-km semantics',
      'DOCS + TESTS: Brake health tests extended for temporal coverage behavior and docs updated in Changes/Architektur/HealthTracking',
    ],
    reason:
      'Brake module had split-brain runtime truth (legacy heuristic + V2), retroactive temporal bias in wear estimation, and inconsistent write flows. This refactor makes outputs operationally honest and consistent without flattening the existing V2 factor model.',
    previousBehavior:
      'Many surfaces still prioritized legacy brake-status; V2 could initialize without meaningful baseline context; rolling current-profile factors could be applied to full post-anchor distance; manual and document brake writes followed different domain paths.',
    details: [
      'backend/src/modules/vehicle-intelligence/brakes/brake-health.service.ts — rebuilt canonical summary/detail/recalc flow with trip-based wear accumulation + explicit state/coverage semantics',
      'backend/src/modules/vehicle-intelligence/brakes/brake-lifecycle.service.ts — structured lifecycle command handling + measured/spec baseline gate behavior',
      'backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts — canonical brake write endpoint, deprecated legacy annotation, BRAKE document confirm routed through lifecycle service',
      'backend/src/workers/processors/driving-impact.processor.ts — brake recalc chaining after trip impact compute',
      'backend/src/modules/vehicle-intelligence/health-summary/health-summary.service.ts — brake module ingest switched to canonical brake-health semantics',
      'backend/src/modules/vehicle-intelligence/brakes/brake-health.spec.ts — updated summary-state tests + temporal coverage recalculation test',
      'frontend/src/lib/api.ts — brake DTO contract expansion + canonical recordBrakeService API',
      'frontend/src/rental/App.tsx — vehicle health box switched to brake-health summary model',
      'frontend/src/rental/components/FleetConditionView.tsx — fleet brake row + alert aggregation moved to canonical brake-health fields',
      'frontend/src/rental/components/FleetConditionDetailView.tsx — brakes detail rebuilt around brake-health summary/detail',
      'frontend/src/rental/components/VehicleInsightsCard.tsx — canonical brake-health fetch path',
      'frontend/src/rental/components/vehicle-insights-logic.ts — readiness/risk/cost synthesis migrated to brake-health state model',
      'frontend/src/rental/components/vehicle-forecast-engine.ts — removed legacy brake heuristic dependency; brake planning uses canonical V2 remainingKm',
      'frontend/src/rental/components/HealthErrorsView.tsx — manual brake action now uses canonical recordBrakeService flow; modal uses V2-only read semantics',
      'frontend/src/rental/components/DocumentUploadView.tsx — BRAKE extraction template extended with structured service + measured thickness fields',
      'frontend/src/master/components/ArchitekturView.tsx — brake architecture section updated for canonical V2 + trip-impact coverage behavior',
      'frontend/src/master/components/HealthTrackingView.tsx — brake tracking docs updated for trip-based temporal logic + state semantics',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fleet-live-map-architecture-refactor-2026-04-13',
    version: '4.6.17',
    title:
      'V4.6.17 Fleet & Live Map — dedicated fleet-map endpoint, Zustand stores, Mapbox source/layer rendering',
    summary: [
      'NEW BACKEND: GET /organizations/:orgId/fleet-map returns a lean map read model (vehicle identity/status, station, lat/lng, signal freshness, live flags, optional heading)',
      'NEW FRONTEND STORE: useFleetMapStore decouples Fleet Map from FleetContext rerender pressure and owns polling/filter/selection metadata',
      'RENDERING REFACTOR: Fleet map moved from one DOM marker per vehicle to Mapbox GeoJSON source + cluster layers + unclustered vehicle layer + selection highlight',
      'INTERACTION: Fleet map feature clicks now resolve vehicle selection directly from the map source/layer pipeline',
      'NEW LIVE STORE: useVehicleLiveMapStore centralizes live snapshot + target/confirmed position + heading/source/loading state',
      'LIVE POLLING SCOPE: useLiveVehicleTelemetry polling moved out of RentalApp shell into an overview-scoped binder; map/health consumers subscribe via narrow Zustand selectors',
      'API WIRING: frontend api.vehicles.fleetMap(orgId) + typed FleetMapVehicleResponse integrated into fleet map flow',
      'PERF GUARD: Fleet source updates skip unnecessary setData churn via material feature signature checks',
    ],
    reason:
      'Fleet and live-map updates were coupled to broad app context invalidations and a heavy generic vehicles list endpoint, causing avoidable rerender pressure and non-scalable marker rendering. The refactor separates concerns (fleet vs single-vehicle live), introduces a dedicated backend read model, and adopts a source/layer rendering path designed for larger fleets.',
    previousBehavior:
      'Fleet map depended on FleetContext (including 1-second countdown updates), loaded map data via /organizations/:orgId/vehicles with heavy includes/pagination semantics, and rendered one Mapbox DOM marker per vehicle. Live telemetry polling was mounted at RentalApp level and mixed with broader overview rendering.',
    details: [
      'backend/src/modules/vehicles/vehicles.controller.ts — added /organizations/:orgId/fleet-map route',
      'backend/src/modules/vehicles/vehicles.service.ts — added FleetMapVehicleDto + getFleetMapData() lean query + heading extraction',
      'frontend/src/lib/api.ts — added FleetMapVehicleResponse + api.vehicles.fleetMap(orgId)',
      'frontend/src/rental/stores/useFleetMapStore.ts — NEW: fleet map store with selectors for visible vehicles/stations/GeoJSON',
      'frontend/src/components/MapboxMap.tsx — refactored to GeoJSON source/layer cluster renderer with feature click handling',
      'frontend/src/rental/components/FleetView.tsx — switched from FleetContext to useFleetMapStore polling/filter/selection',
      'frontend/src/rental/stores/useVehicleLiveMapStore.ts — NEW: focused live-map telemetry store',
      'frontend/src/rental/hooks/useLiveVehicleTelemetry.ts — rewritten as store-backed polling sync hook',
      'frontend/src/rental/App.tsx — added overview-scoped live telemetry binder and narrow store-subscribed map/connection/health bridge components',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'hm-vag-payload-diagnostics-2026-04-14',
    version: '4.6.16',
    title: 'V4.6.16 High Mobility — VW Group clearance payload diagnostics',
    summary: [
      'DIAG: HighMobilityFleetService now logs the exact outgoing Fleet Clearance payload before POST /v1/fleets/vehicles',
      'DIAG: Error log now includes both request payload and provider response body for faster OEM onboarding root-cause analysis',
      'TRACE: providerPayloadJson now stores clearanceRequestPayload next to clearanceRequest result, so failed activations can be inspected from DB',
      'VALIDATION TARGET: verify VW Group requests send tags as object { "vw-group-customer-name": "<fleet operator>" }',
    ],
    reason:
      'Audi direct-clearance still returned provider status=error after routing fixes. We needed deterministic payload visibility to confirm whether the request shape matches VW Group requirements or whether the remaining blocker is provider-side brand/project authorization.',
    previousBehavior:
      'Only provider response status/body was visible. The exact outbound request payload was not logged or persisted, making request-shape verification difficult during incident debugging.',
    details: null,
    affectsArchitecture: false,
    module: 'High Mobility',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'hm-oem-routing-2026-04-13',
    version: '4.6.15',
    title: 'V4.6.15 High Mobility — brand-aware OEM onboarding routing (VW Group + Porsche fix)',
    summary: [
      'NEW: high-mobility-oem-routing.ts — central OEM routing helper with supportsEligibility(), usesDirectFleetClearance(), isVolkswagenGroupBrand(), isPorscheBrand(), getFleetClearanceTags()',
      'FIX: VW Group brands (Audi, VW, Skoda, SEAT, CUPRA) and Porsche no longer call the HM Eligibility API — eligibility failure for these brands was a routing bug, not a real error',
      'FIX: Fleet clearance requests for VW Group brands now include tags: { "vw-group-customer-name": "F.S Mobility Service" } with HM_VW_GROUP_CUSTOMER_NAME env override, matching HM API spec',
      'ROUTING: checkEligibilityForVehicle() returns NOT_APPLICABLE + routingNote for brands that skip eligibility, with canRequestDirectClearance flag',
      'NEW: requestDirectFleetClearance() service method — skips eligibility, creates HM record, triggers fleet clearance in one call',
      'NEW: POST /vehicles/:vehicleId/hm-health-app/request-direct-clearance controller endpoint',
      'HmVehicleStatusDto extended: oemPath, canRequestDirectClearance, routingNote fields added',
      'UI: "Start Activation" button shown for VW Group/Porsche (violet) instead of "Check Eligibility"',
      'UI: OEM routing note displayed as inline info box explaining why eligibility is skipped',
      'UI: ERROR state uses orange styling, REJECTED uses red — error is no longer shown for VW/Porsche NOT_CONFIGURED',
      'DEDUP: normalizeToHmBrand() map consolidated into oem-routing.ts — removed from eligibility service and fleet service',
      'QUALITY: No scattered brand if-statements — all routing logic goes through the central helper',
    ],
    reason: 'Audi/VW/Skoda/Porsche vehicles failed HM onboarding because the eligibility API returned an error for these brands. That error was a routing misfire — these brands simply do not use the eligibility API and should go directly to fleet clearance.',
    previousBehavior: 'All brands called HM Eligibility API. VW Group and Porsche returned ERROR/INELIGIBLE, blocking the onboarding flow entirely.',
    details: null,
    affectsArchitecture: true,
    module: 'High Mobility',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'vehicle-forecast-engine-2026-04-13',
    version: '4.6.14',
    title: 'V4.6.14 Vehicle Insights — real forecast engine replaces static planning estimates',
    summary: [
      'NEW: vehicle-forecast-engine.ts — standalone pure forecast engine with mileage trend model, per-item confidence, and pre-humanized display strings',
      'FORECAST: Oil service (new endpoint fetch), general service, TÜV/BOKraft, brake inspection (V2 model or heuristic), tire check, battery check — up to 4 items max',
      'MILEAGE TREND: Priority order — brakes.drivingImpact.totalKm90d (trip-logged, high confidence) → tire totalKmOnSet/installedAt → oil kmSinceChange/monthsSinceChange → fleet fallback 250 km/week',
      'CONFIDENCE: Each item carries high/medium/low confidence. Time estimate suppressed when mileage trend is low-confidence (km-derived items only). Explicit time items (TÜV, BOKraft) always show time.',
      'DEDUPLICATION: Oil service + general service merged into "Service + oil change" when within 1,000 km of each other to prevent visual duplication',
      'URGENCY: overdue / due / soon / normal — drives icon color, km display color, and time badge color in the card',
      'OVERDUE DETECTION: km <= 0 or days <= 0 displays "Overdue" / "Due now" in red; km 1–300 = "Due soon" in red',
      'DATA: Added two new parallel API calls — oilChangeStatus + brakeHealthSummary — in VehicleInsightsCard Promise.all, with graceful null fallback',
      'ARCHITECTURE: InsightsInput extended with optional oil and brakeHealth; InsightsDerived.forecast is now PlanningItem[] (not legacy ForecastItem[])',
      'CLEANUP: Removed old deriveForecast(), ForecastItem, urgencyBorder(), formatForecastDistance(), formatForecastTime() from vehicle-insights-logic.ts',
    ],
    reason:
      'The previous forecast section used a fixed 400 km/week rate for all vehicles and a 60,000 km total-life heuristic for brakes. ' +
      'The new engine derives actual mileage trends from real trip/tire/oil data and uses the V2 brake wear model for pad remaining km. ' +
      'Oil service was not surfaced at all before — now fetched and planned as a separate forecast item.',
    previousBehavior:
      'Forecast used a single hardcoded 400 km/week rate for all time estimates. Brake remaining km was always 60,000 × padWearPercent (ignoring actual pad specs). Oil service was never shown.',
    details: [
      'frontend/src/rental/components/vehicle-forecast-engine.ts — NEW: complete forecast engine (mileage trend, item builders, deduplication, urgency, humanization)',
      'frontend/src/rental/components/vehicle-insights-logic.ts — InsightsInput extended; deriveForecast removed; runForecastEngine wired in',
      'frontend/src/rental/components/VehicleInsightsCard.tsx — added oil + brakeHealth state/fetch; ForecastIcon updated for PlanningUrgency; row rendering uses pre-computed displayKm/displayTime',
    ].join('\n'),
    affectsArchitecture: false,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T22:30:00.000Z',
  },
  {
    id: 'vehicle-insights-widget-2026-04-13',
    version: '4.6.13',
    title: 'V4.6.13 Vehicle Insights — data-driven operational widget replaces hardcoded AI Summary',
    summary: [
      'REFACTOR: Removed hardcoded AI Summary block (inline JSX with fake "57 km/h / April 2026" placeholder copy) from Vehicle Details Overview tab',
      'NEW: VehicleInsightsCard.tsx — production-grade operational widget with 6 structured sections: verdict, status strip, planning horizon, next action, confidence note',
      'NEW: vehicle-insights-logic.ts — pure synthesis functions (deriveReadiness, deriveCostOutlook, deriveDowntimeRisk, deriveVerdict, deriveForecast, deriveNextAction, deriveConfidence)',
      'DATA: Reads real tire, brake, battery, service, and DTC data via existing /vehicle-intelligence/* endpoints — no new backend endpoints required',
      'UX: Status strip shows Rental Readiness / Cost Outlook / Downtime Risk as semantic labels (Ready / Monitor / Limited / Action Needed) with colored dot indicators',
      'UX: Planning Horizon lists 2–4 upcoming events with estimated distance and time, sorted by urgency — service, TÜV, BOKraft, tire, brake',
      'UX: Next Best Action shows one deterministic, actionable recommendation sentence based on worst condition',
      'UX: Confidence note explains data coverage and limitations at bottom of card',
      'FALLBACK: Gracefully handles partial or missing data per system — no fake precision, no invented values',
    ],
    reason:
      'The previous AI Summary contained entirely hardcoded copy — no API calls, no data bindings, fake values. ' +
      'SynqDrive is a fleet/rental SaaS; the overview widget must synthesize real condition, readiness, and planning data into actionable operational intelligence, not generic AI text.',
    previousBehavior:
      'AI Summary displayed static placeholder text: "57 km/h", "RPM 2,400", "April 2026", "12% below average fuel" — all hardcoded, all incorrect.',
    details: [
      'frontend/src/rental/components/VehicleInsightsCard.tsx — NEW: self-contained card component, fetches own data, renders all 6 sections',
      'frontend/src/rental/components/vehicle-insights-logic.ts — NEW: pure synthesis logic, fully testable, no React dependency',
      'frontend/src/rental/App.tsx — replaced AI Summary block (lines 1245-1320) with <VehicleInsightsCard vehicleId={selectedVehicle?.id} isDarkMode={isDarkMode} />',
    ].join('\n'),
    affectsArchitecture: false,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T21:00:00.000Z',
  },
  {
    id: 'hm-mqtt-only-architecture-2026-04-13',
    version: '4.6.12',
    title: 'V4.6.12 HM Health App — MQTT_ONLY mode for Mercedes-Benz Fleet Clearance vehicles',
    summary: [
      'FIX: HM Fleet Clearance vehicles (Mercedes-Benz) do not support REST command polling — REST /v1/vehicles/{ref}/command returns 404 by design (push-only architecture)',
      'ADD: MQTT_ONLY status — when HM returns 404 for command endpoint, fetchHealth() now returns MQTT_ONLY instead of FAILED, no error log spam',
      'FIX: HmSignalUsageService now handles MQTT_ONLY gracefully — writes informational state, preserves existing data, stops retrying REST endpoint',
      'ARCH: Health data for fleet-cleared OEM vehicles arrives via MQTT push when the car sends telemetry (vehicle must be driven)',
    ],
    reason:
      'HM Fleet Clearance (OEM-level approval) gives MQTT streaming access only. ' +
      'The REST command endpoint (/v1/vehicles/{ref}/command) is for user-authorized (invitation) vehicles, not fleet-cleared VINs. ' +
      'Mercedes-Benz pushes health telemetry via MQTT when the car is in use.',
    previousBehavior:
      'All three signal groups (SERVICE, TIRE_PRESSURE, AI_HEALTH_CARE) were logging ERROR every poll cycle: "Request failed with status code 404". The 404 is correct and expected — it means the vehicle is MQTT-only, not broken.',
    details: [
      'backend/src/modules/high-mobility/dto/high-mobility.dto.ts — HmSyncStatus += MQTT_ONLY',
      'backend/src/modules/high-mobility/high-mobility-health-fetch.service.ts — 404 → MQTT_ONLY with LOG (not ERROR)',
      'backend/src/modules/high-mobility/high-mobility-signal-usage.service.ts — MQTT_ONLY handled gracefully in refreshSignalGroup + refreshAllSignalGroupsInitial',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'High Mobility',
    createdAt: '2026-04-13T19:00:00.000Z',
  },
  {
    id: 'hm-mqtt-v2-signal-fix-2026-04-13',
    version: '4.6.11',
    title: 'V4.6.11 HM MQTT V2 — VIN command reference fallback + topic VIN extraction fix',
    summary: [
      'FIX: REST health fetch now falls back to VIN as command reference when HM clearance does not return a provider vehicleId (e.g. Mercedes-Benz on Health package) — AI_HEALTH_CARE and TIRE_PRESSURE signals restored',
      'FIX: All 3 MQTT ingestion services (health-app, telemetry-app, telemetry) now extract VIN from topic index 3 (not 2) — previously the app UUID at index 2 was incorrectly stored as the VIN for management messages',
    ],
    reason:
      'A previous over-strict fix to high-mobility-vehicle-reference.util rejected the VIN entirely, blocking REST health fetch for vehicles where HM does not assign a separate provider vehicleId. MQTT ingestion was also silently storing the app UUID as VIN for management-level messages.',
    previousBehavior:
      'AI_HEALTH_CARE and TIRE_PRESSURE signal groups started failing at 17:40 on 2026-04-13 with "No HM command vehicle reference available" after the isUsableHmCommandVehicleReference check was deployed. MQTT management messages were stored with vin=C002B216-4165-4A36-99E6-863C5FF99D6F (app ID misidentified as VIN).',
    details: [
      'backend/src/modules/high-mobility/high-mobility-health-fetch.service.ts — VIN fallback when clearance is APPROVED and no provider vehicleId in payload',
      'backend/src/modules/high-mobility/high-mobility-health-app-ingestion.service.ts — extractVin now reads parts[3], skips UUID at parts[2]',
      'backend/src/modules/high-mobility/high-mobility-telemetry-app-ingestion.service.ts — same extractVin fix',
      'backend/src/modules/high-mobility/high-mobility-telemetry-ingestion.service.ts — same extractVin fix',
    ].join('\n'),
    affectsArchitecture: false,
    module: 'High Mobility',
    createdAt: '2026-04-13T18:00:00.000Z',
  },
  {
    id: 'hm-mqtt-v2-observability-2026-04',
    version: '4.6.10',
    title: 'V4.6.10 High Mobility MQTT V2 — runtime observability and config alignment',
    summary: [
      'ADD: HighMobilityMqttV2Service with in-memory message counters, last payload metadata, TLS path logging, and structured broker/subscribe lifecycle logs',
      'ADD: GET /api/v1/integrations/hm-mqtt-v2/status (admin) for live MQTT V2 debug snapshot; extended per-app MQTT status with mqttEnabled vs mqttReady and runtime block',
      'ADD: HM_MQTT_V2_* optional global env fallbacks (host, port, cert paths, topic, QoS, unique client id) layered under HM_*_APP_MQTT_* per-app keys',
      'FIX: isMqttReadyToConnect now requires full mqttReady (topic + creds) plus on-disk certs — avoids silent partial connects',
      'ADD: HM_MQTT_V2_STRICT_TRANSPORT — optional startup failure when MQTT is enabled but certs or config are incomplete',
    ],
    reason: 'Make it obvious whether the backend is actually connected to mqtt-v2.high-mobility.com and receiving messages, and separate transport issues from REST 402/404 signal access problems.',
    previousBehavior:
      'MQTT V2 clients existed but had thin logging, no message counters, weak readiness checks, and no consolidated debug endpoint; .env.example omitted HM MQTT variables.',
    details: [
      'backend/src/modules/high-mobility/high-mobility-mqtt-v2.service.ts',
      'backend/src/modules/high-mobility/high-mobility-mqtt-payload.util.ts',
      'backend/src/modules/high-mobility/high-mobility-mqtt-base.ts',
      'backend/src/config/high-mobility.config.ts',
      'backend/src/modules/high-mobility/high-mobility-stream-config.service.ts',
      'backend/src/modules/high-mobility/high-mobility-diagnostics.controller.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'High Mobility',
    createdAt: '2026-04-13',
  },
  {
    id: 'hm-command-reference-separation-2026-04',
    version: '4.6.9',
    title: 'V4.6.9 HM Command Reference Separation (VIN no longer misused as Health vehicle id)',
    summary: [
      'FIX: HM fleet clearance VIN handling and HM Health command vehicle reference are now treated as separate concepts instead of sharing one placeholder value',
      'FIX: HM Health fetch now rejects VIN placeholders as command references and only uses a real provider `vehicleId` when available from provider payloads or webhooks',
      'FIX: HM approval webhooks now overwrite stale VIN placeholders with the real provider `vehicleId`, so linked vehicles can self-heal once the provider sends the canonical reference',
      'DIAGNOSIS: approved HM Health vehicles could stay permanently fetch-broken because the code stored the VIN into `hmVehicleReference` and then called `/v1/vehicles/{hmVehicleReference}/command`, which returned provider 404s',
    ],
    reason: 'Restore architectural correctness for High Mobility Health by separating fleet-clearance identity from command-execution identity.',
    previousBehavior: 'The HM Health flow used the VIN as a stand-in for the provider vehicle reference, causing repeated 404 fetch failures and leaving Health-tab HM signals unavailable even for approved linked vehicles.',
    details: [
      'backend/src/modules/high-mobility/high-mobility-vehicle-reference.util.ts',
      'backend/src/modules/high-mobility/high-mobility-health-fetch.service.ts',
      'backend/src/modules/high-mobility/high-mobility-fleet.service.ts',
      'backend/src/modules/high-mobility/high-mobility-webhook.service.ts',
      'backend/src/modules/high-mobility/high-mobility-vehicle-reference.util.spec.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'High Mobility',
    createdAt: '2026-04-13T18:05:00.000Z',
  },
  {
    id: 'hm-health-failure-visibility-2026-04',
    version: '4.6.8',
    title: 'V4.6.8 HM Health Failure Visibility (no fake fresh cache on 404)',
    summary: [
      'FIX: failed HM Health fetches no longer populate signal-group caches as if they were successful empty payloads',
      'FIX: HM group state now preserves the latest fetch error so the Health tab can show why no HM display-grade signals are available',
      'FIX: AI Health Care now surfaces the last HM fetch error in the rental Health tab instead of silently showing only missing signal rows',
      'DIAGNOSIS: the HM Health fetch path logged provider 404 failures correctly, but cache refresh still marked those attempts as fresh success timestamps with empty signal JSON',
    ],
    reason: 'Make HM health debugging and user trust much better by distinguishing real OEM no-data states from backend fetch failures.',
    previousBehavior: 'A failed HM provider request could leave the Health tab looking like a fresh but empty HM signal state, masking the real integration error.',
    details: [
      'backend/src/modules/high-mobility/high-mobility-health-fetch.service.ts',
      'backend/src/modules/high-mobility/high-mobility-signal-usage.service.ts',
      'backend/src/modules/high-mobility/dto/high-mobility.dto.ts',
      'backend/src/modules/vehicle-intelligence/health-summary/ai-health-care-aggregation.service.ts',
      'frontend/src/rental/components/HealthErrorsView.tsx',
      'frontend/src/lib/api.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'High Mobility',
    createdAt: '2026-04-13T17:35:00.000Z',
  },
  {
    id: 'battery-soh-alignment-calibration-copy-2026-04',
    version: '4.6.7',
    title: 'V4.6.7 Battery SOH Alignment (AI Health Care + calibration progress clarity)',
    summary: [
      'FIX: AI Health Care battery reasons now use the same publication-aware LV battery SOH source as the Battery card instead of a separate raw snapshot value',
      'FIX: Battery calibration UI now explains whether it is still waiting for the minimum 5-day maturity window or whether too few qualified rest/start observations are available',
      'FIX: when calibration is still open but the last fresh battery sample is old, the Health tab now says that no new measurements have arrived instead of only showing a generic collecting state',
      'DIAGNOSIS: the Health tab could show one SOH estimate while AI Health Care flagged a different battery percentage because the summary overlay still read the legacy snapshot pipeline directly',
    ],
    reason: 'Keep battery health communication trustworthy by using one canonical LV SOH source and by making calibration blockers visible to operations users.',
    previousBehavior: 'Battery and AI Health Care could show different SOH values for the same vehicle, and calibration states like "Sammelt Messwerte" did not reveal whether the blocker was time, missing events, or stale incoming data.',
    details: [
      'backend/src/modules/vehicle-intelligence/battery-health/soh-publication.ts',
      'backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts',
      'backend/src/modules/vehicle-intelligence/health-summary/ai-health-care-aggregation.service.ts',
      'frontend/src/rental/components/HealthErrorsView.tsx',
      'frontend/src/lib/api.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T17:10:00.000Z',
  },
  {
    id: 'trip-analytics-runtime-fix-2026-04',
    version: '4.6.6',
    title: 'V4.6.6 Trip Analytics Runtime Fix (public metrics + correct ClickHouse windows)',
    summary: [
      'FIX: `/api/v1/metrics` is now explicitly public so Prometheus can scrape runtime and trip analytics signals without being blocked by the global auth guard',
      'FIX: ClickHouse recent-ingestion readiness counts now use proper UTC DateTime64 window parameters instead of millisecond integer comparisons that falsely returned empty windows',
      'FIX: the same ClickHouse time-window correction was applied to ignition-segment and activity-window analytics queries, so guarded live trip assists now read the mirrored telemetry they were designed to use',
      'DIAGNOSIS: ClickHouse mirror writes were landing correctly, but the analytics/readiness layer queried those tables with a mismatched time type, making runtime health look empty and weakening detector corroboration',
    ],
    reason: 'Restore real operational visibility and ensure the ClickHouse analytical sidecar contributes live evidence instead of appearing healthy while returning empty windows.',
    previousBehavior: 'Prometheus scraping hit 401, and ClickHouse-backed readiness or detector windows could report no recent data even while telemetry snapshots and state changes were actively mirrored.',
    details: [
      'backend/src/shared/auth/auth.guard.ts',
      'backend/src/modules/clickhouse/clickhouse-analytics.service.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T16:05:00.000Z',
  },
  {
    id: 'trip-analytics-wiring-2026-04',
    version: '4.6.5',
    title: 'V4.6.5 Trip Analytics Wiring (ClickHouse assist + runtime visibility)',
    summary: [
      'FIX: ClickHouse analytics are no longer only a passive repair side-channel; live trip start confirmation can now consult ClickHouse activity/ignition evidence as a guarded assist when DIMO confirmation is sparse',
      'FIX: ambiguous live continuity windows can now use a ClickHouse activity guard before the FSM moves a trip toward POSSIBLE_END, reducing false closure pressure in weak-data windows',
      'FIX: `/health/readiness` now surfaces ClickHouse and worker-runtime state explicitly, including recent ClickHouse ingestion counts, instead of only Postgres/Redis',
      'NEW: Prometheus metrics now expose ClickHouse configured/available state, worker-runtime enabled state, mirror write outcomes, analytics query outcomes, evidence-path usage, and last successful mirror timestamps',
      'DIAGNOSIS: ClickHouse was connected, but its detectors were mostly confined to reconciliation while Prometheus only exported telemetry; neither one materially reinforced the live FSM as previously assumed',
    ],
    reason: 'Make ClickHouse operationally useful for trip accuracy and make analytics/runtime degradation impossible to miss from health and metrics surfaces.',
    previousBehavior: 'ClickHouse could be connected and ingesting snapshots, but the live FSM still ran almost entirely DIMO-only, while Prometheus exposed metrics without showing whether analytics support was actually participating.',
    details: [
      'backend/src/modules/clickhouse/clickhouse.service.ts',
      'backend/src/modules/clickhouse/clickhouse-telemetry.service.ts',
      'backend/src/modules/clickhouse/clickhouse-analytics.service.ts',
      'backend/src/modules/health/health.service.ts',
      'backend/src/modules/observability/trip-metrics.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/policy/trip-detection-policy.resolver.ts',
      'backend/src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T15:05:00.000Z',
  },
  {
    id: 'trip-start-boundary-refinement-2026-04',
    version: '4.6.4',
    title: 'V4.6.4 Trip Start Boundary Refinement (canonical DIMO start first)',
    summary: [
      'FIX: live trip confirmation no longer writes `possibleStartAt` blindly as the trip start when DIMO already exposes an earlier canonical segment boundary inside the confirmation window',
      'NEW: start confirmation now prefers DIMO Telemetry segment starts for DIMO vehicles and falls back to the earliest plausible route/core activity point only if no segment is available',
      'FIX: first-route fetch, start temperature capture, battery crank capture, and live trip duration now all use the refined start boundary instead of the later confirmation snapshot time',
      'NEW: trip raw detection metadata now keeps start-boundary provenance (`startCandidateAt`, `startBoundarySource`, `startBoundaryAdjustedMs`) for debugging exact start corrections',
      'DIAGNOSIS: the first C63 AMG trip on 11.04 was detected correctly as a drive, but its start was stored ~4 minutes too late because the FSM anchored to the confirm snapshot instead of the canonical DIMO segment start',
    ],
    reason: 'Make trip starts as exact as possible for DIMO-backed vehicles without weakening false-start protection: detect conservatively, then snap the stored boundary to the best canonical evidence.',
    previousBehavior: 'The FSM confirmed starts robustly, but once confirmed it persisted the snapshot candidate time as `startTime`, which could lag real movement by a few minutes on sparse early telemetry.',
    details: [
      'backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/trip-evidence.helpers.ts',
      'backend/src/modules/vehicle-intelligence/trips/trip-detection.spec.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T14:05:00.000Z',
  },
  {
    id: 'trip-reconciliation-dimo-backfill-2026-04',
    version: '4.6.3',
    title: 'V4.6.3 Historical Trip Backfill (manual window + DIMO segment repair)',
    summary: [
      'NEW: `POST /vehicles/:id/trips/reconcile` now accepts optional `from` / `to` timestamps so missed historical windows can be repaired deliberately instead of only scanning the last 12 hours',
      'NEW: manual reconciliation can fall back to DIMO Telemetry segments (`changePointDetection` primary, `frequencyAnalysis` fallback) when ClickHouse/live polling missed a drive window',
      'FIX: repaired trips now persist canonical DIMO-based start/end coordinates, distance when available, and a synthetic `dimoSegmentId` for idempotent re-runs',
      'FIX: trips created by reconciliation now immediately enqueue canonical HF behavior enrichment instead of staying permanently unenriched after repair',
      'DIAGNOSIS: the missing C63 AMG trip on 11.04 evening was recoverable from DIMO historical segments even though the live polling window had a long outage',
    ],
    reason: 'Allow SynqDrive to recover real historical drives after live worker gaps without inventing local ghost-trip logic and without leaving repaired trips in a half-finished state.',
    previousBehavior: 'Manual reconciliation only scanned the last 12 hours, relied on ClickHouse ignition segments, and repaired trips were created without automatic HF enrichment handoff.',
    details: [
      'backend/src/modules/dimo/queries/trip-segments.query.ts',
      'backend/src/modules/dimo/dimo-segments.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service.ts',
      'backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T13:05:00.000Z',
  },
  {
    id: 'trip-detection-c63-guard-fix-2026-04',
    version: '4.6.2',
    title: 'V4.6.2 Trip Detection Hardening (stale POSSIBLE_START, zero-core ticks, repair race)',
    summary: [
      'FIX: `processPossibleStart()` now expires stale POSSIBLE_START candidates before they can be confirmed from hours-old historical data',
      'FIX: start confirmation now uses a bounded recent confirmation window instead of validating against arbitrarily old accumulated core history',
      'FIX: `ACTIVE_TRACKING` with `corePointsCount=0` no longer mutates trip end fields, appends stale route evidence, or pushes the trip into a false POSSIBLE_END path',
      'FIX: reconciliation `MISSING_END` repairs now skip trips still owned by the live FSM and also skip trips with recent activity inside a stale-grace window',
      'DIAGNOSIS: the C63 AMG limited trip on 12.04 was caused by a stale start candidate confirmed 11.5h later, followed by an empty-core active tick and a `MISSING_END` repair applied only 10.7s after trip creation',
    ],
    reason: 'Prevent the trip engine from creating low-data ghost trips with wrong end times when DIMO confirmation windows go stale or reconciliation races the live state machine.',
    previousBehavior: 'A stale POSSIBLE_START could later confirm from old core history, zero-core active ticks could still distort end state, and reconciliation could repair an ONGOING trip while the live FSM still owned it.',
    details: [
      'backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T12:25:00.000Z',
  },
  {
    id: 'battery-lv-soh-c63-capture-fix-2026-04',
    version: '4.6.1',
    title: 'V4.6.1 LV Battery SOH Capture Hardening (C63 / DIMO stale-signal guard)',
    summary: [
      'FIX: DimoSnapshotProcessor now preserves per-signal LV voltage timestamp (lowVoltageBatteryCurrentVoltage.timestamp) and forwards it to BatteryV2Service',
      'FIX: BatteryV2Service.onSnapshot now validates LV sample freshness (stale/future timestamp guard) and computes rest windows from signal observation time, not poll execution time',
      'FIX: RESTING transition after normal trip finalize now keeps a valid rest-window anchor (lastActivityAt=endTime) instead of forcing null',
      'FIX: LV SOH observation counters now increment only on real fresh observations (new rest/crank events), removing ambiguous double-count paths',
      'DIAGNOSIS: C63 showed sparse SOH updates because DIMO snapshots were successful but carried stale LV signal timestamps older than the active rest window',
    ],
    reason: 'Prevent false/blocked LV SOH progression when DIMO polling succeeds but low-voltage battery samples are stale or out-of-order, and restore deterministic rest-window accumulation.',
    previousBehavior: 'The LV SOH pipeline could evaluate rest captures using poll-time context and null rest anchors after finalize, while counters could increment in non-deterministic paths.',
    details: [
      'backend/src/workers/processors/dimo-snapshot.processor.ts',
      'backend/src/modules/vehicle-intelligence/battery-health/battery-v2.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: '2026-04-13T12:10:00.000Z',
  },
  {
    id: 'high-mobility-phase3-2026-04',
    version: '4.6.0',
    title: 'V4.6.0 HM Vehicle Health Signal Extension — Phase 3',
    summary: [
      'NEW: HmSignalGroupState DB model + HmSignalGroup enum (SERVICE, TIRE_PRESSURE, AI_HEALTH_CARE) with migration 20260409120000_hm_signal_group_state',
      'NEW: HmVehicleActivationService — retroactive HM activation facade for existing vehicles (eligibility → activate → refresh → deactivate)',
      'NEW: HmSignalUsageService — signal group cache reader/writer; mediates HM signals to allowed UI consumers only',
      'NEW: HmHealthPollingScheduler — @Interval scheduler: SERVICE 3x/day, TIRE_PRESSURE 6x/day, AI_HEALTH_CARE 6x/day',
      'NEW: AiHealthCareAggregationService — aggregates rule-based HealthSummaryService with 4 HM display-grade indicators',
      'NEW: /vehicles/:id/high-mobility-status + HM activation endpoints (check-eligibility, activate-health, refresh-status, deactivate)',
      'NEW: /vehicles/:id/hm-vehicle-health + refresh sub-endpoints for all 3 signal groups',
      'NEW: /vehicles/:id/health/ai-health-care — aggregated AI Health Care response with HM indicators',
      'EXTENDED: service-info-status — HM service override: if HM Health active, uses distance_to_next_service + time_to_next_service as preferred values',
      'EXTENDED: PlatformVehiclesView vehicle detail drawer — new High Mobility section with status badge + action buttons (Check Eligibility, Activate, Refresh, Deactivate)',
      'EXTENDED: HealthErrorsView Service Info card — HM badge + "last updated Xh ago" when HM is the data source',
      'EXTENDED: HealthErrorsView Tires quick card — HM tire pressure indicator: OK / issue / no data + last updated',
      'EXTENDED: HealthErrorsView Tires modal — HM Live Tire Pressure 4-wheel detail section (bar values per wheel)',
      'EXTENDED: HealthErrorsView AI Health Care card — 4 new HM indicator rows: Oil Level (fill bar), Limp Mode, Brake Lining Pre-Warning, Tire Pressure Warning',
      'CHANGED: Error Codes Box status text — Keine Fehlercodes erkannt / X Fehlercode(s) erkannt / Daten veraltet / Abruf fehlgeschlagen / Noch nicht geprüft',
      'ARCHITECTURE: HM signals remain display-grade only — never injected into authoritative health calculation pipelines',
    ],
    reason: 'Extend SynqDrive with controlled HM vehicle health signal usage in Service Info, Tire Health, AI Health Care, and vehicle activation flows for existing vehicles.',
    previousBehavior: 'HM HEALTH signals were fetched and stored but not yet surfaced in any UI health boxes.',
    details: null,
    affectsArchitecture: true,
    module: 'High Mobility',
    createdAt: '2026-04-09T12:00:00.000Z',
  },
  {
    id: 'high-mobility-phase2-2026-04',
    version: '4.5.0',
    title: 'V4.5.0 High Mobility Integration — Phase 2 (HM_ONLY + MQTT V2 Groundwork)',
    summary: [
      'NEW: HM_ONLY vehicle source mode — vehicles registerable without hardware (no DIMO)',
      'NEW: HighMobilityRegistrationService — create/register HM_ONLY internal vehicles from approved provider records',
      'NEW: HighMobilityMqttConsumerService — production-safe MQTT V2 consumer with mTLS, reconnect, at-least-once semantics',
      'NEW: HighMobilityTelemetryIngestionService — raw ingest, deduplicate by message_id, normalize, persist to stream log',
      'NEW: HighMobilityTelemetryRoutingService — explicit adapter points for future downstream routing (location, ignition, odometer, battery, fuel, diagnostics)',
      'NEW: HighMobilityStreamConfigService — MQTT config readiness, cert validation (server-side only), consumer state management',
      'NEW: DB: high_mobility_stream_sync_logs, high_mobility_stream_consumer_states, 4 new enums, 5 new columns on high_mobility_vehicles',
      'NEW: Migration: 20260408140000_high_mobility_phase2',
      'NEW: API: /vehicles/:id/create-hm-only-vehicle, /vehicles/:id/streaming-readiness, /vehicles/:id/link-full-telemetry, /stream/consumer-status, /stream/test-connection, /stream/logs, /stream/logs/:id',
      'NEW: API: POST /vehicles/register/hm-only, GET /vehicles/register/hm-only-candidates',
      'EXTENDED: HighMobilityAdminController — Phase 2 endpoints for streaming, HM_ONLY, full telemetry',
      'EXTENDED: HighMobilityVehicleLinkService — linkFullTelemetry() for structural FULL_TELEMETRY link',
      'EXTENDED: HighMobilityDataView — source mode filter, registration state badge, streaming state badge, new Streaming tab (MQTT status + stream logs)',
      'EXTENDED: Frontend api.ts — Phase 2 types and API methods',
      'EXTENDED: high-mobility.config.ts — MQTT V2 configuration block',
      'EXTENDED: .env — 10 new MQTT environment variables',
      'DOMAIN RULES: HM_ONLY vehicles are first-class without hardware; FULL_TELEMETRY staged/stored but NOT yet wired to scoring/trips/calculations; DIMO flows unchanged',
      'TODO Phase 3: activate routing adapter points (trips, health, scoring, energy, abuse) per product decision',
    ],
    reason: 'Phase 2 extends the HM integration with structural HM_ONLY vehicle support and production-safe MQTT V2 streaming infrastructure without activating incomplete business logic.',
    previousBehavior: 'Only DIMO_PLUS_HM mode was supported. No streaming infrastructure. HM_ONLY vehicles could not be created or registered. Full Telemetry had no ingestion layer.',
    details: [
      'backend/src/modules/high-mobility/high-mobility-registration.service.ts',
      'backend/src/modules/high-mobility/high-mobility-stream-config.service.ts',
      'backend/src/modules/high-mobility/high-mobility-mqtt-consumer.service.ts',
      'backend/src/modules/high-mobility/high-mobility-telemetry-ingestion.service.ts',
      'backend/src/modules/high-mobility/high-mobility-telemetry-routing.service.ts',
      'backend/src/modules/high-mobility/high-mobility-vehicle-link.service.ts (extended)',
      'backend/src/modules/high-mobility/high-mobility-admin.controller.ts (extended)',
      'backend/src/modules/high-mobility/high-mobility-vehicle-register.controller.ts (extended)',
      'backend/src/modules/high-mobility/high-mobility.module.ts (extended)',
      'backend/src/modules/high-mobility/dto/high-mobility.dto.ts (extended)',
      'backend/src/config/high-mobility.config.ts (extended)',
      'backend/prisma/schema.prisma (extended)',
      'backend/prisma/migrations/20260408140000_high_mobility_phase2/migration.sql',
      'backend/.env (extended)',
      'frontend/src/master/components/HighMobilityDataView.tsx (extended)',
      'frontend/src/lib/api.ts (extended)',
    ].join('\n'),
    affectsArchitecture: true,
    module: 'Master Admin',
    createdAt: '2026-04-08T14:00:00.000Z',
  },
  {
    id: 'high-mobility-phase1-2026-04',
    version: '4.4.0',
    title: 'V4.4.0 High Mobility Integration — Phase 1 (OEM Health Data)',
    summary: [
      'NEW: High Mobility integration module — Phase 1 (HEALTH package, Mode A: DIMO + HM)',
      'NEW: Backend: HighMobilityModule with 6 services (Auth, Eligibility, Fleet, VehicleLink, HealthFetch, Webhook)',
      'NEW: Backend: 3 controllers (Admin, Webhook, VehicleRegister) under /api/v1/admin/high-mobility/* and /api/v1/integrations/high-mobility/webhook',
      'NEW: Database: 4 new tables — high_mobility_vehicles, high_mobility_status_history, high_mobility_health_sync_logs, vehicle_data_source_links',
      'NEW: Database: 7 new Prisma enums (HmPackageType, HmSourceMode, HmEligibilityStatus, HmDeliveryMode, HmClearanceStatus, HmSyncType, HmSyncStatus)',
      'NEW: Master Admin: High Mobility DATA page (Vehicle List + Eligibility Check tabs)',
      'NEW: Master Admin Sidebar: High Mobility entry under Integrations section',
      'NEW: VehicleRegistrationModal: backend-driven HM Health availability check + activation UI',
      'NEW: Config: high-mobility.config.ts with sandbox/live env switching',
      'NEW: Env vars: HM_ENV, HM_API_BASE_URL, HM_CLIENT_ID, HM_CLIENT_SECRET, HM_WEBHOOK_SECRET',
      'ARCH: HM HEALTH signals (tire pressure, service info, dashboard lights, etc.) are informational/display-grade only — NOT injected into existing health score, tire, brake, battery calculation pipelines',
      'ARCH: VehicleDataSourceLink table is extensible for future sources beyond HIGH_MOBILITY',
      'ARCH: FULL_TELEMETRY package type is structurally prepared (DB, UI, DTO) but not operationally active in Phase 1',
      'ARCH: HM_ONLY source mode is schema-prepared for Phase 2 but not yet operational',
      'ARCH: HighMobilityHealthFetchService is signal-by-signal extensible — new signals can be added per product decision',
      'TODO (Phase 2): MQTT V2 consumer for full telemetry streaming',
      'TODO (Phase 2): HM_ONLY vehicle registration without hardware',
      'TODO (Phase 2): Scheduler-based health polling (skeleton prepared)',
      'TODO (Phase 2): Integrate HM signals as authoritative inputs to health calculations (explicit product decision required)',
    ],
    reason: 'Add High Mobility as an additional OEM informational health-data source for fleet vehicles that already use DIMO LTE R1 / Smart5 hardware.',
    previousBehavior: 'No High Mobility integration. All vehicle health data came exclusively from DIMO telemetry.',
    details: 'Backend: high-mobility.module.ts, high-mobility-auth.service.ts, high-mobility-eligibility.service.ts, high-mobility-fleet.service.ts, high-mobility-vehicle-link.service.ts, high-mobility-health-fetch.service.ts, high-mobility-webhook.service.ts, high-mobility-admin.controller.ts, high-mobility-webhook.controller.ts, high-mobility-vehicle-register.controller.ts, dto/high-mobility.dto.ts, config/high-mobility.config.ts. Frontend: HighMobilityDataView.tsx, Sidebar.tsx (added high-mobility view), master/App.tsx (route), VehicleRegistrationModal.tsx (HM availability section), lib/api.ts (highMobility namespace + types). DB: migration 20260408120000_high_mobility_phase1.',
    affectsArchitecture: true,
    module: 'Master Admin',
    createdAt: '2026-04-08T12:00:00.000Z',
  },
  {
    id: 'ui-design-system-density-2026-04',
    version: '4.3.0',
    title: 'V4.3.0 Frontend — Premium operational UI system (density, surfaces, tokens)',
    summary: [
      'NEW: Central design tokens in theme.css — Inter + Manrope, compact base 14px, semantic elevation (--shadow-*), glass variables, sq-* utilities (sq-card, sq-glass, sq-backdrop, sq-tab-bar, sq-press, live accents)',
      'UPD: Rental & Master app shells — unified padding (px-4–8), bg-background, removed heavy radial-only backgrounds',
      'UPD: Sidebars & TopBars — tighter widths/padding, semantic bg-sidebar / border-sidebar-border / text-muted-foreground',
      'UPD: Right sidebars — normalized width (~300px), solid card surfaces',
      'UPD: Rental App.tsx — vehicle header chips, tab bar, trip filters, overview map/AI/quick-actions, and modals moved to solid/popover surfaces; restrained blur only on live map telemetry bar',
      'UPD: MainNavTabs — muted tab rail + card active pill (no full-glass strip)',
      'UPD: DashboardView, MasterDashboardView, TripsView — prior pass: solid cards, reduced blur, semantic colors',
      'UPD: HealthErrorsView — chart tooltip popover solid surface',
      'UPD: SettingsView — all 6 tab cards + tab navigation bar: solid bg-neutral-900/bg-white, no blur',
      'UPD: FinanceView, OperationsView — tab navigation bars: solid bg-muted rail',
      'UPD: BookingsView — popup overlay: backdrop-blur-xl → backdrop-blur-[2px]',
      'UPD: VehicleRegistrationModal (Master) — inner dialog: solid bg-neutral-900/bg-white, rounded-xl',
      'UPD: ChangesView — card variable: solid bg-neutral-900/bg-white',
      'VERIFY: All backdrop-blur-xl CSS usage eliminated from codebase; only backdrop-blur-sm/[2px] on modal backdrops and map HUDs remain',
      'DOC: Architektur — UI layer note for shared surface rules (solid vs glass by page type)',
    ],
    reason: 'Align product UI with enterprise operational density: less oversized glass, clearer hierarchy, consistent Rental/Master chrome.',
    previousBehavior: 'Widespread backdrop-blur-xl on cards; inconsistent padding between apps; large modal/title scales.',
    details: 'Files: theme.css, fonts.css, rental/App.tsx, MainNavTabs.tsx, HealthErrorsView.tsx, SettingsView.tsx (6 cardClass + tab bar), FinanceView.tsx, OperationsView.tsx, BookingsView.tsx, master/VehicleRegistrationModal.tsx, ChangesView.tsx, plus all sidebars/topbars/rightbars/dashboards/trips from prior passes.',
    affectsArchitecture: false,
    module: 'Master Admin',
    createdAt: '2026-04-07T12:00:00.000Z',
  },
  {
    id: 'agent-fixes-timeout-mapping-prompt',
    version: '4.2.4',
    title: 'V4.2.4 AI Agent Fixes — Tire Spec Timeout, Vehicle Spec Prompt, Data Mapping',
    summary: [
      'FIX: AI Tire Spec Agent timeout — stream timeout increased from 180s to 300s, added 120s inactivity detection to resolve prematurely before hard timeout',
      'FIX: Tire Spec prompt rewritten as direct knowledge-based query (no web search) to drastically reduce DIMO agent response time',
      'FIX: Vehicle Spec Agent prompt now includes tankCapacityLiters field — previously missing, causing tank capacity to never be fetched',
      'FIX: Vehicle Spec Agent prompt improved — brakeForceDistribution now returns a number (front %), frontToRearWeightDistribution returns "55/45" ratio, brake pad thickness instructions clarified',
      'FIX: Tire spec data mapping mismatch — parseAiTireSpec now maps legalMinTreadDepthMm→legalMinimumMm, practicalReplacementDepthMm→recommendedReplacementDepthMm, winterRecommendedMinDepthMm→operationalReplacementDepthMm',
      'FIX: tankCapacityLiters now returned in toRegisteredVehicleDto so frontend receives the value',
      'FIX: DOT code input restricted to 4-digit numeric (KWYY format), label shows format hint',
      'FIX: DOT code display in PlatformVehiclesView formatted as "KW 25 / 24" for readability',
      'REFACTOR: Vehicle Spec prompt deduplicated — both getVehicleSpecs and getVehicleSpecsStream now use shared buildVehicleSpecMessage helper',
      'UPD: Frontend tire agent countdown increased from 30s to 60s for realistic expectation',
    ],
    date: '2026-04-04',
    affectedFiles: [
      'backend/src/modules/dimo/dimo-agents.service.ts',
      'backend/src/modules/vehicles/vehicles.service.ts',
      'backend/src/modules/vehicle-intelligence/tires/tire-health.config.ts',
      'frontend/src/master/components/VehicleRegistrationModal.tsx',
      'frontend/src/master/components/PlatformVehiclesView.tsx',
    ],
  } as any,
  {
    id: 'tire-registration-ai-spec-button',
    version: '4.2.3',
    title: 'V4.2.3 Tire Registration — Load/Speed Index + AI Tire Spec Agent Button',
    summary: [
      'NEW: Separate Load Index and Speed Index fields per axle in Vehicle Registration & Edit form (replaces combined Load/Speed field)',
      'NEW: DOT code, Load Index, Speed Index, and Tire Condition now persisted to VehicleTireSetup (new DB columns: load_index_front, speed_index_front, load_index_rear, speed_index_rear, dot_code_front, dot_code_rear)',
      'NEW: AI Tire Spec Agent button in registration form — fetches tire specifications via DIMO AI Agent SSE stream',
      'NEW: Agent prompt updated to comprehensive extraction format with 55+ fields (EU label, UTQG, dimensional data, bias/sensitivity values, OE homologation, etc.)',
      'NEW: Collapsible result panel shows full AI Tire Spec response as key-value table for verification',
      'NEW: AI Tire Spec result stored as aiTireSpec JSON blob on VehicleTireSetup when vehicle is registered',
      'FIX: Button disabled with tooltip until Brand/Model, Dimension, Load Index, Speed Index, and Year are filled',
      'FIX: Update (edit) flow now also persists load/speed index and DOT code per axle',
    ],
    date: '2026-04-04',
    affectedFiles: [
      'backend/prisma/schema.prisma',
      'backend/src/modules/vehicles/vehicles.service.ts',
      'backend/src/modules/dimo/dimo-agents.service.ts',
      'frontend/src/master/components/VehicleRegistrationModal.tsx',
      'frontend/src/master/components/PlatformVehiclesView.tsx',
      'frontend/src/master/data/platform-data.ts',
      'frontend/src/master/App.tsx',
      'frontend/src/lib/api.ts',
    ],
  },
  {
    id: 'ai-tire-spec-consolidation',
    version: '4.2.2',
    title: 'V4.2.2 AI Tire Spec — Consolidation & Contract Alignment',
    summary: [
      'FIX: Frontend api.ts applyAiTireSpec now uses POST /tires/ai-spec/apply (was PATCH /tires/ai-spec — mismatched method and path)',
      'FIX: Frontend apply call sends { aiTireSpec } in correct payload shape matching backend DTO',
      'NEW: Frontend api.ts exposes startAiTireSpecJob and getAiTireSpecJobStatus for job-based flow',
      'DEDUP: Removed duplicate AiTireSpecNormalized interface from ai-tire-spec-job.service.ts — now reuses AiTireSpec from tire-health.config.ts',
      'AUDIT: Verified manual truth protection — all AI write paths only touch VehicleTireSetup.aiTireSpec JSON blob, never current tread/calibration/k-factor columns',
      'AUDIT: Confirmed fetch/apply separation — no path silently persists AI data without explicit user confirmation',
      'AUDIT: Both backend and frontend compile clean, backend boots with all routes registered',
    ],
    date: '2026-04-04',
  },
  {
    id: 'ai-tire-spec-normalizer',
    version: '4.2.1',
    title: 'V4.2.1 AI Tire Spec — Normalization & Validated Persistence Layer',
    summary: [
      'NEW: ai-tire-spec-normalizer.ts — dedicated normalization module with type coercion, enum validation, range clamping, and URL validation',
      'NEW: normalizeAiTireSpecResult() — converts raw AI output to strongly-typed AiTireSpec with null for unknown/malformed values',
      'NEW: validateAiTireSpec() — returns validation report with field counts and warnings for implausible data (low confidence, inverted thresholds)',
      'NEW: buildPersistedAiTireSpec() — builds the JSON blob for VehicleTireSetup.aiTireSpec with source metadata (userConfirmedSpec, specSourceType, fetchedAt, normalizedAt)',
      'Upgraded: parseAiTireSpec() in tire-health.config.ts now applies full type coercion (string→number, string→boolean) — backward-compatible with pre-normalization blobs',
      'Upgraded: AiTireSpecJobService.executeJob uses normalizer after AI response — validates and clamps before storing to job record',
      'Upgraded: AiTireSpecJobService.applyResult re-normalizes at apply time — double-safety, only known fields persisted, no arbitrary pass-through',
      'Upgraded: Legacy direct-apply endpoint (aiTireSpec body) also runs normalization + validation before persisting',
      'Preserved: Manual tread, calibration, and current-state fields are NEVER touched by the AI spec persistence layer',
    ],
    date: '2026-04-03',
  },
  {
    id: 'ai-tire-spec-job-backend',
    version: '4.2.0',
    title: 'V4.2.0 AI Tire Spec Job Backend — Persisted Job Lifecycle',
    summary: [
      'NEW: AiTireSpecJob Prisma model — persisted job lifecycle with status tracking (queued → running → succeeded/failed)',
      'NEW: POST /vehicles/register/ai-tire-specs — start endpoint validates input, creates job record, fires async AI agent execution, returns jobId immediately',
      'NEW: GET /vehicles/register/ai-tire-specs/:jobId/status — polling endpoint returns job status, timestamps, normalized result, and confidence score',
      'NEW: POST /vehicles/:vehicleId/tires/ai-spec/apply — apply endpoint accepts jobId, persists confirmed spec to active tire setup with metadata, triggers recalculation',
      'NEW: AiTireSpecJobService — complete lifecycle: start, execute (async), poll, apply — reuses DimoAgentsService agent infrastructure',
      'NEW: Job stores raw response, normalized result, confidence score, timestamps, error messages, and apply tracking',
      'Architecture: Job-based polling pattern (start → poll → apply) complements existing SSE stream endpoint for flexible frontend consumption',
      'Preserved: Existing SSE tire-spec-stream endpoint kept for backward compatibility, all tire health flows untouched',
    ],
    date: '2026-04-03',
  },
  {
    id: 'ai-tire-spec-fetch',
    version: '4.1.0',
    title: 'V4.1.0 AI Tire Spec Fetch — Model-Aware Intelligence Agent',
    summary: [
      'NEW: Fetch AI Tire Spec button in tire setup edit form — triggers DIMO Agent for tire model intelligence',
      'NEW: SSE streaming endpoint (ai-tire-specs-stream) mirrors existing vehicle spec agent pattern — reuses agent lifecycle, auth, and retry logic',
      'NEW: Required field validation (brand/model, dimension, load index, speed index) with disabled state and tooltip hint',
      'NEW: Live status UI with 30-second countdown timer, progress bar, step tracking, and delayed-state messaging',
      'NEW: Result preview showing matched brand/model, confidence score, season type, tread depths, replacement thresholds, sensitivities, and source URLs',
      'NEW: Explicit Apply / Retry / Discard actions — no silent auto-apply, low-confidence results clearly flagged',
      'NEW: PATCH /vehicles/:vehicleId/tires/ai-spec endpoint persists AI spec to active setup without overwriting manual measurements or calibrations',
      'NEW: Load Index and Speed Index fields added to tire setup edit form',
      'Architecture: Backend reuses DimoAgentsService (createAgent, sendMessageStream, agent retry on 404/410) — no separate job system',
      'Preserved: All existing tire health flows, calibration, rotation, change, and recalculation remain untouched',
    ],
    date: '2026-04-03',
  },
  {
    id: 'tire-health-v2-intelligence',
    version: '4.0.0',
    title: 'V4.0.0 Tire Health V2 — Model-Aware Wear Intelligence Engine',
    summary: [
      'NEW: AI tire spec integration — stores normalized tire model data (brand, model, archetype, sensitivities, load/speed index, new tread, replacement thresholds)',
      'NEW: Tire archetype awareness — 13 archetypes (touring, sport, eco, EV-optimized, etc.) drive model-aware expected life and baseline tuning',
      'NEW: Pressure wear factor — uses live per-wheel tire pressure to detect underinflation stress with tire-specific sensitivity weighting',
      'NEW: Load factor — vehicle curb weight + drivetrain + XL/reinforced tire class influence wear rate',
      'NEW: Season mismatch detection — winter tires in heat, summer tires in cold, all-season under highway stress penalized conservatively',
      'NEW: Interaction penalty — bounded multi-stressor compounding when aggressive driving + underinflation + heat coincide',
      'NEW: Heat stress model — combines ambient temp, high-speed exposure, pressure deviation, and driving aggressiveness weighted by heatSensitivity',
      'NEW: Behavior sensitivity modulation — aggressiveDrivingSensitivity from tire spec tunes behavior factor departure',
      'NEW: Tire condition at setup — NEW_INSTALLED vs ALREADY_MOUNTED with strict truth/source hierarchy preventing AI spec from corrupting used-tire state',
      'NEW: Explicit source priority — currentTreadSource, referenceNewTreadSource, replacementThresholdSource tracked and exposed in all DTOs',
      'NEW: 3-level replacement thresholds — operationalReplacementMm, recommendedReplacementMm, legalMinimumMm with source-priority resolution',
      'NEW: Multi-dimensional confidence — tireSpecConfidence, dataCompletenessConfidence, modelConfidence alongside legacy composite score',
      'NEW: Remaining-km confidence safety discount — estimates discounted by confidence level (High=100%, Medium=90%, Low=75%)',
      'NEW: Regression data hygiene — filters invalid odometer transitions, implausible tread jumps, and too-close data points before fitting',
      'NEW: Explainability in factors tab — data sources, top wear drivers, cause hints, confidence breakdown bars, and AI spec match status',
      'NEW: Frontend tire condition selector in edit setup form and vehicle registration modal',
      'Preserved: All existing flows (registration, edit, calibration, rotation, change, recalculation, snapshot, fleet view) backward-compatible',
    ],
    date: '2026-04-03',
  },
  {
    id: 'tire-health-fixes',
    version: '3.9.1',
    title: 'V3.9.1 Tire Health — Critical Bug Fixes & Regression Activation',
    summary: [
      'Fixed: upsertTireData no longer overwrites initial tread depths with current measurements on UPDATE — only populates if previously null',
      'Fixed: AI Health Summary now uses the same replace-threshold-based formula as the main tire wear model (consistent % across all surfaces)',
      'Fixed: All measurement entry paths (upsert, registration, calibration, manual) auto-populate odometer from VehicleLatestState when not provided',
      'Activated: TireWearDataPoint rows are now written during each recalculation — enables linear regression model after 8+ data points',
      'Fixed: Staggered setup detection now normalizes dimension strings (case, whitespace, special chars) before comparison',
      'Refactored: Centralized isStaggeredSetup() and normalizeDimension() utility in tire-health.config.ts, replaced 5 duplicated checks',
    ],
    date: '2026-04-03',
  },
  {
    id: 'live-gps-near-realtime',
    version: '3.9.0',
    title: 'V3.9.0 Live Map — Near-Real-Time GPS via Direct DIMO Proxy',
    summary: [
      'New lightweight backend endpoint /live-gps acts as a secure DIMO proxy for 5-second fresh GPS updates (no DB caching)',
      'useLiveVehicleTelemetry split into dual polling: 5s GPS cycle (DIMO-direct) + 30s dashboard cycle (DB snapshot)',
      'Dead reckoning engine predicts vehicle position between GPS updates using speed + heading for 60fps fluid motion',
      'LiveMapOverview uses GPS interpolation + dead reckoning phases for smooth, continuous marker movement',
      'Fleet Map markers now animate smoothly to new positions on 30s refresh instead of snapping',
      'GPS source indicator differentiates live DIMO vs cached data',
    ],
    date: '2026-04-03',
  },
  {
    id: 'health-score-no-tracking',
    version: '3.8.9',
    title: 'V3.8.9 Health Score — No Tracking No Longer Counts as Critical',
    summary: [
      'FIX: Health dimensions without tracking data (Brakes, Tires, Battery) no longer default to 0% and count as "Critical". Previously, missing data dragged the overall health score down and caused "Poor Health" even when no real problems existed.',
      'SCORING: The health score now only averages dimensions that have real data. Untracked dimensions are excluded from the average, critical count, and due-soon count.',
      'NO DATA STATE: When all 3 dimensions lack data, the health badge shows "Insufficient Data" with a neutral gray appearance instead of the misleading "Poor Health" red.',
      'TRACKING HINT: A compact info bar appears when 1+ dimensions are untracked, recommending to enable tracking for more accurate results.',
      'ITEM DISPLAY: Untracked items show a "No Data" badge, a neutral gray bar at 100% width, and the hint "Enable tracking for accurate health data" instead of a misleading "Critical" red bar at 0%.',
      'HEART INDICATOR: The heart ECG animation and color now dynamically match the actual health state (green/amber/red/gray).',
    ],
    filesChanged: ['frontend/src/rental/App.tsx'],
  },
  {
    id: 'ev-ui-cleanup',
    version: '3.8.8',
    title: 'V3.8.8 EV UI Adaptations & Euromaster Removal',
    summary: [
      'EV LIVE MAP: For electric vehicles, the live map status overlay now shows "Energy" instead of "Fuel". Coolant temperature and low-voltage battery (V) indicators are hidden for EVs since they are not relevant.',
      'EUROMASTER REMOVED: Removed the Euromaster button from the vehicle detail page header and the "Euromaster →" button from the Vehicle Health overview box for ALL vehicles. Modal and related dead code have been cleaned up.',
      'GRID ADAPTIVE: Live map status grid dynamically adjusts columns (4 for EV, 6 for ICE) to maintain a clean layout without empty cells.',
      'ENERGY CHIP: The overview header fuel/energy chip now shows "Energy" instead of "Battery" for EV vehicles for consistent terminology.',
    ],
    filesChanged: ['frontend/src/rental/App.tsx'],
  },
  {
    id: 'ev-traction-power',
    version: '3.8.7',
    title: 'V3.8.7 EV Traction Battery Power — Full Signal Integration',
    summary: [
      'NEW SIGNAL: Integrated powertrainTractionBatteryCurrentPower (W → kW) across snapshot polling, high-frequency queries, trip detection, and behavior enrichment for EV/PHEV vehicles.',
      'TRIP DETECTION: EV battery power (negative = motoring, positive = regen/charging) now provides strong/weak evidence for trip start detection. High discharge (≤ −25 kW) counts as double strong, moderate draw (≤ −12 kW) as strong, low draw (≤ −4 kW) as weak. Regen while moving and possible charging while stationary also contribute.',
      'IDLE DETECTION: Vehicle state interpreter now considers ≥ 3 kW absolute traction battery activity as electrical activity, enabling correct IDLE state detection for EVs without ICE engine load.',
      'RECUPERATION ANALYSIS: New hf-recuperation module computes trip-level EV regen summary (regenEnergyKwh, regenDurationSeconds, peakRegenKw, peakDischargeKw) from 1-second HF data using trapezoidal integration. Results are stored in behaviorSummaryJson.evTractionPower.',
      'BUG FIX: preprocessHighFrequency was silently dropping tractionBatteryPowerKw from the output — fixed so all downstream HF analysis receives the signal.',
      'BUG FIX: assessSignalAvailability now correctly reports tractionBatteryPowerAvailable. Both SMART5 and LTE_R1 enrichment paths include it in behaviorSummaryJson.',
      'BUG FIX: All three interpretVehicleState call sites in vehicles.service.ts now pass tractionBatteryPowerKw from VehicleLatestState.',
    ],
    module: 'Vehicle Intelligence',
    filesChanged: [
      'backend/prisma/schema.prisma',
      'backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts',
      'backend/src/modules/dimo/queries/high-frequency.query.ts',
      'backend/src/workers/processors/dimo-snapshot.processor.ts',
      'backend/src/modules/vehicle-intelligence/trips/trip-detection.types.ts',
      'backend/src/modules/vehicles/vehicle-state-interpreter.ts',
      'backend/src/modules/vehicles/vehicles.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/trip-evidence.helpers.ts',
      'backend/src/modules/dimo/dimo-segments.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/hf-recuperation.ts',
      'backend/src/modules/vehicle-intelligence/trips/hf-preprocessing.ts',
      'backend/src/modules/vehicle-intelligence/trips/hf-abuse.ts',
      'backend/src/modules/vehicle-intelligence/trips/trip-behavior-enrichment.service.ts',
      'backend/src/modules/vehicle-intelligence/trips/trip-detection.spec.ts',
      'backend/src/modules/vehicle-intelligence/trips/hf-abuse.spec.ts',
    ],
  },
  {
    id: 'fuel-fallback-absolute',
    version: '3.8.6',
    title: 'V3.8.6 Fuel Gauge — Absolute Level Fallback for ICE Vehicles',
    summary: [
      'FIX: Vehicles that only report powertrainFuelSystemAbsoluteLevel (liters) but NOT powertrainFuelSystemRelativeLevel (percentage) now correctly display a calculated fuel percentage. Previously these vehicles showed 0% because resolveFuelPercent fell through to a return 0 when no relative signal existed.',
      'CALCULATION: When relative level is unavailable, the backend calculates fuel % as (absoluteLiters / tankCapacity) * 100. When both signals exist but absolute is newer, capacity is inferred from the last known ratio pair. Falls back to the stored per-vehicle tank capacity or a 50 L default.',
      'NEW FIELD: Added tankCapacityLiters to the Vehicle model so each vehicle can have its actual fuel tank size stored (e.g. Audi A4 = 54 L). This is editable in the Master Admin Vehicle Registration/Edit form under "Tank Capacity (L)" in the Engine & Powertrain section.',
      'NOTE: Both DIMO signals (RelativeLevel and AbsoluteLevel) were already being polled in the 30-second snapshot — the issue was purely in the calculation logic, not in data collection.',
    ],
    filesChanged: [
      'backend/prisma/schema.prisma',
      'backend/src/modules/vehicles/vehicles.service.ts',
      'frontend/src/master/App.tsx',
      'frontend/src/master/components/VehicleRegistrationModal.tsx',
      'frontend/src/master/data/platform-data.ts',
    ],
  },
  {
    id: 'tire-edit-setup',
    version: '3.8.5',
    title: 'V3.8.5 Tire Health — Edit Current Tire Setup',
    summary: [
      'NEW: Users can now edit the active tire setup directly from the Tire Health modal (Vehicle Detail → Health → Tires). An "Edit" button on the Active Set card opens an inline form to update brand/model, dimensions, season, and current tread depths.',
      'EMPTY STATE: When no tire setup exists, a prominent "Add Tire Setup" button replaces the old passive text, guiding the user to create the initial setup without needing Master Admin access.',
      'INCOMPLETE BADGE: Active tire setups with missing key fields (brand, dimension, or season) now show an "Incomplete" badge to signal that data should be completed for accurate ML wear predictions.',
      'PERSISTENCE: Edits are saved via the existing PUT /organizations/:orgId/vehicles/:vehicleId/tires upsert endpoint. After save, tire wear analysis, health summary, and detail data are automatically refreshed.',
    ],
    filesChanged: ['frontend/src/rental/components/HealthErrorsView.tsx'],
  },
  {
    id: 'trip-map-redesign',
    version: '3.8.4',
    title: 'V3.8.4 Trip Map — Route Visualization Redesign',
    summary: [
      'ROUTE VISUALIZATION: Replaced confusing heatmap rendering with a clean, line-based route polyline that is easy to trace from start to finish.',
      'SPEED SEGMENTATION: Route line is color-coded by speed range (blue=slow, green=normal, yellow=fast, orange/red=speeding) with a refined gradient palette for high legibility.',
      'SPEEDING OVERLAY: Speeding sections are rendered as dashed overlays on the route with glow, severity-colored (yellow/orange/red), clearly distinguishable from normal speed coloring.',
      'DRIVING EVENT MARKERS: Compact circle markers placed directly on the route for acceleration (▲ orange), braking (▼ blue), and abuse (⚠ red) events. Markers show classification on hover.',
      'STOP DETECTION: Stops are detected from low-speed consecutive route points and rendered as subtle ring markers on the route, with size proportional to stop duration.',
      'FILTER BAR: Compact legend/filter bar above the map with toggle controls for Speed, Speeding, Driving Events, Abuse Events, and Stops. Each toggle enables/disables the corresponding map layer.',
      'LEGEND: Inline map legend at bottom-left shows speed color key and stop symbol for quick map interpretation.',
    ],
    module: 'Vehicle Intelligence',
    reason: 'The previous trip map used a heatmap/density visualization that made it hard to understand the actual driven route, speed behavior, event locations, and stops.',
    previousBehavior: 'Trip map rendered a Mapbox heatmap layer with densified point cloud, plus a thin route line and speed-colored overlay. No event markers, no stop visualization, no toggle controls, and a density legend instead of speed legend.',
    details: 'Removed trips-heatmap source/layer entirely. Base route now renders as a subtle casing+line for traceable path. Speed-route-layer uses refined 8-step color interpolation. Speeding sections use dashed line pattern for clear differentiation. Stop detection algorithm scans for 3+ consecutive points below 3 km/h. Event markers are DOM-based mapboxgl.Marker instances positioned at event lat/lng. Filter state toggles Mapbox layer visibility via setLayoutProperty. Map card header changed from "Trip Heatmap" to "Trip Route Map".',
    affectsArchitecture: false,
    createdAt: '2026-03-31T22:00:00Z',
  },
  {
    id: 'fleet-map-live-refresh',
    version: '3.8.3',
    title: 'V3.8.3 Fleet Map — Live Refresh, Sedan Markers & Status Colors',
    summary: [
      'LIVE REFRESH: Fleet map now auto-refreshes vehicle positions every 30 seconds (was 60s, single-load behavior). Countdown overlay shows time until next refresh.',
      'SEDAN MARKER: Default navigation arrow / colored dot replaced with premium pseudo-3D black sedan SVG marker on both Fleet map and Vehicle Detail → Overview live map. Supports smooth CSS-transitioned heading rotation.',
      'STATUS COLORS: Consistent color system applied — Blue (Available), Purple (Active Rented), Green (Reserved), Red (Maintenance) — to map markers, headlight accents, status legend, section badges, and license plate dots in tables.',
      'ROTATION: Sedan marker rotates by heading/bearing with shortest-path interpolation to avoid 359°→1° spinning. Stable when vehicle is stationary.',
      'MAP UX: Fleet map preserves pan/zoom state during data refresh. Markers are updated in-place (no remove/recreate flicker). Status legend overlay added to bottom-left of map.',
    ],
    module: 'Vehicle Intelligence',
    reason: 'Fleet map only loaded vehicle positions once on page load, with generic colored dot markers and inconsistent status colors. This made the map unsuitable for real-time fleet operations.',
    previousBehavior: 'FleetContext refreshed every 60 seconds. MapboxMap used colored dots (green/blue/yellow/red). LiveMapOverview used a circle with arrow SVG. No countdown, no legend, no sedan marker.',
    details: 'New shared module lib/vehicleMarker.ts provides sedan SVG generation, status color palette, fleet marker factory, rotation utilities. FleetContext now exposes countdown state. MapboxMap uses stable marker map (keyed by vehicle id) for flicker-free updates. LiveMapOverview uses createSedanMarkerEl + shortestRotation for smooth heading transitions.',
    affectsArchitecture: true,
    createdAt: '2026-03-31T20:00:00Z',
  },
  {
    id: 'ai-chat-vehicle-resolution',
    version: '3.8.2',
    title: 'V3.8.2 AI Assistant — Fleet Context & Vehicle Resolution Fix',
    summary: [
      'CRITICAL FIX: AI Assistant chat now includes full fleet context (license plates, vehicle names, VINs, make/model/year, token IDs) in every message to the DIMO Agent. Previously only DIMO token IDs were passed, so the agent had no SynqDrive registration data and could not resolve vehicles by license plate.',
      'NEW: SynqDrive-side vehicle resolver attempts to match user queries by normalized license plate, vehicle name, make/model/year, VIN, or token ID before sending to the DIMO Agent. Matched vehicles are highlighted in the fleet context for accurate lookups.',
      'FIX: Eliminated raw API 500 errors on /chat/message. ChatController and ChatService now catch all exceptions and return valid assistant error responses. Unhandled throws (ensureAgent failures, Prisma errors, agent recreation failures) no longer propagate as HTTP 500.',
      'FIX: License plate normalization (uppercase, collapse whitespace, ignore hyphens) ensures "KS MS 661", "KS-MS-661", "ks ms 661" all match the stored plate.',
      'UX: Frontend error handling improved — network failures, API errors, and unexpected exceptions now display contextual messages instead of raw error strings.',
    ],
    module: 'Vehicle Intelligence',
    reason: 'The AI Assistant was returning 500 errors and could not identify vehicles by license plate because SynqDrive registration data (plates, names) was never included in the fleet context sent to the DIMO Agent.',
    previousBehavior: 'Only DIMO token IDs were sent. The DIMO Agent had no knowledge of SynqDrive license plates, names, or local IDs. Any vehicle query by plate failed. Follow-up queries could crash with unhandled 500s.',
    details: 'Root causes: (1) getOrgTokenIds only selected dimoVehicle.tokenId, omitting licensePlate/vehicleName/VIN. (2) ChatController.sendMessage had no try/catch, so any throw became HTTP 500. (3) No local vehicle resolver existed. Fix: new getOrgFleetInfo selects full vehicle identity fields, buildEnrichedMessage prepends structured fleet context to every message, tryResolveVehicle provides pre-resolution hints, controller wraps all calls in try/catch returning valid assistant messages.',
    affectsArchitecture: true,
    createdAt: '2026-03-31T17:00:00Z',
  },
  {
    id: 'vehicle-deregister',
    version: '3.8.1',
    title: 'V3.8.1 Master Admin — Vehicle Deregistration',
    summary: [
      'NEW: Added "Deregister Vehicle" action on the Master Admin Vehicle Detail Page with confirmation modal.',
      'BACKEND: Added POST /admin/vehicles/:vehicleId/deregister endpoint. Removes the SynqDrive Vehicle registration row while preserving the underlying DimoVehicle identity (FK onDelete: SetNull). The DimoVehicle automatically reappears in Non Registered Vehicles.',
      'UX: Confirmation modal clearly explains what will be cleaned up (license plate, assignments, health tracking, operational data) and what is preserved (DIMO vehicle identity, re-registration capability).',
      'FLOW: After deregistration, both registered and non-registered vehicle lists are refreshed. The vehicle disappears from Registered and reappears in Non Registered, ready for future re-registration.',
    ],
    module: 'Master Admin',
    reason: 'Master Admin needed the ability to reverse a vehicle registration without destroying the external DIMO vehicle identity.',
    previousBehavior: 'No deregister action existed. The only option was a hard delete via API, which was not exposed in the UI.',
    details: 'The Vehicle row is the SynqDrive registration. Deleting it cascades to all SynqDrive-specific operational data (tire health, brake health, trips, DTC events, driving analysis, etc.) while the DimoVehicle row persists. Re-registration from the same DimoVehicle creates a fresh Vehicle with fresh operational data.',
    affectsArchitecture: false,
    createdAt: '2026-03-31T14:00:00Z',
  },
  {
    id: 'tire-health-persistence-fix',
    version: '3.8.0',
    title: 'V3.8.0 Tire Health — Data Persistence & Action Fix',
    summary: [
      'CRITICAL FIX: Master Admin vehicle edit now persists tire data. Previously, editing tire fields (dimensions, brand, season, tread depths) after registration had no backend persistence path — the update endpoint only accepted flat Vehicle model fields while tire data lives in separate VehicleTireSetup/VehicleTireTreadMeasurement relations.',
      'NEW ENDPOINT: Added PUT /organizations/:orgId/vehicles/:vehicleId/tires — backend upsert that creates or updates VehicleTireSetup and creates new VehicleTireTreadMeasurement records. Handles both first-time tire entry and subsequent edits.',
      'BUG FIX: Manual tread measurement in Tire Health Detail Box was silently failing when no tire setup existed. Now shows explicit error message "No active tire setup found. Please add tire information first." Also validates that at least one tread value is entered.',
      'BUG FIX: Tire rotation in Tire Health Detail Box was silently failing. Backend throws BadRequestException when no active setup exists, but frontend catch block was empty. Now surfaces actual error messages to the user.',
      'BUG FIX: Tire change (full set) action catch block was also silently swallowing errors. Now displays error to user.',
      'UX: Tire Health Quick Box now shows "No active Tracking / please provide Tire Information" (amber highlight) instead of generic gray "No active Tracking" when no tire data exists.',
      'UX: Tire Health Detail Modal empty state now shows clear amber-bordered "No active Tracking — please provide Tire Information" with guidance to use Master Admin or AI Upload.',
      'UX: Added tireActionError banner inside tire detail modal — surfaces errors from measurement, rotation, and change actions with dismissible alert.',
    ],
    module: 'Vehicle Intelligence',
    reason: 'Tire health data persistence was completely broken for post-registration edits, and all tire detail actions (measurement, rotation, change) silently failed when prerequisites were missing.',
    previousBehavior: 'Vehicle edit lost all tire data on save. Manual measurement, rotation, and change actions silently did nothing. Empty state showed generic text.',
    details: 'Root causes: (1) handleUpdateVehicle sent only flat Vehicle fields to PATCH endpoint, with zero tire data. (2) No backend endpoint existed for tire upsert outside registration. (3) Frontend action handlers returned silently on missing setup or swallowed catch blocks. (4) Empty state lacked clear prerequisite messaging.',
    affectsArchitecture: true,
    createdAt: '2026-03-31T12:00:00Z',
  },
  {
    id: 'service-maintenance-audit',
    version: '3.7.4',
    title: 'V3.7.4 Service & Maintenance — Production Readiness Audit',
    summary: [
      'SECURITY: Added @Roles(ORG_ADMIN, MASTER_ADMIN) to all org-level write endpoints (assign partner, update assignment, remove assignment, grant data auth, revoke data auth). Previously, any authenticated user could perform these admin-level operations.',
      'BUG FIX: Fixed LIVE_API mode mismatch — admin assign modal sent LIVE_API which is not a valid Prisma PartnerAssignmentMode enum value. Changed to use ACTIVE/FULL_ACCESS/MANUAL_ONLY to match the database schema.',
      'BUG FIX: Fixed fetchDataAuth called during render (React anti-pattern causing infinite re-renders) in ServiceMaintenanceView. Moved to a proper useEffect triggered on partner list load.',
      'BUG FIX: Fixed Grant Access flow sending empty scopes when defaultScopes not yet loaded — now fetches defaults from backend first if local data is missing.',
      'CONSISTENCY: Unified EuromasterStatusBadge mode keys to match useEuromasterIntegration modeSummary output (Active, Manual only, Not assigned, Disabled, Authorization required). Previously mismatched (used lowercase keys like "live", "manual").',
      'CONSISTENCY: Updated admin MODE_LABELS to cover all Prisma PartnerAssignmentMode values (MANUAL_ONLY, PREPARED, ACTIVE, READ_ONLY, FULL_ACCESS).',
      'POLISH: Fixed mileage icon from MapPin to Gauge in service request modal. Fixed stale prefill closure in modal useEffect. Fixed invalid bg-gray-25 Tailwind class. Removed unused icon imports. Fixed getDataAuth endpoint to use efficient getPartnerById instead of findAllPartners for provider lookup.',
    ],
    module: 'Service & Maintenance',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'admin-service-maintenance',
    version: '3.7.3',
    title: 'V3.7.3 Master Admin — Service & Maintenance Management',
    summary: [
      'PARTNER DETAIL: Full drill-down detail view per partner (Euromaster, ADAC) with configuration, capabilities, default scopes, case distribution, enriched assignment/authorization data, and enforcement warnings for blocked orgs.',
      'DATA AUTHORIZATION MANAGEMENT: Grant/revoke authorization modal with per-scope checkbox selection, notes field, scope count. Per-org authorization detail with granted/missing scope visualization, edit/revoke actions. Authorization enforcement summary showing blocked orgs with clear reasons.',
      'ASSIGNMENT MANAGEMENT: Assign organization modal with org search, mode selection (Manual only / Live API). Inline auth-incomplete warnings per assignment with direct grant-authorization link.',
      'BACKEND ENDPOINTS: admin/service-partners/detail/:provider (enriched partner detail), admin/service-partners/data-authorizations/:orgId/:partnerId/grant (grant auth), DELETE admin/service-partners/data-authorizations/:orgId/:partnerId (revoke auth), admin/service-partners/auth-summary/:partnerId (enforcement summary), PATCH admin/service-partners/assignments/:orgId/:partnerId (update assignment).',
      'ENFORCEMENT VISIBILITY: Amber warning banner on partner detail showing count + reasons for blocked organizations. Per-assignment inline auth status. Authorization tab with enforcement summary grid (complete vs. missing scopes per org).',
      'FRONTEND API: Extended servicePartnersAdmin with detail(), updateAssignment(), grantAuth(), revokeAuth(), authSummary() methods.',
    ],
    module: 'Master Admin',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'euromaster-frontend-flows',
    version: '3.7.2',
    title: 'V3.7.2 Euromaster Frontend Flows & UI Integration',
    summary: [
      'REUSABLE MODAL: EuromasterServiceRequestModal — full service request flow with service type selection, vehicle prefill, mileage/date/contact/notes fields, authorization-aware disabled state, live/manual mode messaging, loading/success/error states. Used from Vehicle Detail, Tire Health, Fleet Condition, and Partner Detail.',
      'INTEGRATION HOOK: useEuromasterIntegration — shared hook fetching Euromaster access state (enabled, assigned, liveApiEnabled, manualMode, dataAuthGranted, grantedScopes, mode). Provides canCreateCase boolean and modeSummary label.',
      'STATUS COMPONENTS: EuromasterStatusBadge (Active/Manual only/Not assigned/Disabled/Authorization required) and EuromasterActionButton (interactive or disabled with lock icon) as reusable presentation components.',
      'VEHICLE DETAIL: Euromaster action button added to vehicle header next to health status badge. Opens service request modal prefilled with vehicle plate, make/model, and odometer.',
      'TIRE HEALTH: Static CTA in Tire Health modal replaced with interactive button. Opens service request modal with TIRE_SERVICE type pre-selected. Disabled with clear messaging when authorization is missing.',
      'FLEET CONDITION: Header CTA made interactive. Per-vehicle "EM" action button added to each vehicle row header when Euromaster is available. Opens modal prefilled with that vehicle.',
      'PARTNER DETAIL: ServiceMaintenanceView Euromaster detail page upgraded — Integration Status card showing enabled/API mode/data auth/scopes. New Case button now opens the real EuromasterServiceRequestModal.',
      'AUTHORIZATION-AWARE UX: All CTAs and buttons check canCreateCase from the hook. Disabled buttons show lock icon. Modal shows contextual guidance when disabled/not assigned/authorization missing.',
      'API CLIENT: New endpoints added to api.ts — euromasterAccess, euromasterTireService, euromasterBranches, euromasterSyncCase. EuromasterAccessInfo type exported.',
    ],
    date: '2026-04-02',
    module: 'Master Admin',
  },
  {
    id: 'euromaster-integration-layer',
    version: '3.7.1',
    title: 'V3.7.1 Euromaster API Integration Layer',
    summary: [
      'EUROMASTER CLIENT: Production-grade typed HTTP client (euromaster.client.ts) with configurable timeouts, retry with exponential backoff for idempotent operations, and structured error mapping from upstream responses.',
      'AUTH SERVICE: Euromaster auth service (euromaster-auth.service.ts) supporting both static API key and OAuth2 client_credentials patterns. Token caching with expiry margin. Clear extension point for final auth contract.',
      'MAPPER SERVICE: Bidirectional mapping layer (euromaster-mapper.service.ts) translating SynqDrive vehicles/cases to Euromaster API payloads and back. Service type mapping, manual-mode result generation, and case metadata builder.',
      'INTEGRATION SERVICE: Domain-facing orchestrator (euromaster-integration.service.ts) enforcing feature flags, tenant assignment, and data authorization scopes before any external call. Persists service cases and events for both live and manual modes. Failed attempts are recorded with diagnostics.',
      'DATA AUTH ENFORCEMENT: Every Euromaster operation validates required scopes (vehicle_identity.read, vehicle_plate.read, appointment.write, etc.) against granted data authorization. Missing scopes produce explicit domain errors.',
      'FEATURE FLAGS: Three-mode operation — disabled (no actions), manual (local persistence only), live (real API calls). Controlled via EUROMASTER_ENABLED, EUROMASTER_LIVE_API_ENABLED, EUROMASTER_MANUAL_MODE env vars.',
      'ERROR HIERARCHY: Eight typed error classes (EuromasterIntegrationDisabledError, EuromasterAuthorizationMissingError, EuromasterConfigError, EuromasterAuthError, EuromasterApiError, EuromasterTimeoutError, EuromasterMappingError, EuromasterTenantNotAssignedError) with code, statusCode, and structured details.',
      'CONFIG: registerAs euromaster config with env-based baseUrl, environment, credentials, timeout, retry settings. Registered in app.module config load array.',
      'CONTROLLER: New endpoints — GET euromaster/access, POST euromaster/tire-service, GET euromaster/branches, POST euromaster/cases/:caseId/sync. Existing appointment endpoint rewired through integration service.',
      'TESTS: 27 unit tests covering mapper, error classes, scope validation, persistence metadata, feature flag behavior, and data authorization enforcement.',
    ],
    date: '2026-04-02',
    module: 'Master Admin',
  },
  {
    id: 'service-maintenance-v1',
    version: '3.7.0',
    title: 'V3.7.0 Service & Maintenance Partner Integration Layer',
    summary: [
      'PARTNER ARCHITECTURE: Introduced generalized Service & Maintenance partner integration layer. New Prisma models: ServicePartner, TenantServicePartnerAssignment, PartnerDataAuthorization, PartnerServiceCase, PartnerServiceCaseEvent. Partners seeded on module init.',
      'EUROMASTER INTEGRATION: Euromaster registered as ACTIVE partner with tire service, brake, oil, and fleet care capabilities. EuromasterService provides appointment request, station search, and status check scaffolding. Live API calls are feature-flagged.',
      'ADAC INTEGRATION SHELL: ADAC registered as PREPARED partner. AdacService provides structural shell for assistance requests. Config, assignment, and data auth are supported but live API remains disabled.',
      'DATA AUTHORIZATION SYSTEM: Per-partner, per-org data authorization with granular scopes (vehicle_identity.read, vehicle_vin.read, vehicle_tire_data.read, service_request.write, appointment.write, etc.). Grant/revoke flow with audit trail.',
      'BACKEND MODULE: service-partners module with org-scoped controller (GET/POST/PATCH/DELETE assignments, data-auth, cases, euromaster convenience), admin controller (MASTER_ADMIN role-gated partner management, assignment overview, data auth overview, recent cases).',
      'RENTAL FRONTEND: New ServiceMaintenanceView under Integrations → Service & Maintenance. Partner list, detail pages with connection status, data authorization UI, service cases list. Euromaster and ADAC partner cards with capabilities and status badges.',
      'MASTER ADMIN FRONTEND: New ServiceMaintenanceAdminView with stats dashboard, partner overview, org assignment list, data authorization overview, and service cases tab. Seed button for partner initialization.',
      'CTAs: Euromaster service CTAs added to Tire Health detail modal, Fleet Condition header, and Vehicle Health box footer. Contextual "Plan with Euromaster" actions for tire service and maintenance needs.',
      'API CLIENT: Full service partner API surface added to frontend api.ts (servicePartners and servicePartnersAdmin namespaces).',
    ],
    date: '2026-04-02',
    module: 'Master Admin',
  },
  {
    id: 'fallback-3-6-3',
    version: '3.6.3',
    title: 'V3.6.3 AI Business Insights — Dashboard Box UI Polish & API Wiring',
    summary: [
      'LIVE API WIRING: Replaced static/hardcoded Business Insights placeholder in DashboardView with a real API-driven BusinessInsightsBox component. Fetches from GET /organizations/:orgId/dashboard-insights. Auto-refreshes every 5 minutes.',
      'COMPONENT ARCHITECTURE: Extracted BusinessInsightsBox as a dedicated component (BusinessInsightsBox.tsx). Handles loading (skeleton), empty (calm "no items" state with CheckCircle), error (retry button), and data states. Max 4 insights enforced client-side.',
      'SEVERITY STYLING: Four distinct severity levels (CRITICAL/WARNING/OPPORTUNITY/INFO) with professional, subtle color treatment. Each has icon, badge label, card background, and text color — consistent in both light and dark mode. Severity communicated through icon + color + label (not color alone).',
      'INSIGHT ROW UX: Compact card rows with icon, title (truncated at 36 chars), severity badge, message (truncated at 140 chars), optional action label with arrow affordance, and grouped count badge. Keyboard-accessible when clickable. Hover state only on actionable rows.',
      'EDGE-CASE HARDENING: Safe truncation for missing/null title/message. Defensive API response parsing. Graceful handling of 0/1/4 insights, missing actionLabel, partial payloads. RelativeTime display for generatedAt timestamp.',
      'API CLIENT TYPING: Typed the dashboardInsights.get() response with full insight DTO shape including severity, metrics, reasons, timeContext, grouping fields.',
      'DESIGN CONSISTENCY: Card uses identical border-radius, shadow, backdrop-blur, and padding as surrounding dashboard cards (Fleet Status, etc.). Typography scale matches (text-sm title, text-[11px] message, text-[10px] metadata).',
    ],
  },
  {
    id: 'fallback-3-6-2',
    version: '3.6.2',
    title: 'V3.6.2 AI Business Insights — Delivery, Scheduling & Debuggability Layer',
    summary: [
      'DASHBOARD ENDPOINTS: GET /organizations/:orgId/dashboard-insights serves max 4 persisted active insights sorted by priority (no recalculation on request). New /summary endpoint returns counts, last run metadata, and policy status.',
      'ADMIN/INTERNAL API: POST run/:orgId (with ?force=true option), POST run-all, POST trigger/:orgId (debounced), GET runs/:orgId (history), GET run-detail/:runId (diagnostics with insights), GET/PATCH policy/:orgId. All MASTER_ADMIN-protected.',
      'REDIS-BASED DEBOUNCED RERUNS: BusinessInsightsTriggerService uses Redis set+list for 2-minute per-tenant debounce window. Multiple events (booking/vehicle/station changes) coalesce into one pipeline run. Prevents event storms from triggering duplicate recalculations.',
      'ACTIVE-TENANT SCHEDULING: Scheduler detects overnight window (23:00–06:00) and reduces frequency to every 3rd cycle. Overnight runs filter to operationally active orgs only (orgs with bookings starting/ending within 12h). Daytime runs all active orgs. Prune cycle every ~24h.',
      'RUN DIAGNOSTICS: Every run records trigger source, startedAt, finishedAt, durationMs, candidateCount, publishedCount, errorMessage. Run history queryable via admin endpoint. Run detail includes associated insights for full traceability.',
      'POLICY MANAGEMENT: PATCH endpoint to update tenant policies (enabled, refreshIntervalMin, maxVisibleInsights, enabledTypes, useLlmFormatting, policyOverrides). Upsert behavior — creates default if none exists.',
      'RUNTIME TESTS: 30+ new test cases covering dashboard read constraints, stale expiration logic, debounce window behavior, overnight scheduling, trigger source classification, policy management, and insight lifecycle.',
    ],
  },
  {
    id: 'fallback-3-6-1',
    version: '3.6.1',
    title: 'V3.6.1 AI Business Insights — Production Pipeline Hardening',
    summary: [
      'RANKING OVERHAUL: Multi-factor scoring now combines severity base, operational type weight, explicit priority, confidence, time-urgency bonus (imminent events get up to +20 score), revenue-relevance contribution, and multi-vehicle boost. Critical same-day disruptions now decisively outrank opportunity insights.',
      'GROUPING IMPROVEMENT: Type-aware message templates (e.g. "3 vehicles idle with no recent or upcoming bookings"). Entity ID deduplication across grouped items. Highest severity from group members propagates to representative. Revenue metrics aggregated (totalLostRevenueEur).',
      'EXPIRED INSIGHT CLEANUP: Repository now auto-expires insights past expiresAt before serving. Orchestrator runs cleanup before each detection cycle. Scheduler prunes inactive insights and old runs older than 7 days every ~24h.',
      'DETECTOR REFINEMENTS: Tight handover now includes vehicle label, pickup/return station IDs, cross-station warning, and hours-until-next metric. Low utilization refactored from N+1 queries to batched groupBy for O(1) DB round-trips per org. Station-aware groupKeys for per-station grouping.',
      'FORMATTER: Deterministic type-based title and action-label templates. Message length capped at 160 chars, title at 40. No LLM dependency in default path.',
      'DTO ENRICHMENT: DashboardInsightDto now includes reasons[] and timeContext{} fields for richer UI rendering.',
      'UNIT TESTS: 22 test cases covering ranking order, time-urgency boost, revenue/vehicle-count factors, deduplication, grouping, type-based templates, formatter truncation, and threshold logic for tight handover, low utilization, and station shortage.',
    ],
  },
  {
    id: 'fallback-3-6-0',
    version: '3.6.0',
    title: 'V3.6.0 AI Business Insights — Deterministic Rental Operations Insights Engine',
    summary: [
      'BUSINESS INSIGHTS ENGINE: New multi-tenant backend module that generates short, action-oriented dashboard insights per organization based on rental operations data. Designed for car rental operators — not a free-form AI chat, but a deterministic detection + ranking pipeline.',
      'SIX INSIGHT DETECTORS: tight_handover (insufficient buffer between return → next pickup), return_needs_inspection (returning vehicles that need extra attention based on rental duration, km, abuse, driving score), station_shortage (near-term vehicle availability gaps per station), low_utilization (vehicles idle without bookings), service_window (free time windows usable for service/cleaning), service_before_booking (vehicles needing attention before upcoming pickup).',
      'ARCHITECTURE: DetectorContext → 6 deterministic detectors → InsightCandidate[] → dedup + grouping → ranking (severity × priority × confidence) → template formatting → DB persistence. No LLM required — optional LLM formatting behind feature flag. Scheduled 30-min refresh for all active orgs + manual admin re-runs.',
      'TENANT ISOLATION: Every query, run, and persisted insight is scoped by organizationId. TenantInsightPolicy per org controls enabled types, refresh interval, max visible insights, detector thresholds, and LLM formatting flag.',
      'DATA MODEL: TenantInsightPolicy (per-org config), DashboardInsightRun (run tracking with duration/counts), DashboardInsight (persisted insights with type, severity, priority, title, message, actionLabel, entityScope, entityIds, metrics, reasons, confidence, dedupeKey, groupKey, expiresAt).',
      'DASHBOARD API: GET /organizations/:orgId/dashboard-insights returns generatedAt, severity summary counts, and top active insights sorted by priority (max 4 for UI). Internal admin endpoints: POST /admin/business-insights/run-all, POST .../run/:orgId for debugging.',
    ],
  },
  {
    id: 'fallback-3-5-0',
    version: '3.5.0',
    title: 'V3.5.0 Vehicle Logbook — Per-Vehicle Telemetry Debug & Signal Trace Console',
    summary: [
      'VEHICLE LOGBOOK: New Master Admin module for per-vehicle telemetry debugging, signal tracing, and processing flow inspection. Enables developers and admins to diagnose why specific UI fields are missing, which signals arrived, which workers processed data, and how trip detection and HF enrichment behaved for any vehicle.',
      'ACTIVATION MODEL: Logbook mode can be enabled per vehicle with time-limited presets (1h, 6h, 24h, 7d). Logbook is not globally always-on — it is activated intentionally per vehicle. VehicleLogbookConfig table stores activation state, time window, and operator context.',
      'OVERVIEW TAB: Shows vehicle identity, connection status, trip detection state, battery tracking status (LV/HV publication state), and logbook config. Provides immediate "is this vehicle alive?" diagnostics.',
      'SIGNAL GROUPS TAB: Analyzes all 18+ telemetry signals from the latest DIMO snapshot. Groups signals by domain (Core Telemetry, Fuel/Energy, Battery, Engine, Tires). Shows which signals are present vs missing, with direct UI consumption mapping. Explains why a field is empty.',
      'WORKERS & TIMELINE TAB: Chronological log of all BullMQ worker/processor executions for the vehicle (snapshots, trip tracking, DTC polls, etc.) from DimoPollLog. Shows timestamp, job type, status, duration, and errors. Helps reconstruct processing history step by step.',
      'TRIP DETECTION TAB: Full state machine debug view — current state, detection profile, possible start/end timestamps, CUSUM validation, end validation attempts, evidence summary. Includes human-readable explanations per state. Lists 10 most recent trips with enrichment status.',
      'HF ANALYSIS TAB: Lists HF enrichment runs per trip with event counts (acceleration, braking, abuse), detection profile, and quality assessment. Helps verify whether HF data arrived correctly and detections ran.',
      'DTC / ERROR CODES TAB: DTC scheduler status, last poll/success timestamps, active and historical codes, raw OBD list, and error messages. Helps debug whether error codes were received, parsed, and surfaced correctly.',
      'UI MAPPING TAB: Maps 15+ important UI fields (fuel %, SOH, odometer, location, trip state, DTC count, etc.) back to their backend field → raw signal origin. Shows healthy/null_value/stale status with human-readable explanations. Answers "Why is this UI field empty?" directly.',
      'RAW LOGS TAB: Expandable raw JSON payloads for the latest snapshot, trip detection state, signal coverage, and overview data. Sized and labeled. For advanced/senior engineer inspection only.',
      'ALL DATA RECONSTRUCTED FROM EXISTING TABLES: No new heavyweight trace storage. Overview from VehicleLatestState + VehicleTripDetectionState, timeline from DimoPollLog, DTC from VehicleDtcEvent, trips from VehicleTrip, battery from BatteryFeatures + HvBatteryHealthCurrent. Only VehicleLogbookConfig is a new table.',
      '3-LAYER READABILITY: Each tab follows the pattern: (1) human-readable explanation, (2) structured technical cards/tables, (3) raw JSON expandable. Designed for beginner developers as well as senior engineers.',
    ],
  },
  {
    id: 'fallback-3-4-0',
    version: '3.4.0',
    title: 'V3.4.0 Speeding Sections — True Section-Based Speeding Analysis, Severity Model, Map Visualization',
    summary: [
      'SPEEDING SECTIONS ARCHITECTURE: Replaced the legacy point-count-based speeding analysis with a true section-based model. Overspeed detection now uses per-leg Mapbox speed limits (instead of trip-wide average), groups consecutive overspeed points into continuous sections with hysteresis (≤2 point / ≤10s gaps tolerated), and derives all summary metrics from real sections.',
      'SEVERITY MODEL: Each speeding section is classified as LOW / MODERATE / HIGH / SEVERE based on a combination of avgOverSpeedKmh, maxOverSpeedKmh, duration, and distance — not just peak speed alone. A brief minor exceedance is LOW; a sustained 30+ km/h average overspeed or 50+ km/h peak is SEVERE.',
      'SECTION-BASED SUMMARY: Trip speeding metrics are now derived from sections: section count, total speeding distance (meters), total speeding duration (seconds), peak overspeed, average overspeed, and distance-based speeding exposure %. Legacy point-based speedingPercent preserved for backward compatibility.',
      'MAP VISUALIZATION FIX: Removed the hardcoded >130 km/h red-dot filter. Map now highlights actual speeding sections as colored lines (severity-coded: yellow/amber/red) matching the real overspeed detection logic with proper road speed limits and 5% tolerance.',
      'UI OVERHAUL: Trip row summary now shows section count + severity indicator. Expanded trip detail shows 4-card summary (sections, distance, peak over, exposure) plus a detailed section list with time, duration, distance, limit, max/avg overspeed, severity badge, and Mapbox vs fallback limit transparency.',
      'LIMIT SOURCE TRANSPARENCY: Each section tracks how many points used Mapbox-derived speed limits vs fallback inferred limits. Sections primarily based on fallback limits are labeled "Estimated limit" in the UI.',
    ],
  },
  {
    id: 'fallback-3-3-0',
    version: '3.3.0',
    title: 'V3.3.0 Battery SOH Publication Stabilization — Three-Layer Model, Maturity States, Calibration UI',
    summary: [
      'THREE-LAYER SOH MODEL: Introduced Raw → Stabilized → Published SOH pipeline for both LV (12V) and HV (traction) batteries. Raw SOH computed as before; Stabilized SOH uses EWMA smoothing with outlier guard; Published SOH gated by hysteresis (2pp minimum change or threshold crossing).',
      'MATURITY STATES: Added INITIAL_CALIBRATION / STABILIZING / STABLE publication states. LV requires 3+ qualified events and 5+ days for STABILIZING, 5+ events and 7+ days with mixed rest/crank data for STABLE. HV requires 5+ valid estimates and 7+ days for STABILIZING, 10+ estimates and 14+ days for STABLE. Degradation-model-only HV capped at INITIAL_CALIBRATION.',
      'CALIBRATION UI: All battery display surfaces (Dashboard Health Box, Health Tab cards + modals, Fleet Condition view, Fleet Detail view) now show "Initial calibration in progress" with animated 3-dot loader during INITIAL_CALIBRATION, "Estimated SOH" with Stabilizing badge during STABILIZING, and normal display during STABLE.',
      'OUTLIER GUARD: Raw SOH values deviating >5pp from stabilized are damped (alpha reduced from 0.25/0.20 to 0.05). Outlier suppression count tracked per vehicle.',
      'CONFIDENCE MODEL: Refined into signal confidence (feature coverage) × maturity confidence (temporal depth). Combined confidence exposed in API and detail views.',
    ],
    reason: 'Battery SOH was published too early and too directly, causing visible day-to-day jumps and unprofessional first impressions when data was still immature.',
    previousBehavior: 'SOH computed from current features and shown immediately in UI without smoothing, maturity gating, or publication hysteresis. Fresh vehicles showed volatile SOH values from day one.',
    details: 'Schema: Added SohPublicationState enum, extended BatteryFeatures with publication fields, created HvBatteryHealthCurrent model. Backend: soh-publication.ts (shared utilities), battery-v2.service.ts (LV pipeline), hv-battery-health.service.ts (HV pipeline + upsertPublicationState), vehicle-intelligence.controller.ts (publication-aware endpoints). Frontend: api.ts types, App.tsx, HealthErrorsView.tsx, FleetConditionView.tsx, FleetConditionDetailView.tsx. Tests: 34 unit tests for publication utilities.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-3-2-1',
    version: '3.2.1',
    title: 'V3.2.1 Trip Behavior Events — Expandable Detail Fix for LTE_R1 + UI Enhancement',
    summary: [
      'BEHAVIOR EVENTS ENDPOINT FIX: Backend behavior-events endpoint now merges events from both tripBehaviorEvent (SMART5 HF-derived + Abuse) and drivingEvent (LTE_R1 native DIMO Telemetry API events). Previously LTE_R1 acceleration/braking events were stored only in drivingEvent and the endpoint only queried tripBehaviorEvent, causing empty expandable sections.',
      'EVENT DETAIL CARDS: Replaced plain table layout with rich event detail cards showing classification badge, event type, timestamp range, duration, speed (start → end), intensity (m/s²), G-force, throttle, RPM, coolant temperature, GPS location (lat/lng), and LTE source indicator.',
      'FRONTEND TYPE UPDATE: TripBehaviorEvent interface extended with latitude, longitude, and source fields to support location display and event origin identification.',
    ],
    reason: 'Users reported that expanding Acceleration/Braking sections in trip details showed "No events detected" for LTE_R1 vehicles despite the trip having non-zero event counts. Root cause: dual-table storage architecture (drivingEvent for LTE_R1, tripBehaviorEvent for SMART5) with endpoint only querying one table.',
    previousBehavior: 'Expanding Acceleration or Braking sections for LTE_R1 vehicle trips showed empty "No events detected" message even when event counts were non-zero.',
    details: 'Modified: vehicle-intelligence.controller.ts (behavior-events endpoint merges both tables with deduplication), api.ts (TripBehaviorEvent interface), TripsView.tsx (EventDetail card component + enhanced BehaviorAnalysis expanded section).',
    affectsArchitecture: false,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-3-2-0',
    version: '3.2.0',
    title: 'V3.2 Vehicle Health Box Redesign — Figma Alignment, Service Info Integration, Brand Logos CDN',
    summary: [
      'VEHICLE HEALTH BOX REDESIGNED: Dashboard Vehicle Health Box now matches Figma Make design with animated heart ECG, health score badge with pulse indicator, status bar (Critical/Due Soon/Faults), progress bars with status labels, and integrated Service Info section.',
      'SERVICE INFO BOX REMOVED: Separate Service Info box eliminated from dashboard — Maintenance (next service in weeks + km) and Inspection (TÜV date with color coding) are now integrated directly into the Vehicle Health Box.',
      'API-WIRED HEALTH DATA: Vehicle Health Box now fetches real data from backend APIs (tireHealthSummary, brakeStatus, batteryHealthSummary, serviceInfoStatus, dtcActive) instead of using hardcoded/fallback values. Graceful degradation with "No tracking" states when data is unavailable.',
      'BRAND LOGOS CDN: BrandLogo component upgraded from inline SVGs to CDN-based real brand logos (filippofilip95/car-logos-dataset). Extended brand detection to 30+ manufacturers including Seat, Kia, Mazda, Honda, Nissan, Jaguar, Land Rover, Alfa Romeo, etc.',
    ],
    reason: 'Dashboard health visualization needed to match Figma design language, eliminate hardcoded data, and consolidate Service Info into the health box for a cleaner single-card layout.',
    previousBehavior: 'Vehicle Health Box used static grid of Alerts/Anomalies/Feedback counters with simple progress bars. Service Info was a separate box with hardcoded values. BrandLogo used inline SVGs for only 7 brands.',
    details: 'Modified: App.tsx (replaced Box 1 + Box 2 with VehicleHealthBoxWired component), BrandLogo.tsx (CDN logos + 30+ brands). No backend changes.',
    affectsArchitecture: false,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-3-1-0',
    version: '3.1.0',
    title: 'V3.1 Post-Audit Fixes — Signal Wiring, Health Consistency, Security & Dead Code Cleanup',
    summary: [
      'HV BATTERY SNAPSHOT WIRING: DimoSnapshotProcessor now calls HvBatteryHealthService.recordSnapshot() when evSoc is present in the normalized snapshot. EV/PHEV vehicles now accumulate HV battery health history automatically on every polling cycle.',
      'DIMO WEBHOOK SIGNATURE VERIFICATION: DimoWebhookController now validates x-dimo-signature header using HMAC-SHA256 when DIMO_WEBHOOK_SECRET is configured. Requests without valid signatures are rejected. Graceful degradation when secret is not set.',
      'ENRICHMENT ENQUEUE RETRY: Trip finalization HF-enrich enqueue now retries up to 3 times with exponential backoff (2s, 4s) instead of silently swallowing Redis failures via .catch().',
      'BRAKING EVENT COUNT SEMANTICS UNIFIED: SMART5 brakingEventCount now counts only HARD + EXTREME braking (matching LTE_R1 semantics). Previously SMART5 counted ALL severity levels, creating inconsistent rates for Driving Impact.',
      'HARSH CORNER COUNT FOR SMART5: harshCornerCount is now explicitly set to 0 for SMART5 trips (no lateral sensor in HF pipeline), ensuring field consistency with LTE_R1 which populates it from native events.',
      'BRAKE HEALTH PERIODIC RECALCULATION: New BrakeRecalculationScheduler runs hourly, recalculating brake health for all initialized vehicles. Previously brake health only updated on trip enrichment.',
      'TIRE HEALTH overallPercent CONSISTENCY: TireHealthService.recalculate() now uses the same weighted formula (0.55×min + 0.45×avg) as getSummary(). Previously recalculate used a simple axle average, causing divergent health values.',
      'LTE_R1 MIN TRIP DURATION GUARD: LteR1BehaviorEnrichmentService.enrichTrip() now skips trips shorter than 60 seconds, matching the SMART5 enrichment guard. Prevents processing of noise trips.',
      'DEAD CODE REMOVED: 11 unused Master Admin *Page.tsx files deleted (VehiclesPage, BillingPage, DimoPage, ProductsPage, IntegrationsPage, OrganizationsPage, UsersPage, SupportPage, ProspectsPage, ActivityPage, DashboardPage). RoadSurfaceType enum removed from schema (unused). Unused imports (RawBodyRequest, Req, Param) cleaned from webhook controller.',
      'SIGNER WALLET DIAGNOSTIC FIX: DIMO auth diagnostics signerWallet field now correctly shows "(configured)" or "(not set)" based on privateKey presence, instead of incorrectly displaying clientId.',
      'ENV EXAMPLE UPDATED: DIMO_WEBHOOK_SECRET added to .env.example for webhook signature verification configuration.',
    ],
    reason: 'Post-V3 deep audit identified missing signal wiring (HV battery), security gaps (unsigned webhooks), semantic inconsistencies (braking counts, tire health formula), missing periodic jobs (brake recalculation), and dead code accumulation.',
    previousBehavior: 'HV battery snapshots were never recorded from polling. Webhooks accepted unsigned requests. brakingEventCount had different semantics across hardware types. Tire recalculate and getSummary produced different overallPercent values. LTE_R1 enrichment processed sub-minute noise trips. 9 orphaned page files existed in master admin.',
    details: 'Modified: dimo-snapshot.processor.ts, dimo-webhook.controller.ts, trip-detection-orchestration.service.ts, trip-behavior-enrichment.service.ts, lte-r1-behavior-enrichment.service.ts, tire-health.service.ts, dimo-auth.service.ts, workers.module.ts, schema.prisma, .env.example. New: brake-recalculation.scheduler.ts. Deleted: 9 Master Admin *Page.tsx files.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-3-0-0',
    version: '3.0.0',
    title: 'V3 Architecture — Hardware-Aware Driving Event Source Split (LTE_R1 / SMART5)',
    summary: [
      'V3 HARDWARE CAPABILITY LAYER: A new HardwareType enum (LTE_R1, SMART5, UNKNOWN) has been added to the Vehicle model. All existing vehicles default to UNKNOWN (backward-compatible, falls back to SMART5 HF-derived behaviour). The getVehicleCapabilities() helper resolves runtime behaviour from hardware type — no raw if (hardwareType === ...) checks scattered across the codebase.',
      'LTE_R1 DRIVING EVENTS: For vehicles classified as LTE_R1, Driving Events (harsh braking, extreme braking, harsh acceleration, harsh cornering) are now sourced primarily from DIMO Telemetry API native harsh-event signals. A new DIMO GraphQL query (safetySystemBrakingHarshBraking, safetySystemBrakingExtremeEmergency, safetySystemAccelerationHarshAcceleration, safetySystemCorneringHarshCornering) is executed over the trip window. The new LteR1BehaviorEnrichmentService handles ingestion, normalisation, and persistence of these events.',
      'SMART5 PATH UNCHANGED: SMART5 and UNKNOWN vehicles continue to use the existing HF time-series reconstruction path for all Driving Events (acceleration, braking classification). This is the existing V2/V2.4 pipeline, fully preserved.',
      'ABUSE REMAINS HF FOR BOTH: Regardless of hardware type, Abuse detection (FULL_BRAKING, POSSIBLE_IMPACT, COLD_ENGINE_HIGH_RPM, etc.) continues to run on HF time-series data. The HF pipeline is not removed — it runs for abuse for all vehicles, and for driving events only on SMART5/UNKNOWN.',
      'COLD-ENGINE CONTEXT ENRICHMENT (LTE_R1): For LTE_R1 trips, HF data is also fetched alongside native driving events to provide engine temperature, RPM, and throttle context. Each imported event is annotated with a coldEngineContext badge (coolantC < 60°C at event time), plus RPM and throttle position at the moment — reducing over-reliance on isolated throttle-only cold-engine heuristics while keeping the logic explainable.',
      'NORMALISED DrivingEvent MODEL: DrivingEvent records now carry a source field (TELEMETRY_EVENTS or HF_DERIVED), organizationId, and metadataJson (includes coldEngineContext, coolantC, rpm, throttlePct, hardwareSource).',
      'DRIVING IMPACT V3: For hardwareType LTE_R1, DrivingImpactService.computeForTrip() reads extreme braking counts and braking-event statistics from DrivingEvent (TELEMETRY_EVENTS) instead of TripBehaviorEvent BRAKING rows (which are abuse-only on LTE_R1). Canonical VehicleTrip counters (hardBrakingCount, hardAccelerationCount, brakingEventCount) remain the primary rates; TripDrivingImpact.sourceSummaryJson includes v3DrivingEventInput and vehicleHardwareType for traceability. LAUNCH_LIKE_START is counted alongside legacy LAUNCH_CONTROL for abuse-derived launch metrics.',
      'MASTER ADMIN API WIRING: register-from-dimo extraData and vehicle PATCH now pass hardwareType; mapToRegisteredVehicle / list responses expose hardwareType so the register form round-trips correctly.',
      'ADMIN HARDWARE FIELD: The Master Admin Vehicle Registration form now includes a Hardware Type section (LTE_R1 / SMART5 / Unknown). PATCH /vehicles/:id/hardware-type allows single-vehicle classification. POST /admin/vehicles/hardware-backfill enables bulk backfill of existing eligible vehicles to LTE_R1 in one MASTER_ADMIN-guarded API call.',
      'CUSUM EXPANSION NOTE: CUSUM/Segments remain the targeted start and end validation/refinement layer. No Vehicle Triggers API is used anywhere in the V3 architecture. Local state-machine Trip Start and Trip End detection are fully preserved.',
      'V2.4 HF CLEANUP CARRIED FORWARD: All V2.4 fixes (transaction-safe persistence, canonical counters, hysteresis, sampleCount acceptance, abuseScore, signal availability, 82 test cases) are fully included and operational in V3.',
    ],
    reason: 'Different hardware types (DIMO LTE_R1 vs SynqDrive SMART5) have fundamentally different telemetry capabilities. LTE_R1 devices report native harsh-event signals directly, making HF time-series reconstruction redundant for Driving Events. Separating the two paths removes false-positive risk from HF reconstruction on LTE_R1, leverages native event fidelity, and makes the architecture explicit and traceable.',
    previousBehavior: 'All vehicles used identical HF time-series reconstruction for Driving Events regardless of hardware type. No hardwareType field existed on Vehicle. DrivingEvent records had no source field. Native DIMO harsh-event signals were not consumed. No backfill mechanism existed for hardware classification.',
    details: 'New files: vehicle-capabilities.ts (capability resolver), lte-r1-behavior-enrichment.service.ts (LTE_R1 enrichment path), queries/driving-events.query.ts (DIMO harsh-event GraphQL query). Modified: schema.prisma (HardwareType enum, hardwareType on Vehicle, DrivingEventSource enum, source/organizationId/metadataJson on DrivingEvent), dimo-segments.service.ts (fetchDrivingEvents method), trip-behavior-enrichment.service.ts (hardware routing + LTE_R1 abuse-only path), vehicle-intelligence.module.ts (LteR1BehaviorEnrichmentService registered), vehicle-intelligence.controller.ts (PATCH hardware-type endpoint), platform-admin.controller.ts (backfill + summary endpoints), VehicleRegistrationModal.tsx (hardware section), platform-data.ts (hardwareType on RegisteredVehicle). Migration: 20260331000000_v3_hardware_type.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-2-4-0',
    version: '2.4.0',
    title: 'HF Post-Trip Performance & Abuse Pipeline — Reliability, Semantic Consistency & Full Test Coverage',
    summary: [
      'FIX A — TRANSACTION-SAFE PERSISTENCE: The HF enrichment persistence (delete + createMany + vehicleTrip.update) is now wrapped in a single Prisma transaction. A crash between delete and createMany can no longer leave a trip with missing behavior events. Idempotent re-enrichment behavior is preserved.',
      'FIX B — CANONICAL COUNTER SEMANTICS: hardAccelerationCount and hardBrakingCount are the canonical HF-derived counters. harshAccelCount and harshBrakeCount are explicitly documented as deprecated aliases mirrored from the canonical fields for backward compatibility only. Do NOT write new queries against harsh* fields.',
      'FIX C — ACCELERATION EVENT LOGIC: Entry threshold stays at 1.5 m/s². Hysteresis continuation added at 1.2 m/s² to prevent fragmentation. Acceptance now requires sampleCount >= 2 AND deltaKmh >= 4.0 (removed sub-second duration filter, replaced with 1s-compatible sample-count logic). Rich metadata added: deltaKmh, sampleCount, mergedCount, startSpeedBand.',
      'FIX D — BRAKING EVENT LOGIC: Entry stays at 1.5 m/s². Hysteresis at 1.2 m/s². Acceptance: sampleCount >= 2 AND deltaKmh >= 3.0. Rich metadata: deltaKmh, sampleCount, highSpeedStart, intensity.',
      'FIX E — FULL_BRAKING / POSSIBLE_IMPACT HARDENING: Both events now require a mini-window scanner (sampleCount >= 2), not a single pair. FULL_BRAKING: peakDecel >= 7.5 m/s², startSpeed >= 20 km/h, deltaKmh >= 6.0. POSSIBLE_IMPACT: peakDecel >= 12.0 m/s², startSpeed >= 25 km/h, deltaKmh >= 3.0. Single GPS spike artifacts can no longer trigger these critical events.',
      'FIX F — LAUNCH_LIKE_START REFINEMENT: LAUNCH_CONTROL renamed to LAUNCH_LIKE_START. startSpeed requirement tightened to <= 3 km/h (was < 8 km/h). peakAccel >= 3.5 m/s² now required in the acceleration window. Events above 3 km/h start speed are classified as aggressive acceleration only, not launch-like.',
      'FIX G — RPM-BASED ABUSE DETECTORS: ENGINE_SHUTDOWN_WHILE_DRIVING hardened with explicit time-gap guard (3.5s max between comparison points — prevents false positives from sparse windows). COLD_ENGINE_HIGH_RPM now stores maxCoolantTemp as the max over the full event, not just the start value. COLD_ENGINE_FULL_THROTTLE: 85% entry / 80% continuation documented as intentional hysteresis. ENGINE_REV_IN_IDLE and HIGH_RPM_CONSTANT hysteresis thresholds documented.',
      'FIX H — KICKDOWN HARDENING: KICKDOWN now requires speed > 20 km/h. Throttle blips while stationary or creeping can no longer be misclassified as kickdown.',
      'FIX I — SIGNAL AVAILABILITY TRANSPARENCY: behaviorSummaryJson now includes coolantAvailable, rpmAvailable, throttleAvailable, loadAvailable, and a detectorCoverage map. Downstream consumers and reviewers can now distinguish "no event occurred" from "detector was not evaluable due to missing signals".',
      'FIX J — ABUSE SCORE IMPLEMENTED: abuseScore is now computed and written. Formula: weighted sum of abuse events (by type × severity multiplier), capped at 100. Fully deterministic and explainable. POSSIBLE_IMPACT=20, ENGINE_SHUTDOWN=15, OVERHEATING=10, FULL_BRAKING=8, LAUNCH_LIKE_START=6, etc. Severity multipliers: WARNING=1.0×, SEVERE=1.5×, CRITICAL=2.0×.',
      'FIX K — TEST COVERAGE: 82 new unit tests covering all 11 abuse detectors. Each detector has below-threshold, boundary, positive, signal-missing, gap/sparse, and vehicle-specific RPM config cases. Noise protection regression tests added for FULL_BRAKING, POSSIBLE_IMPACT, and KICKDOWN.',
    ],
    reason: 'The HF pipeline had several reliability and semantic consistency issues identified in audit: non-atomic persistence, single-sample false positives for severe abuse events, undocumented hysteresis thresholds, a never-computed abuseScore field, and zero test coverage for abuse detectors.',
    previousBehavior: 'deleteMany + createMany for behavior events were NOT in a transaction. FULL_BRAKING and POSSIBLE_IMPACT fired from a single point-pair (GPS noise vulnerable). LAUNCH_CONTROL triggered at start speeds up to 8 km/h. KICKDOWN had no speed guard. abuseScore was declared in schema but never written. Acceleration/braking events always persisted empty {} metadata.',
    details: 'All 11 abuse detector functions updated in hf-abuse.ts. hf-acceleration.ts and hf-braking.ts refined with hysteresis, sampleCount tracking, and rich metadata. trip-behavior-enrichment.service.ts wrapped in prisma.$transaction(), added canonical/legacy counter mirroring, abuseScore write, signal availability assessment, and rich behaviorSummaryJson. New test file: hf-abuse.spec.ts with 82 tests. All 137 tests pass (82 new + 55 existing trip-detection).',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-2-3-0',
    version: '2.3.0',
    title: 'V2 Trip Detection — EV/HYBRID Idle Fix, Time-Based Continuity, Ignition De-prioritization & Architecture Cleanup',
    summary: [
      'FIX A — EV/HYBRID IDLE: assessActiveContinuity() now has a profile-aware path for EV and HYBRID vehicles. A stop at a traffic light while signal frequency is still active is correctly classified as IDLE instead of triggering POSSIBLE_END. Previously EVs had no ICE-style RPM/throttle/load signals, causing all stops to fall through to POSSIBLE_END.',
      'FIX B — TIME-BASED CONTINUITY: replaced the fragile recentCore.slice(-5) / perfReadings.slice(-5) approach with a configurable time-based window (TRIP_CONTINUITY_CORE_WINDOW_MS=120s, TRIP_CONTINUITY_PERF_WINDOW_MS=90s). Relevant earlier activity in the fetched window is no longer silently discarded. Falls back to last 3 points only when the time window returns zero data.',
      'FIX C — IGNITION DE-PRIORITIZED: hasActivityResumed() no longer considers stale ignition-ON as a signal to reopen a trip — speed must exceed speedMotionKmh. evaluateFrequency() now reads profile-specific activeFrequencyPerMin and restingFrequencyPerMin from PROFILE_THRESHOLDS instead of hardcoded values (2 and 1). This fixes the mismatch between configured and actual resting frequency boundary (was 1.0, correct is 0.5 from profile config).',
      'FIX D — V1 LEGACY ISOLATION: DimoSegmentsService.fetchAndDetectTrips(), detectTrips(), and finalizeTrip() are now clearly annotated as DEPRECATED V1 legacy methods. TripsService.syncTripsFromSegments() and enrichTrip() also marked. POST /trips/sync now returns a warning field. No live worker or orchestration path calls legacy detection code.',
      'FIX E — CANONICAL HF ENRICHMENT: Vehicle intelligence brake health scoring now prefers hardBrakingCount (HF canonical) over harshBrakeCount (legacy) when behaviorEnrichedAt is set on the trip. Falls back to legacy field for trips not yet HF-enriched. POST /trips/:tripId/enrich documented clearly as route-based complementary enrichment, NOT the behavior pipeline.',
      'CONFIG CLEANUP: tripEndMinInactivityBeforeCusumMs is now enforced — processPossibleEndCheck uses Math.max(stabilityWindow, minInactivity) as the CUSUM gate. Added tripContinuityCoreWindowMs and tripContinuityPerfWindowMs to worker.config.ts.',
      'DEAD CODE: hasEngineActivity field removed from ActivityEvidence (was always false, never computed). ENDED state in TripDetectionState schema preserved but annotated as dead — never transitioned to by the live engine.',
      'evaluateFrequency() signature updated to accept a profile parameter and use PROFILE_THRESHOLDS values.',
      'All fixes validated with expanded test suite: 55+ unit tests covering EV/HYBRID idle cases, time-based window, ignition de-prioritization, resume detection, CUSUM, profile frequency, merge/cancel, and canonical HF counter logic.',
      'Master Admin: Architecture page, Changes page, Trip Detection Logic page, and Performance Logic page updated to reflect improved V2 architecture.',
    ],
    reason: 'The existing V2 architecture had several correctness gaps: (1) EV/HYBRID stops at traffic lights immediately triggered POSSIBLE_END because the ICE-based perf activity check (RPM/throttle/load) never returns true for EVs; (2) the fixed slice(-5) approach could silently discard relevant activity from the fetched window; (3) stale ignition-ON in hasActivityResumed() could reopen a trip even without real movement; (4) evaluateFrequency() used hardcoded thresholds (resting=1.0 ppm) that didn\'t match the configured profile thresholds (resting=0.5 ppm), causing premature resting classification; (5) the V1 detectTrips path was confusingly present alongside V2; (6) health scoring consumed the wrong behavior counter for HF-enriched trips.',
    previousBehavior: 'assessActiveContinuity: EV stopped → perfHasActivity=false → no IDLE path → fell through to POSSIBLE_END immediately. hasActivityResumed: checked isIgnitionOn && speed > 0, meaning stale ignition + 0.1 km/h could reopen a trip. evaluateFrequency: isRestingFrequency = ppm < 1 (hardcoded), PROFILE_THRESHOLDS.restingFrequencyPerMin = 0.5 (ignored). Health scoring: always used harshBrakeCount regardless of HF enrichment status.',
    details: 'assessActiveContinuity now checks profile === EV || HYBRID after the ICE perf-active IDLE path. For EV/HYBRID: if allStopped and freq.isActiveFrequency → return IDLE with reason ev_hybrid_stop_active_frequency. This relies on the device still sending data at active cadence (≥2 pts/min), which is reliable during genuine within-trip stops. The time-based window filter in processActiveTick: corePoints.filter(p => nowMs - timestamp <= TRIP_CONTINUITY_CORE_WINDOW_MS), falls back to corePoints.slice(-3) if the filtered window is empty. The CUSUM gate now uses Math.max(TRIP_END_STABILITY_WINDOW_MS, TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS) so the config value is actually enforced.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-2-2-0',
    version: '2.2.0',
    title: 'V2 Trip Detection — Reliable Trip End with CUSUM Validation',
    summary: [
      'Trip Start logic preserved — all existing start detection modes (IGNITION_PRIMARY, MOTION_PRIMARY, GPS_ODOMETER_FALLBACK, etc.) remain fully intact',
      'Trip End no longer requires ignition-off as a primary condition — signal silence, frequency drop, and no movement are now the primary end evidence',
      'CRITICAL FIX: assessActiveContinuity no longer keeps a trip in IDLE when ignition state is stale/stuck ON but there is no perf activity and no movement',
      'New POSSIBLE_END flow: stability window (3 min) → targeted CUSUM change-point validation → finalize (timeout only as last resort)',
      'CUSUM (Cumulative Sum Change Point Detection) analyses a bounded TripDetectionCore window around possibleEndAt to validate when movement actually stopped',
      'New END_DETECTION_MODES: CUSUM_VALIDATED (highest priority), IGNITION_OFF_CONFIRMED (bonus, not required). Old modes preserved for compatibility.',
      'End timestamp priority: cusumSegmentEnd → lastMeaningfulMovementAt → lastWaypoint → possibleEndAt → fallback now',
      'New DB fields on VehicleTripDetectionState: lastMeaningfulMovementAt, endValidationAttempts, cusumValidatedAt, cusumSegmentStart, cusumSegmentEnd',
      'New BullMQ trigger: END_VALIDATION dispatched after stability window. TripTrackingRunType.END_VALIDATION added.',
      'New centralized config: TRIP_END_STABILITY_WINDOW_MS, TRIP_END_VALIDATION_RETRY_MS, TRIP_END_VALIDATION_MAX_ATTEMPTS, TRIP_END_SEGMENT_LOOKBACK_MS, TRIP_END_SEGMENT_LOOKAHEAD_MS',
      'New Master Admin pages: Trip Detection Logic, Performance Logic',
      'Architecture page updated with V2 signal groups, state machine, and improved end logic documentation',
      '30 unit tests added covering: ignition-stuck-ON fix, CUSUM detection, EV/ICE profiles, stop-and-go false positive prevention, end time priority',
    ],
    reason: 'Once a vehicle parks, the OBD device often stops transmitting before a clean ignition-off signal arrives. The previous V2 end logic treated ignition-off as a primary end condition, so a stuck-ON ignition state would keep a trip in IDLE_WITHIN_TRIP indefinitely until the 30-minute hard timeout triggered.',
    previousBehavior: 'assessActiveContinuity: "allStopped && !allIgnitionOff" → IDLE, regardless of whether movement, perf, or energy activity was present. A parked vehicle with stale ignition=true would never reach POSSIBLE_END until timeout. POSSIBLE_END used only timeout (30 min) for finalization, with no intermediate validation.',
    details: 'Core fix is in assessActiveContinuity(): old logic used ignition=ON as a sufficient reason to keep the state IDLE. New logic requires EITHER perf activity (RPM/throttle/load) OR energy change to justify IDLE. If all stopped + no perf + no energy change, the trip transitions to POSSIBLE_END regardless of ignition state. CUSUM is implemented in trip-cusum.ts as a standalone module — completely separate from the start logic. It is triggered only once per POSSIBLE_END stability window expires. It queries a bounded 20-minute window of TripDetectionCore data and applies a binary stopped-indicator CUSUM to find the change-point where movement ceased. HF enrichment trigger after finalization is unchanged.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-2-1-0',
    version: '2.1.0',
    title: 'Brake Health Tracking Module V2 — Anchor-Based Achsweise Model',
    summary: [
      'New BrakeHealthCurrent Prisma model stores per-vehicle achsweise (front/rear) pad + disc state with anchor, k-factor calibration, and confidence',
      'CRITICAL: Brake Health MUST NOT estimate without a valid brake service anchor — UI clearly communicates awaiting state',
      'Pad model: base_wear = (anchor - 2.0mm) / 70000 km, multiplied by usage (city=1.35), stopDensity, hardBrake, fullBraking, reku (EV=0.72, PHEV=0.82), and k-factor',
      'Disc model: base_wear = 2.0mm / 90000 km, with usage (city=1.20), highSpeedBrake, hardBrake, fullBraking, thermal (interpolated from thermalBrakeStressScore), reku (EV=0.86, PHEV=0.90)',
      'Brake bias from brakeForceFrontPercent or EBD fallback (0.72/0.28), adjusts wear rate proportionally per axle',
      'Set-level health: 0.60 × min(front, rear) + 0.40 × avg(front, rear)',
      'Point-based confidence scoring: pad anchors +20, rotor anchors +10, service events +12, DI data +15, braking metrics +10, usage +8, odometer +10, calibration +5',
      'Alerts: pad ≤3.0mm warning / ≤2.0mm critical, disc at warning/critical thresholds, remaining km ≤3000/1000, low confidence',
      'API endpoints: GET brake-health/summary, GET brake-health/detail, POST brake-health/initialize, POST brake-health/recalculate',
      'Frontend brake card shows V2 data (pads %, discs %, remaining km, confidence) when initialized; graceful fallback to legacy brake-status',
      'Manual entry form now accepts front/rear pad thickness and rotor width to establish service anchor and start V2 tracking',
      'Extended VehicleImpactForBrake interface with citySharePct, highwaySharePct, countryRoadSharePct for usage factor calculation',
      'Updated Architecture, Changes, and Health Tracking Module pages in Master Admin',
    ],
    reason: 'Brake Health V1 was a simple heuristic (pad percent from telemetry, km since service, harsh brake count) with no deterministic wear model, no disc tracking, no anchor system, and no integration with Driving Impact Engine.',
    previousBehavior: 'brake-status endpoint used raw VehicleLatestState.brakePadPercent, counted harsh brakes from recent trips, and produced watchpoints/recommendations. No pad/disc thickness modeling, no per-axle tracking, no confidence scoring.',
    details: 'BrakeHealthService implements computePadWear() and computeDiscWear() as deterministic achsweise models. Both consume Driving Impact Engine V1 rolling 30-day metrics via getVehicleImpactForBrake(). The anchor system enforces no estimation without a valid brake service event — pre-anchor braking data is intentionally ignored for wear calculation. k-factor calibration uses EMA with alpha 0.12/0.18/0.24 based on measurement count, clamped to [0.70..1.35] (pads) and [0.75..1.30] (discs). The existing brake-status endpoint is preserved as a legacy fallback.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-2-0-0',
    version: '2.0.0',
    title: 'Tire Health Tracking Module V2 — Driving Impact Integration',
    summary: [
      'Rewrote tire-health.config.ts with exact spec thresholds: season-aware replace (summer=3.0, winter=4.0), health status at 85/70/50/25, confidence at 80/55, calibration k∈[0.75..1.30] with α∈[0.12..0.24]',
      'Integrated Driving Impact Engine V1 as PRIMARY behavior/usage source — tire module no longer reads raw trip counts for usage/behavior factors',
      'New axle factor formula: dampedLoadFactor × drivetrainBias × steeringBias, clamped [0.88..1.22], supports weight distribution',
      'Usage factor from Driving Impact Engine city/highway/country split with factors 1.12/0.95/1.03, clamped [0.93..1.15]',
      'Behavior factor mapped from DI Engine longitudinalStress/brakingStress/drivingStyle scores via interpolated anchor curve, clamped [0.97..1.35]',
      'Temperature factor simplified to trip-start temp bands: <0°C→1.03, 0–5→1.02, 5–28→1.00, 28–35→1.03, >35→1.06',
      'Calibration uses EMA k-factor: α=0.12 (1st), 0.18 (2–3), 0.24 (4+), skip when predictedWear < 0.3 mm, clamped [0.75..1.30]',
      'Set-level health formula: 0.55 × minTire + 0.45 × avgTire (not plain average)',
      'Point-based confidence scoring (0–100): initial tread +20, tire size +10, brand/model +8, odometer +12, DI usage +10, DI behavior +10, measurements +5/+5, etc.',
      'Rotation review logic: normalReviewKm=12000, urbanHeavyReviewKm=10000, overdueKm=15000 — NOT a fixed forced interval',
      'Uneven wear alerts at 0.6 mm (attention) and 1.0 mm (critical) left/right delta',
      'Added frontWeightDistributionPct to Vehicle schema for axle factor calculation',
      'Updated frontend factor display: axle/usage/behavior/temperature replace old climate/road/style/weight factors',
      'Updated HealthErrorsView and FleetConditionDetailView to use new factor names',
      'Updated Architecture, Changes, and Health Tracking Module pages in Master Admin',
      '56 unit tests passing for all factors, calibration, config integrity, regen, staggered, regression',
    ],
    reason: 'Tire Health V1 duplicated behavior normalization from raw trip counts, used different factor models than planned Brake Health, and had no integration with the Driving Impact Engine. V2 uses the shared DI Engine as the single source of truth for driving behavior and usage classification.',
    previousBehavior: 'Tire wear model used computeRoadSurfaceFactor (event-count-based), computeRoadTypeFactor (from trip %), computeClimateFactor (continuous temperature curve), and computeDrivingStyleFactor (from drivingScore) — all computed independently. No shared layer with Brake Health. Confidence used different weights. Health thresholds were 75/50/30/10.',
    details: 'TireWearModelService now injects DrivingImpactService and calls getVehicleImpactForTire() to obtain normalized 30-day rolling behavior scores and usage split. computeAxleFactor() implements the spec §10 formula with damped load bias, drivetrain bias, and steering bias. computeBehaviorFactor() uses the DI Engine longitudinalStressScore (weight 0.50), brakingStressScore (0.35), and drivingStyleScore (0.15) via a piecewise-linear anchor curve mapping score→factor. The final per-tire wear formula: base_mm_loss × axle × usage × behavior × temp × k × regen.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-1-9-0',
    version: '1.9.0',
    title: 'Driving Impact Engine V1 — Shared Normalization Layer',
    summary: [
      'Added Driving Impact Engine V1 as a shared backend layer between HF enrichment and Tire Health / Brake Health modules',
      'Runs automatically after HF enrichment succeeds — triggered via new BullMQ queue trip.driving-impact.compute',
      'Computes 5 normalized stress scores per finalized trip: longitudinal, braking, stop-go, high-speed, thermal brake (each 0–100)',
      'Computes 7 per-100km behavioral rates: hardAccel, extremeAccel, hardBrake, extremeBrake, fullBraking, kickdown, launchLike',
      'Derives braking statistics from TripBehaviorEvent rows: p95NegativeDecel, highSpeedBrakeShare, stopDensity, meanBrakeEnergyPerKm',
      'Persists one TripDrivingImpact row per finalized trip (unique on tripId)',
      'Maintains a rolling 30-day VehicleDrivingImpactCurrent row per vehicle using distance-weighted averaging',
      'All weights and reference maxes are centralized in drivingImpactConfig — no scattered literals',
      'Trips below 2 km are skipped (unstable per-100km normalization); result is logged and processing continues safely',
      'DrivingImpactService exposes typed consumer methods: getTripImpactForTire, getVehicleImpactForTire, getTripImpactForBrake, getVehicleImpactForBrake',
      'modelVersion persisted in both tables for formula traceability',
      'Updated Architecture, Changes, and Health Tracking Module pages in Master Admin',
    ],
    reason: 'Tire Health and Brake Health were computing different versions of driving aggressiveness from the same raw counts. City/highway weighting, braking severity, and stop-density were inconsistent between modules. This engine provides a single normalized truth layer so downstream health models consume identical inputs.',
    previousBehavior: 'No shared driving impact layer existed. Tire Health read harshBrakeCount / harshAccelCount directly from VehicleTrip. Brake Health had no behavior inputs at all. Each module would have had to implement its own normalization independently.',
    details: 'DrivingImpactService.computeForTrip() gathers inputs from VehicleTrip (distance, city/highway/country%, event counts) and TripBehaviorEvent (EXTREME counts, braking event speed/decel data). It computes per-100km rates, derives statistical braking metrics, applies weighted stress formulas, and persists results. Rolling 30-day aggregate is updated via distance-weighted average of all TripDrivingImpact rows in the window. The computation is enqueued by TripBehaviorEnrichmentProcessor only when enrichment returned actual data (not skipped), so the pipeline remains trip-finalized-only with no global background polling.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-1-8-0',
    version: '1.8.0',
    title: 'Error Codes / DTC Monitoring Module',
    summary: [
      'Fixed DimoDtcProcessor to diff previous vs new active codes — codes disappearing from the DIMO poll are now correctly cleared (isActive = false, clearedAt set)',
      'Added lastDtcSuccessfulCheckAt, dtcPollStatus, and dtcPollError fields to VehicleLatestState for accurate freshness tracking',
      'Added occurrenceCount to VehicleDtcEvent to track how often a code has been seen',
      'Poll failures no longer overwrite lastDtcSuccessfulCheckAt or clear active DTC codes — last known state is preserved',
      'Added DtcService.getSummary() returning UI-ready status: clean / active_faults / stale / unavailable',
      'Added DtcService.getDetail() returning 3-section detail payload: currentFaults, history, monitoring',
      'Added GET /vehicles/:vehicleId/dtc/summary and GET /vehicles/:vehicleId/dtc/detail API endpoints',
      'Updated Health tab Error Codes Quick Box to be staleness-aware — never shows "No active faults" when data is stale or unavailable',
      'Rewrote Error Codes Detail Modal with 3 sections: A) Current Fault Status, B) Historical Fault Codes, C) DTC Monitoring Information',
      'Updated Architecture page DTC entry with accurate poll flow description',
      'Updated Health Tracking Module documentation page with full Error Codes section',
    ],
    reason: 'The existing DTC worker collected codes but never cleared them when they disappeared, showed "No active faults" even on stale data, and provided no way to distinguish between no faults, stale status, and unavailable monitoring.',
    previousBehavior: 'DTC codes were only ever upserted, never cleared. lastDtcPollAt was set on every attempt including failures. The UI showed active count from raw data without staleness guards — "0 active faults" could appear even when the last check was 2 days ago.',
    details: 'The processor now fetches the current set of active codes from vehicle_dtc_events, diffs it against the DIMO response, and calls clearDtc() for codes that no longer appear. lastDtcSuccessfulCheckAt is only updated on success. The stale threshold is 6 hours (2× the 3-hour poll interval). The /dtc/summary endpoint returns a fully UI-ready status enum so the frontend never has to infer state from raw fields.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-1-7-0',
    version: '1.7.0',
    title: 'Battery Health Tracking V2',
    summary: [
      'Added battery_features table for per-vehicle rest and crank feature storage',
      'Integrated rest-window voltage capture (60 min + 6 h) into existing 30 s Snapshot Worker — no new scheduler',
      'Integrated crank feature extraction (v_pre, v_min, crank_drop, 5 s and 30 s recovery) as fire-and-forget hook on V2 trip start',
      'Added BatteryV2Service with weighted SOH scoring: 35 % rest voltage + 35 % crank drop + 20 % recovery + 10 % stability',
      'SOC derived exclusively from resting voltage via standard 12 V lookup table',
      'Confidence levels: high / medium / low / insufficient_data; badges: healthy / attention / critical',
      'Extended GET /battery-health/latest to include v2 block; added new GET /battery-health/v2 endpoint',
      'Added Battery (LV) V2 entry to Architecture → Health Calculations page',
      'Added Health Tracking Module documentation page in Master Admin',
    ],
    reason: 'Previous battery health relied on opportunistic snapshots without distinguishing resting voltage from engine-running voltage, making SOC and SOH estimates unreliable. V2 uses physics-based feature extraction to produce trustworthy readings.',
    previousBehavior: 'Battery health was computed from any available voltage snapshot regardless of engine/rest state. No crank analysis was performed. SOH was derived from a single voltage reading with no confidence tracking.',
    details: 'Rest logic hooks into the existing Snapshot Worker by reading VehicleTripDetectionState.state/lastActivityAt — no additional scheduler. Crank extraction uses a dedicated 5 s DIMO time-series query over [tripStart−30 s, tripStart+120 s], triggered fire-and-forget alongside the existing temperature and route fetch calls.',
    affectsArchitecture: true,
    module: 'Vehicle Intelligence',
    createdAt: new Date().toISOString(),
  },
  { id: 'fallback-1-6-0', version: '1.6.0', title: 'Insurance Module Implementation', summary: ['Added full insurance operations module with 10 Prisma models and 8 enums', 'Built insurer partner registry with channel abstraction (Email + API adapters)', 'Created 8-step insurance inquiry workflow with data authorization logging', 'Added Master Admin insurance configuration with 7 tabs', 'Seeded 3 insurance partners: Allianz, HDI, AXA'], reason: 'Organizations need structured insurance operations for fleet vehicles, including inquiry submission to multiple insurers with granular data sharing controls', previousBehavior: "No insurance functionality existed. Insurance was a disabled 'Coming Soon' item in the sidebar.", details: null, affectsArchitecture: true, module: 'Insurance', createdAt: '2025-03-15T10:00:00.000Z' },
  { id: 'fallback-1-5-0', version: '1.5.0', title: 'Parts & Accessories Module', summary: ['Added parts & accessories provider abstraction with ALZURA and eBay adapters', 'Built vehicle fitment context for provider lookups', 'Created data authorization disclosure logging', 'Added Master Admin provider management with health monitoring'], reason: 'Enable organizations to search and procure parts and accessories for fleet vehicles through integrated provider marketplace', previousBehavior: 'No parts/accessories functionality existed.', details: null, affectsArchitecture: true, module: 'Parts & Accessories', createdAt: '2025-02-28T14:30:00.000Z' },
  { id: 'fallback-1-4-0', version: '1.4.0', title: 'Master Admin Refactoring', summary: ['Removed all hardcoded dashboard metrics — MRR, revenue charts, fake activity, fake alerts', 'Wired dashboard to live api.admin.dashboard() endpoint with real org/user/vehicle/MRR data', 'Removed hardcoded right sidebar data, wired to live platform data', 'Made Quick Actions functional (navigate to relevant pages)', 'Wired Activity Log to real api.admin.activityLog() with filters and pagination', 'Platform Alerts now use real api.admin.monitoring.alerts()', "Removed 'Clear All Data' danger button from Settings", 'Removed DIMO settings tab from Platform Settings', 'Restructured sidebar navigation into clear groups', 'Added SynqDrive Code section with Architektur and Changes pages'], reason: 'Master Admin dashboard was full of fake/hardcoded data, giving a misleading impression of platform status. Quick actions were decorative. Navigation was messy.', previousBehavior: 'Dashboard showed hardcoded €38.2k MRR, fake revenue/growth charts, fake activity feed, fake alerts, fake system health percentages. Right sidebar had fake events and pending actions.', details: null, affectsArchitecture: true, module: 'Master Admin', createdAt: '2025-02-12T09:15:00.000Z' },
  { id: 'fallback-1-3-0', version: '1.3.0', title: 'EV Vehicle Support', summary: ['Added EV-specific vehicle detail variant with HV Battery health', 'Implemented SOH calculation based on provided PDF formula', 'Adapted Trips for kWh consumption display', 'Added EV-specific brake and tire wear factors', 'Added HV Battery Capacity field to vehicle registration'], reason: 'Electric vehicles require different health metrics, consumption units, and wear calculations than ICE vehicles', previousBehavior: 'All vehicles used ICE-only health display (Engine Oil instead of HV Battery)', details: null, affectsArchitecture: true, module: 'Vehicle Intelligence', createdAt: '2025-01-22T16:45:00.000Z' },
  { id: 'fallback-1-2-0', version: '1.2.0', title: 'WhatsApp Business Integration', summary: ['Built organization-specific WhatsApp Business connection management', 'Integrated DIMO Agent as AI messaging brain for WhatsApp conversations', 'Added AI permission model (view-only, suggest, auto-reply, escalate)', 'Built real-time message thread UI with AI/human distinction'], reason: 'Enable organizations to handle customer/vendor communication via WhatsApp with AI assistance', previousBehavior: 'WhatsApp Business page was an empty placeholder', details: null, affectsArchitecture: true, module: 'Automation', createdAt: '2025-01-08T11:20:00.000Z' },
];

function normalizeChangelogRow(raw: Record<string, unknown>): ChangelogEntry | null {
  const id = raw.id != null ? String(raw.id) : '';
  const version = raw.version != null ? String(raw.version) : '';
  const title = raw.title != null ? String(raw.title) : '';
  if (!id || !version || !title) return null;
  const summaryRaw = raw.summary;
  const summary = Array.isArray(summaryRaw) ? summaryRaw.map((s) => String(s)) : [];
  const pb = raw.previousBehavior ?? raw.previous_behavior;
  const ca = raw.createdAt ?? raw.created_at;
  return {
    id,
    version,
    title,
    summary,
    reason: raw.reason != null ? String(raw.reason) : null,
    previousBehavior: pb != null ? String(pb) : null,
    details: raw.details != null ? String(raw.details) : null,
    affectsArchitecture: Boolean(raw.affectsArchitecture ?? raw.affects_architecture),
    module: raw.module != null && raw.module !== '' ? String(raw.module) : null,
    createdAt: ca != null ? String(ca) : new Date().toISOString(),
  };
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return String(iso);
  const diffSec = Math.round((Date.now() - t) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const s = Math.sign(diffSec) * -1;
  const a = Math.abs(diffSec);
  if (a < 60) return rtf.format(s * a, 'second');
  const m = Math.round(a / 60);
  if (m < 60) return rtf.format(s * m, 'minute');
  const h = Math.round(m / 60);
  if (h < 48) return rtf.format(s * h, 'hour');
  const d = Math.round(h / 24);
  return d < 14 ? rtf.format(s * d, 'day') : new Date(iso).toLocaleString();
}

function formatAbsoluteTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

type SectionKey = 'reason' | 'previousBehavior' | 'details';

export function ChangesView({ isDarkMode }: ChangesViewProps) {
  const d = isDarkMode;
  const [sourceRows, setSourceRows] = useState<ChangelogEntry[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState('');
  const [architectureOnly, setArchitectureOnly] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, Partial<Record<SectionKey, boolean>>>>({});

  const card = `rounded-xl shadow-sm border ${d ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const field = `px-4 py-3 rounded-xl border text-sm font-bold ${d ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-700'}`;
  const expandBtn = `flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${d ? 'border-neutral-800 bg-neutral-800/40 text-neutral-200 hover:bg-neutral-800/70' : 'border-gray-100 bg-gray-50/80 text-gray-800 hover:bg-gray-100'}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.changelogs();
      const arr = Array.isArray(res) ? res : [];
      const parsed = arr.map((row) => normalizeChangelogRow(row as Record<string, unknown>)).filter((x): x is ChangelogEntry => x != null);
      if (parsed.length === 0) {
        setSourceRows(FALLBACK_ENTRIES);
        setUsingFallback(true);
      } else {
        setSourceRows(parsed);
        setUsingFallback(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load changelogs');
      setSourceRows([]);
      setUsingFallback(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const moduleOptions = useMemo(() => {
    const fromData = new Set<string>();
    sourceRows.forEach((e) => e.module && fromData.add(e.module));
    PRESET_MODULES.forEach((m) => fromData.add(m));
    return ['', ...[...fromData].sort((a, b) => a.localeCompare(b))];
  }, [sourceRows]);

  const filtered = useMemo(() => {
    let list = [...sourceRows];
    if (moduleFilter) list = list.filter((e) => (e.module || '') === moduleFilter);
    if (architectureOnly) list = list.filter((e) => e.affectsArchitecture);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sourceRows, moduleFilter, architectureOnly]);

  const toggleSection = (entryId: string, key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [entryId]: { ...prev[entryId], [key]: !prev[entryId]?.[key] } }));
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/15">
          <FileText className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={`text-2xl font-bold tracking-tight ${d ? 'text-white' : 'text-gray-900'}`}>Changes</h1>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${d ? 'bg-neutral-800 text-neutral-400' : 'bg-gray-100 text-gray-500'}`}>
              <Code2 className="h-3 w-3" />
              SynqDrive Code
            </span>
          </div>
          <p className={`mt-1 text-base font-medium ${d ? 'text-gray-400' : 'text-gray-500'}`}>Internal changelog and change journal</p>
        </div>
      </div>

      <div className={`${card} p-4`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className={`flex min-w-[200px] flex-1 items-center gap-2 rounded-2xl border px-4 py-3 ${d ? 'border-neutral-700/50 bg-neutral-800/50' : 'border-gray-200/50 bg-gray-50/50'}`}>
            <Filter className={`h-5 w-5 shrink-0 ${d ? 'text-gray-500' : 'text-gray-400'}`} />
            <span className={`text-sm font-bold ${d ? 'text-gray-300' : 'text-gray-600'}`}>Module</span>
            <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className={`${field} ml-auto min-w-[160px] flex-1 cursor-pointer appearance-none lg:ml-0 lg:flex-none`} aria-label="Filter by module">
              {moduleOptions.map((m) => (
                <option key={m || 'all'} value={m}>
                  {m === '' ? 'All modules' : m}
                </option>
              ))}
            </select>
          </div>
          <label className={`inline-flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${architectureOnly ? (d ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900') : field}`}>
            <Layers className="h-4 w-4 shrink-0 opacity-80" />
            <span className="select-none">Architecture-affecting only</span>
            <input type="checkbox" className="sr-only" checked={architectureOnly} onChange={() => setArchitectureOnly((v) => !v)} />
            <span className={`relative h-6 w-11 shrink-0 rounded-full ${architectureOnly ? 'bg-amber-500' : d ? 'bg-neutral-700' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${architectureOnly ? 'left-5' : 'left-0.5'}`} />
            </span>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading} className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold disabled:opacity-50 ${d ? 'border-neutral-700/50 bg-neutral-800/50 text-gray-200 hover:bg-neutral-800' : 'border-gray-200/50 bg-gray-50/50 text-gray-800 hover:bg-gray-100'}`}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {usingFallback && !error && (
          <p className={`mt-3 text-xs font-medium ${d ? 'text-neutral-500' : 'text-gray-500'}`}>
            No entries in the database yet — showing embedded changelog highlights until records are added.
          </p>
        )}
      </div>

      {error && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${d ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-800'}`}>{error}</div>
      )}

      {loading ? (
        <div className={`${card} flex flex-col items-center justify-center gap-3 py-20`}>
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <p className={`text-sm font-medium ${d ? 'text-neutral-400' : 'text-gray-500'}`}>Loading changelog…</p>
        </div>
      ) : error ? null : filtered.length === 0 ? (
        <div className={`${card} py-16 text-center`}>
          <p className={`text-sm font-medium ${d ? 'text-neutral-400' : 'text-gray-500'}`}>No entries match the current filters.</p>
        </div>
      ) : (
        <div className="relative space-y-4 pl-2 sm:pl-4">
          <div className={`absolute bottom-2 left-[19px] top-2 w-px sm:left-[23px] ${d ? 'bg-neutral-800' : 'bg-gray-200'}`} aria-hidden />
          {filtered.map((entry, idx) => {
            const o = openSections[entry.id] || {};
            const sections: { key: SectionKey; label: string; text: string | null }[] = [
              { key: 'reason', label: 'Reason', text: entry.reason },
              { key: 'previousBehavior', label: 'Previous behavior', text: entry.previousBehavior },
              { key: 'details', label: 'Details', text: entry.details },
            ];
            const hasExpandable = sections.some((s) => s.text);
            return (
              <div key={entry.id} className="relative flex gap-4">
                <div className={`relative z-[1] mt-1 h-3 w-3 shrink-0 rounded-full ring-4 sm:h-3.5 sm:w-3.5 ${d ? 'bg-indigo-500 ring-neutral-900/80' : 'bg-indigo-500 ring-white/80'}`} title={entry.version} />
                <div className={`min-w-0 flex-1 ${card} p-5`}>
                  <div className="flex flex-wrap items-start gap-2 gap-y-2">
                    <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-bold text-indigo-400 ring-1 ring-indigo-500/25">v{entry.version}</span>
                    {entry.module && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${d ? 'bg-neutral-800 text-neutral-300' : 'bg-gray-100 text-gray-600'}`}>
                        <Tag className="h-3 w-3" />
                        {entry.module}
                      </span>
                    )}
                    {entry.affectsArchitecture && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-400 ring-1 ring-amber-500/25">Affects architecture</span>
                    )}
                    {idx === 0 && !usingFallback && (
                      <span className={`ml-auto text-[10px] font-bold uppercase tracking-wide ${d ? 'text-emerald-400/90' : 'text-emerald-600'}`}>Latest</span>
                    )}
                  </div>
                  <h2 className={`mt-3 text-lg font-bold leading-snug ${d ? 'text-neutral-100' : 'text-gray-900'}`}>{entry.title}</h2>
                  <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium ${d ? 'text-neutral-500' : 'text-gray-500'}`}>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                    <ArrowRight className={`h-3 w-3 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
                    <span>{formatAbsoluteTime(entry.createdAt)}</span>
                  </div>
                  <ul className={`mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed ${d ? 'text-neutral-300' : 'text-gray-700'}`}>
                    {entry.summary.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  {hasExpandable && (
                    <div className={`mt-4 space-y-2 border-t pt-4 ${d ? 'border-neutral-800' : 'border-gray-100'}`}>
                      {sections.map(({ key, label, text }) => {
                        if (!text) return null;
                        const expanded = Boolean(o[key]);
                        return (
                          <div key={key}>
                            <button type="button" onClick={() => toggleSection(entry.id, key)} className={expandBtn}>
                              <span>{label}</span>
                              {expanded ? <ChevronUp className="h-4 w-4 shrink-0 opacity-70" /> : <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />}
                            </button>
                            {expanded && (
                              <p className={`mt-2 whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${d ? 'bg-neutral-950/50 text-neutral-400' : 'bg-white text-gray-600'}`}>{text}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
