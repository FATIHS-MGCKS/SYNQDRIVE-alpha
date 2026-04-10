import {
  Database,
  Radio,
  Cpu,
  Activity,
  MapPin,
  Gauge,
  Droplet,
  Battery,
  Disc,
  Wrench,
  Thermometer,
  Globe,
  Zap,
  Car,
  ChevronRight,
  Layers,
  Network,
  RefreshCw,
  Clock,
  ArrowRight,
  Code2,
  Server,
  Monitor,
  BookOpen,
  Palette,
} from 'lucide-react';
import { useState } from 'react';

interface ArchitekturViewProps {
  isDarkMode: boolean;
}

/* ------------------------------------------------------------------ */
/*  Styling helpers                                                    */
/* ------------------------------------------------------------------ */

const CARD = (_d: boolean) =>
  'rounded-lg border overflow-hidden shadow-sm bg-card border-border';

const BADGE = (color: string) =>
  `inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${color}`;

/* ------------------------------------------------------------------ */
/*  Category definitions                                               */
/* ------------------------------------------------------------------ */

type CategoryId =
  | 'overview'
  | 'signals'
  | 'workers'
  | 'health'
  | 'trips'
  | 'connectivity'
  | 'frontend'
  | 'modules'
  | 'integrations';

interface Category {
  id: CategoryId;
  label: string;
  icon: React.ElementType;
  description: string;
}

const CATEGORIES: Category[] = [
  { id: 'overview', label: 'Overview', icon: Layers, description: 'High-level system architecture' },
  { id: 'signals', label: 'Signals', icon: Radio, description: 'Signal polling, sources & processing' },
  { id: 'workers', label: 'Workers & Jobs', icon: Cpu, description: 'Background workers & scheduling' },
  { id: 'health', label: 'Health Calculations', icon: Activity, description: 'Brake, tire, battery, oil, DTC logic' },
  { id: 'trips', label: 'Trips & Routes', icon: MapPin, description: 'Trip detection & route enrichment' },
  { id: 'connectivity', label: 'Connectivity', icon: Globe, description: 'Online / Standby / Offline logic' },
  { id: 'frontend', label: 'Frontend Data Flow', icon: Monitor, description: 'API routes & rendering pipeline' },
  { id: 'modules', label: 'Modules', icon: Code2, description: 'Rental & Fleet module structure' },
  { id: 'integrations', label: 'Integrations', icon: Network, description: 'DIMO, Mapbox, Stripe & more' },
];

/* ------------------------------------------------------------------ */
/*  Data: Signals                                                      */
/* ------------------------------------------------------------------ */

interface SignalEntry {
  name: string;
  icon: React.ElementType;
  source: string;
  interval: string;
  worker: string;
  storage: string;
  consumers: string[];
}

const SIGNALS: SignalEntry[] = [
  { name: 'Location (lat/lng)', icon: MapPin, source: 'DIMO signalsLatest', interval: '30s snapshot + 5s live-gps proxy', worker: 'SnapshotPollingWorker / live-gps endpoint', storage: 'VehicleLatestState (snapshot) / direct DIMO proxy (live)', consumers: ['Live Map (5s direct)', 'Fleet Map (30s DB)', 'Trips', 'Fleet Connectivity'] },
  { name: 'Odometer', icon: Gauge, source: 'DIMO signalsLatest', interval: '5 min', worker: 'SnapshotPollingWorker', storage: 'VehicleLatestState', consumers: ['Vehicle Detail', 'Trips'] },
  { name: 'Speed', icon: Zap, source: 'DIMO signalsLatest', interval: '5 min', worker: 'SnapshotPollingWorker', storage: 'VehicleLatestState', consumers: ['Trips', 'Driving Analysis'] },
  { name: 'Fuel Level', icon: Droplet, source: 'DIMO signalsLatest', interval: '5 min', worker: 'SnapshotPollingWorker', storage: 'VehicleLatestState', consumers: ['Vehicle Detail', 'Health'] },
  { name: 'Battery SoC (EV)', icon: Battery, source: 'DIMO signalsLatest', interval: '5 min', worker: 'SnapshotPollingWorker', storage: 'VehicleLatestState + HvBatteryHealthSnapshot', consumers: ['HV Battery Health', 'Vehicle Detail'] },
  { name: 'Tire Pressure', icon: Disc, source: 'DIMO signalsLatest + tire pressure history', interval: '5 min', worker: 'SnapshotPollingWorker', storage: 'VehicleLatestState', consumers: ['Tire Health'] },
  { name: 'Engine Oil Life', icon: Droplet, source: 'DIMO signalsLatest', interval: '5 min', worker: 'SnapshotPollingWorker', storage: 'VehicleLatestState', consumers: ['Oil Health'] },
  { name: 'Coolant Temperature', icon: Thermometer, source: 'DIMO signalsLatest', interval: '5 min', worker: 'SnapshotPollingWorker', storage: 'VehicleLatestState', consumers: ['Health Summary'] },
  { name: 'DTC Codes', icon: Wrench, source: 'DIMO OBD DTC', interval: 'polled / webhook', worker: 'DtcPollingJob', storage: 'ActiveDtc', consumers: ['DTC Module', 'Health'] },
  { name: 'Ignition Status', icon: Zap, source: 'DIMO webhook', interval: 'real-time', worker: '— (webhook)', storage: 'VehicleLatestState', consumers: ['Trips', 'Connectivity'] },
];

/* ------------------------------------------------------------------ */
/*  Data: Workers                                                      */
/* ------------------------------------------------------------------ */

interface WorkerEntry {
  name: string;
  icon: React.ElementType;
  trigger: string;
  action: string;
  output: string;
}

const WORKERS: WorkerEntry[] = [
  { name: 'SnapshotPollingWorker', icon: RefreshCw, trigger: 'Every 5 min per vehicle', action: 'Polls DIMO signalsLatest for each vehicle', output: 'Updates VehicleLatestState' },
  { name: 'TripDetectionOrchestrationService', icon: MapPin, trigger: 'Via DimoSnapshotProcessor (V3 live engine)', action: 'State-machine trip detection + CUSUM start/end validation; local, no Vehicle Triggers', output: 'Creates / finalizes VehicleTrip records' },
  { name: 'TripBehaviorEnrichmentWorker', icon: Layers, trigger: 'After trip finalization (BullMQ hf-enrich)', action: 'V3 hardware-aware: SMART5 → full HF pipeline; LTE_R1 → DIMO Telemetry API Events + HF Abuse', output: 'TripBehaviorEvent + DrivingEvent records; VehicleTrip counters updated' },
  { name: 'DrivingImpactWorker', icon: Activity, trigger: 'After HF enrichment completes', action: 'Computes longitudinal/braking/stop-go/high-speed/thermal stress scores', output: 'TripDrivingImpact + VehicleDrivingImpactCurrent' },
  { name: 'DtcPollingJob', icon: Wrench, trigger: 'Periodic / webhook', action: 'Polls DTC codes from DIMO OBD', output: 'Updates ActiveDtc table' },
  { name: 'TireRecalculationScheduler', icon: RefreshCw, trigger: 'Every 1 h', action: 'Enqueues tire recalculation for all active setups not recalculated in the last hour', output: 'Updated tire health via TireRecalculationProcessor' },
  { name: 'BrakeRecalculationScheduler', icon: RefreshCw, trigger: 'Every 1 h', action: 'Recalculates brake health for all initialized vehicles using current odometer + Driving Impact', output: 'Updated BrakeHealthCurrent + BrakeHealthSnapshot' },
  { name: 'TripTrackingRecoveryScheduler', icon: RefreshCw, trigger: 'Every 5 min', action: 'Recovers stuck trip-tracking jobs that have not reported back within timeout', output: 'Re-enqueues stalled trip tracking jobs' },
];

/* ------------------------------------------------------------------ */
/*  Data: Health Calculations                                          */
/* ------------------------------------------------------------------ */

interface HealthCalcEntry {
  name: string;
  icon: React.ElementType;
  inputs: string[];
  algorithm: string;
  output: string;
  color: string;
}

const HEALTH_CALCS: HealthCalcEntry[] = [
  { name: 'Brake Health V2', icon: Disc, inputs: ['Brake service anchor (pad mm, rotor width mm)', 'Driving Impact Engine V1 (brakingStress, stopGoStress, highSpeedStress, thermalStress, hardBrake/100km, fullBraking/100km, stopDensity, highSpeedBrakeShare, usage split)', 'Vehicle master (fuelType, brakeForceFrontPercent)', 'Odometer progression'], algorithm: 'Achsweise (front/rear). Pads: base_wear=usable_mm/70k. Discs: base_wear=2.0mm/90k. Effective rate = base × (bias/default) × usage × stopDensity × hardBrake × fullBraking × reku × k. Reku: ICE=1.0, HEV=0.88/0.94, PHEV=0.82/0.90, EV=0.72/0.86. Set-level: 0.60×min + 0.40×avg. k-factor calibration EMA α∈[0.12..0.24]. Confidence: point-based 0–100. CRITICAL: No estimation without valid brake service anchor.', output: 'Front/rear pad mm + disc mm, health %, remaining km, alerts (pad ≤3/2mm, disc ≤warning/critical, remaining km ≤3000/1000, high brake stress, low confidence). Quick box + detail modal.', color: 'text-red-400' },
  { name: 'Tire Health V2 (Model-Aware Intelligence)', icon: Disc, inputs: ['Anchor tread (install/measurement)', 'AI tire spec (JSON: brand, model, archetype, sensitivities, new tread, thresholds)', 'Tire condition (NEW_INSTALLED / ALREADY_MOUNTED)', 'Driving Impact Engine V1 (usage split, longitudinal/braking/drivingStyle scores)', 'Vehicle master (driveType, curbWeightKg, frontWeightDistPct, fuelType)', 'Trip temperature + speed', 'Live tire pressure (VehicleLatestState per-wheel)', 'k-factor calibration from measurements', 'Staggered setup context', 'Regression data points (TireWearDataPoint with data hygiene)'], algorithm: 'V2 formula: effectiveWear = base × axle × usage × behavior × temperature(heatStress) × pressure × load × seasonMismatch × regen × k × interactionPenalty. Base derived from tire-archetype-aware expected life (13 archetypes × longevityBias × xl/reinforced/ev). Behavior modulated by aggressiveDrivingSensitivity. Heat stress = composite(ambient×0.4 + speed×0.25 + pressure×0.2 + driving×0.15) × heatSensitivity. Pressure factor from per-axle deviation vs nominal, chronic under-inflation, severity, imbalance × underinflationSensitivity. Load from curb weight + drive type + xl/reinforced + payloadBias. Season mismatch: winter-in-heat / summer-in-cold / all-season-highway-heat. Interaction: bounded multi-stressor penalty (max 1.08). Source priority: currentTread(manual>calibration>initial+wear>fallback), refNewTread(manual>aiSpec>archetype>season), replaceThreshold(specOp>specRec>season>legal). 3 threshold levels: operational, recommended, legal. Confidence: multi-dimensional (tireSpec + dataCompleteness + model). Remaining km discounted by confidence. All factors clamped, null-safe, deterministic.', output: 'Per-tire tread mm, health %, remaining km. Set-level health (0.55×min+0.45×avg). Explainability: topWearDrivers, source tracking, causeHints, confidenceBreakdown. Alerts: low/critical tread, pressure impact, season mismatch, used-tire-no-measurement, rotation review.', color: 'text-amber-400' },
  { name: 'Oil Health', icon: Droplet, inputs: ['Oil life signal', 'Mileage since change', 'Engine hours'], algorithm: 'Decay from last change + signal', output: 'Oil life %, next change estimate', color: 'text-yellow-400' },
  { name: 'Battery (HV)', icon: Battery, inputs: ['SoC snapshots (recorded from DIMO evSoc on every polling cycle)', 'Energy throughput between SoC readings', 'Nominal capacity from vehicle master', 'Odometer, range, temperature'], algorithm: 'Three-layer SOH model: (1) Raw SOH from 3-stage cascade (capacity measurement → energy throughput → degradation model fallback). (2) Stabilized SOH via EWMA (α=0.20, damped to 0.05 for outliers >5pp). (3) Published SOH gated by hysteresis (≥2pp delta or threshold crossing). Publication states: INITIAL_CALIBRATION (<5 estimates or <7 days or degradation-model only), STABILIZING (5+ estimates, 7+ days), STABLE (10+ estimates, 14+ days, measured data). Degradation-model-only results capped at INITIAL_CALIBRATION — not presented as mature measured SOH. HvBatteryHealthCurrent row persists publication state per vehicle.', output: 'Published SOH %, publication state (INITIAL_CALIBRATION/STABILIZING/STABLE), method, maturity confidence, estimated capacity kWh, charge sessions, degradation history', color: 'text-emerald-400' },
  { name: 'Battery (LV) V2', icon: Battery, inputs: ['Rest voltage 60 min', 'Rest voltage 6 h', 'Crank drop', '5 s recovery', 'Rest ΔV stability'], algorithm: 'Three-layer SOH model: (1) Raw SOH from weighted composite (0.35×rest + 0.35×crank + 0.20×recovery + 0.10×stability). (2) Stabilized SOH via EWMA (α=0.25, damped to 0.05 for outliers >5pp). (3) Published SOH gated by hysteresis (≥2pp delta or threshold crossing at 50%/70%). Publication states: INITIAL_CALIBRATION (<3 events or <5 days or missing rest/crank), STABILIZING (3+ events, 5+ days, rest+crank present), STABLE (5+ events, 7+ days, 2+ rest, 2+ crank observations). Early values intentionally withheld to prevent unprofessional UI jumps.', output: 'Published SOH %, publication state (INITIAL_CALIBRATION/STABILIZING/STABLE), signal + maturity confidence, badge (healthy/attention/critical only after stabilization)', color: 'text-cyan-400' },
  { name: 'Error Codes (DTC)', icon: Wrench, inputs: ['obdDTCList signal (DIMO)', 'Poll freshness timestamp', 'Active vs cleared state diff', 'Occurrence count'], algorithm: 'Poll every 3 h → diff active codes → clear disappeared → stale if > 6 h since last success', output: 'status (clean/active_faults/stale/unavailable), activeFaultCount, lastSuccessfulCheckAt, history', color: 'text-violet-400' },
  { name: 'Driving Impact Engine V1 (shared layer)', icon: Layers, inputs: ['VehicleTrip: distanceKm, city/highway/country%, hardAccelCount, hardBrakeCount, fullBrakingCount, kickdownCount, brakingEventCount', 'SMART5/UNKNOWN: TripBehaviorEvent (peakDecelMs2, startSpeedKmh, endSpeedKmh, classification)', 'LTE_R1: DrivingEvent (source=TELEMETRY_EVENTS, severity-based peak decel proxy)'], algorithm: 'V3 hardware-aware ingestion: branches on hardwareType. Per-100km normalization + weighted stress scores (longitudinal/braking/stop-go/high-speed/thermal) + distance-weighted 30-day rolling aggregate', output: 'TripDrivingImpact (per trip): 5 stress scores, usage split, per-100km rates, p95 decel, meanBrakeEnergy. VehicleDrivingImpactCurrent (per vehicle): rolling 30-day weighted average of all metrics — consumed by Tire Health V2 and Brake Health V2', color: 'text-orange-400' },
  { name: 'AI Tire Spec Agent', icon: Disc, inputs: ['User-provided: tire brand, model, dimension (size), load index, speed index', 'Vehicle year from master data', 'Available in: Vehicle Registration Modal + Health Errors View'], algorithm: 'V4.2.4: SSE streaming via DIMO Agent from registration form. Stream timeout 300s + 120s inactivity detection. Prompt is knowledge-based (no web search) for fast response. Requests 55+ fields (EU label, UTQG, dimensional, bias/sensitivity, OE markings). Data mapping: legalMinTreadDepthMm→legalMinimumMm, practicalReplacementDepthMm→recommendedReplacementDepthMm for wear model. Result shown in collapsible preview table. On registration: AI tire spec JSON stored alongside typed load/speed index columns.', output: 'AI tire spec JSON on VehicleTireSetup.aiTireSpec. DB columns: load_index_front, speed_index_front, load_index_rear, speed_index_rear, dot_code_front, dot_code_rear. Fields: matchedBrand/Model/Variant, seasonType, EU label classes, UTQG ratings, newTreadDepthMm, practicalReplacementDepthMm, bias/sensitivity values (0-1), confidenceScore (0-1), source URLs. Metadata: userConfirmedSpec, specSourceType, fetchedAt, jobId. Manual tread/calibration never touched. Consumed by Tire Health V2 wear engine for model-aware baseline and factor tuning.', color: 'text-purple-400' },
];

/* ------------------------------------------------------------------ */
/*  Data: Trips                                                        */
/* ------------------------------------------------------------------ */

interface TripFlowEntry {
  name: string;
  icon: React.ElementType;
  source: string;
  process: string;
  storage: string;
}

const TRIP_FLOWS: TripFlowEntry[] = [
  { name: 'Trip Detection (V3 Local State Machine)', icon: Car, source: 'V3 State Machine (DimoSnapshotProcessor → TripDetectionOrchestrationService). No Vehicle Triggers. CUSUM used for start/end boundary validation/refinement.', process: 'Per-vehicle: RESTING → POSSIBLE_START → ACTIVE_TRIP ⇄ IDLE_WITHIN_TRIP → POSSIBLE_END → finalize. EV/HYBRID idle correctly classified. Time-based continuity windows. Ignition-off is bonus evidence only.', storage: 'VehicleTrip records (state, timestamps, detection mode, CUSUM output, confidence)' },
  { name: 'Driving Events — LTE_R1 (DIMO Telemetry API Events)', icon: Zap, source: 'DIMO Telemetry API: safetySystemBrakingHarshBraking, safetySystemBrakingExtremeEmergency, safetySystemAccelerationHarshAcceleration, safetySystemCorneringHarshCornering', process: 'LteR1BehaviorEnrichmentService fetches native harsh-event signals over trip window. Maps to DrivingEvent records (source=TELEMETRY_EVENTS). HF context enrichment: coolant (coldEngineContext badge), RPM, throttle — reduces over-reliance on isolated throttle-only cold-engine heuristics.', storage: 'DrivingEvent rows (vehicleId, tripId, eventType, source=TELEMETRY_EVENTS, metadataJson: {coldEngineContext, coolantC, rpm, throttlePct})' },
  { name: 'Driving Events — SMART5 / UNKNOWN (HF Reconstruction)', icon: Activity, source: 'DIMO HF time-series (1s buckets): speed, ECT, RPM, throttle, engine load', process: 'TripBehaviorEnrichmentService: preprocess → segment split → detectAccelerationEvents / detectBrakingEvents / detectAbuseEvents. Full HF pipeline. Events carry source=HF_DERIVED.', storage: 'TripBehaviorEvent rows (ACCELERATION, BRAKING, ABUSE categories) + DrivingEvent rows where applicable' },
  { name: 'Abuse Detection (HF — Both Hardware Types)', icon: Wrench, source: 'DIMO HF time-series (1s). Runs for ALL vehicles regardless of hardware type.', process: 'detectAbuseEvents(): COLD_ENGINE_HIGH_RPM, COLD_ENGINE_FULL_THROTTLE, ENGINE_SHUTDOWN_WHILE_DRIVING, ENGINE_REV_IN_IDLE, HIGH_RPM_CONSTANT, KICKDOWN (min speed 20 km/h), LAUNCH_LIKE_START, OVERHEATING_ENGINE, LONG_IDLE, FULL_BRAKING (7.5 m/s²+), POSSIBLE_IMPACT (12.0 m/s²+). Transaction-safe persistence.', storage: 'TripBehaviorEvent rows (ABUSE category). VehicleTrip.abuseScore (0–100, deterministic)' },
  { name: 'Route Enrichment + Speeding Sections (V3.4)', icon: MapPin, source: 'Mapbox Matching API v5 (annotations=speed,maxspeed,distance) + DIMO route points (7s buckets)', process: 'Map-match route → per-leg speed limits (Mapbox maxspeed annotations). Overspeed detection: per-point speed vs leg-local limit × 1.05 tolerance. Speeding Section Builder: consecutive overspeed points grouped with hysteresis (≤2 point / ≤10s gaps tolerated). Each section carries: time window, coordinates, distance, duration, maxOver/avgOver, representativeLimit, severity (LOW/MODERATE/HIGH/SEVERE from combined magnitude + duration), Mapbox vs fallback limit source counts. Summary derived from sections: sectionCount, distanceM, durationS, maxOver, avgOver, exposurePercent (distance-based). Legacy point-based speedingPercent preserved for backward compat. Fallback limits (50/100/130 from speed-based inference) used when Mapbox maxspeed unavailable — transparently labeled.', storage: 'VehicleTrip: speedingSectionsJson (JSON array), speedingSectionCount, speedingDistanceM, speedingDurationS, speedingExposurePct, avgOverSpeedKmh, plus legacy speedingPercent/maxOverSpeedKmh/speedingSegments' },
  { name: 'Driving Impact Engine V1', icon: Layers, source: 'VehicleTrip canonical counters (hardBrakingCount, hardAccelerationCount — identical field regardless of LTE_R1 or SMART5 source) + TripBehaviorEvent braking rows', process: 'Per-100km rates, 5 stress scores (longitudinal, braking, stopGo, highSpeed, thermalBrake). 30-day distance-weighted rolling aggregate.', storage: 'TripDrivingImpact (per trip) + VehicleDrivingImpactCurrent (rolling, consumed by Tire Health V2 + Brake Health V2)' },
];

/* ------------------------------------------------------------------ */
/*  Data: Connectivity                                                 */
/* ------------------------------------------------------------------ */

interface ConnectivityState {
  label: string;
  rule: string;
  color: string;
  dotColor: string;
}

const CONNECTIVITY_STATES: ConnectivityState[] = [
  { label: 'Online', rule: 'Last signal < 10 min ago', color: 'bg-emerald-500/15 text-emerald-500', dotColor: 'bg-emerald-500' },
  { label: 'Standby', rule: 'Last signal 10 – 60 min ago', color: 'bg-amber-500/15 text-amber-500', dotColor: 'bg-amber-500' },
  { label: 'Offline', rule: 'Last signal > 60 min or no signal', color: 'bg-red-500/15 text-red-500', dotColor: 'bg-red-500' },
];

/* ------------------------------------------------------------------ */
/*  Data: Frontend Data Flow                                           */
/* ------------------------------------------------------------------ */

interface FrontendFlowEntry {
  name: string;
  icon: React.ElementType;
  endpoint: string;
  service: string;
  dataSource: string;
}

const FRONTEND_FLOWS: FrontendFlowEntry[] = [
  { name: 'Vehicle Detail Page', icon: Car, endpoint: 'GET /api/v1/vehicles/:id', service: 'VehiclesService → Prisma', dataSource: 'Vehicle + relations' },
  { name: 'Live Map', icon: Globe, endpoint: 'GET /api/v1/vehicles/:id/live-gps (5s direct DIMO) + GET /api/v1/vehicles/:id/telemetry (30s dashboard)', service: 'VehiclesService → DIMO proxy (live-gps) + DB snapshot (telemetry)', dataSource: 'Direct DIMO GPS (5s) + VehicleLatestState (30s). Dead reckoning interpolation for 60fps fluid motion.' },
  { name: 'Health Tab', icon: Activity, endpoint: '(derived)', service: 'Latest state + health calc results', dataSource: 'Health scores' },
  { name: 'Trips View', icon: MapPin, endpoint: 'GET /api/v1/vehicle-intelligence/trips', service: 'TripsService', dataSource: 'VehicleTrip records' },
  { name: 'Fleet Condition', icon: Gauge, endpoint: '(aggregated)', service: 'Aggregated health across fleet', dataSource: '% bars per category' },
  { name: 'Vehicle Logbook (V3.5)', icon: BookOpen, endpoint: 'GET /api/v1/admin/vehicle-logbook, GET .../detail', service: 'VehicleLogbookService → assembles from VehicleLatestState, DimoPollLog, VehicleTripDetectionState, VehicleTrip, VehicleDtcEvent, BatteryFeatures, HvBatteryHealthCurrent', dataSource: 'Per-vehicle debug console: overview, signal coverage (18 signals in 5 groups), worker timeline (50 recent poll logs), trip detection state machine, HF enrichment runs, DTC events, UI field mapping (15 fields traced to signal origin), raw payloads. Activation via VehicleLogbookConfig (time-limited per vehicle).' },
  { name: 'Business Insights (V3.6.3)', icon: Zap, endpoint: 'GET /organizations/:orgId/dashboard-insights, GET .../summary, POST /admin/business-insights/run/:orgId', service: 'BusinessInsightsService → 6 detectors → ranking → grouping → formatting → DashboardInsightsRepository. BusinessInsightsTriggerService (Redis debounce). BusinessInsightsScheduler (active-tenant aware). Frontend: BusinessInsightsBox component (live API, 5min refresh, skeleton/empty/error states).', dataSource: 'V3.6.3: Live frontend wiring. BusinessInsightsBox replaces static placeholder in DashboardView. Fetches persisted insights (no recalc). Severity-aware card rows (CRITICAL/WARNING/OPPORTUNITY/INFO). Truncation guards, keyboard accessibility, grouped count badges. Dark/light mode. Design-consistent with surrounding dashboard cards.' },
  { name: 'Service & Maintenance Partners (V3.7)', icon: Wrench, endpoint: 'GET /organizations/:orgId/service-partners, .../assignments, .../data-auth/:partnerId, .../cases, POST .../euromaster/appointment, POST .../euromaster/tire-service, GET .../euromaster/branches, GET .../euromaster/access, POST .../euromaster/cases/:caseId/sync, GET /admin/service-partners, .../stats, GET /admin/service-partners/detail/:provider, POST .../data-authorizations/:orgId/:partnerId/grant, DELETE .../data-authorizations/:orgId/:partnerId, GET .../auth-summary/:partnerId, PATCH .../assignments/:orgId/:partnerId', service: 'ServicePartnersService (partner CRUD, org assignments, data auth grant/revoke, service case lifecycle, admin partner detail with enriched auth/assignment data, authorization enforcement summary). EuromasterIntegrationService (domain-facing orchestrator). EuromasterClient (typed HTTP client). EuromasterAuthService (API key + OAuth2). EuromasterMapperService (payload mapping). AdacService (shell). Auto-seed on module init.', dataSource: 'V3.7–V3.7.4: Generalized partner integration layer + production-grade Euromaster connector + Master Admin management & Data Authorization layer + production readiness audit. Prisma enums: PartnerAssignmentMode (MANUAL_ONLY, PREPARED, ACTIVE, READ_ONLY, FULL_ACCESS), PartnerAssignmentStatus, PartnerDataAuthStatus, ServiceCaseStatus, ServiceCaseType. V3.7.4 Audit: @Roles(ORG_ADMIN, MASTER_ADMIN) on all org-level write endpoints. Fixed mode enum mismatch (LIVE_API→ACTIVE). Fixed React render-time fetch anti-pattern. Fixed empty-scope grant flow. Unified EuromasterStatusBadge mode keys. Consistent MODE_LABELS for all enum values.' },
  { name: 'UI Design System (V4.3)', icon: Palette, endpoint: '(n/a)', service: 'frontend/src/styles/theme.css + Tailwind v4 @theme', dataSource: 'Shared tokens: semantic colors (background/card/muted/border), Inter + Manrope (--font-display), compact 14px base, elevation --shadow-*, glass vars for overlays only. Utilities: .sq-card, .sq-glass, .sq-backdrop, .sq-tab-bar, .sq-press, .font-display. Rule of thumb: solid matte surfaces for tables/forms/admin; restrained blur for map HUDs, popovers, dialogs; Rental and Master share chrome density (sidebar ~220px, main px-4–8, max-w 1400px). Migration complete: all backdrop-blur-xl card usage eliminated; only backdrop-blur-sm/[2px] remains on modal backdrops and map HUD overlays.' },
  { name: 'High Mobility Integration (V4.4 Phase 1 + V4.5 Phase 2 + V4.6 Phase 3)', icon: Radio, endpoint: 'Phase 1: POST .../eligibility/check, GET .../eligibility/:vin, GET/POST/DELETE .../vehicles, POST .../vehicles/:id/refresh-status, POST .../vehicles/:id/fetch-health, POST .../vehicles/:id/link-to-vehicle, GET .../status-history/:vehicleId, POST /integrations/high-mobility/webhook, GET .../register/high-mobility-availability, POST /vehicles/:id/activate-high-mobility-health. Phase 2: POST .../vehicles/:id/create-hm-only-vehicle, GET .../vehicles/:id/streaming-readiness, POST .../vehicles/:id/link-full-telemetry, GET .../stream/consumer-status, POST .../stream/test-connection, GET .../stream/logs, GET .../stream/logs/:id, POST /vehicles/register/hm-only, GET /vehicles/register/hm-only-candidates, POST /vehicles/:id/link-high-mobility-full-telemetry. Phase 3: GET /vehicles/:id/high-mobility-status, POST /vehicles/:id/high-mobility/check-eligibility, POST /vehicles/:id/high-mobility/activate-health, POST /vehicles/:id/high-mobility/refresh-status, POST /vehicles/:id/high-mobility/deactivate, GET /vehicles/:id/hm-vehicle-health, POST /vehicles/:id/hm-vehicle-health/refresh-service, POST /vehicles/:id/hm-vehicle-health/refresh-tire-pressure, POST /vehicles/:id/hm-vehicle-health/refresh-ai-health-care, GET /vehicles/:id/health/ai-health-care', service: 'Phase 1: HighMobilityAuthService (OAuth2 token cache), HighMobilityEligibilityService (VIN eligibility), HighMobilityFleetService (fleet clearance lifecycle), HighMobilityVehicleLinkService (VIN-safe link + Phase 2 Full Telemetry link), HighMobilityHealthFetchService (11 Phase 1 signals), HighMobilityWebhookService (clearance events + HMAC verify). Phase 2: HighMobilityRegistrationService (HM_ONLY vehicle creation without hardware), HighMobilityStreamConfigService (MQTT V2 config readiness + cert validation server-side), HighMobilityMqttConsumerService (mTLS MQTT, reconnect, at-least-once, isolated from business logic), HighMobilityTelemetryIngestionService (dedupe by message_id, normalize, persist to stream_sync_log), HighMobilityTelemetryRoutingService (adapter point scaffolding for Phase 3 product activation). Phase 3: HmVehicleActivationService (retroactive HM activation facade for existing vehicles), HmSignalUsageService (signal group cache mediator — reads/writes hm_signal_group_states, enforces display-only domain rule), HmHealthPollingScheduler (@Interval — SERVICE 3x/day, TIRE_PRESSURE/AI_HEALTH_CARE 6x/day), AiHealthCareAggregationService (rule-based health summary + 4 HM display indicators). Config: high-mobility.config.ts (sandbox/live + MQTT block). DB Phase 1: high_mobility_vehicles, high_mobility_status_history, high_mobility_health_sync_logs, vehicle_data_source_links. DB Phase 2: high_mobility_stream_sync_logs, high_mobility_stream_consumer_states; extended high_mobility_vehicles. DB Phase 3: hm_signal_group_states (vehicleId, hmVehicleId, signalGroup, lastFetchedAt, lastSuccessAt, dataJson); enum HmSignalGroup: SERVICE | TIRE_PRESSURE | AI_HEALTH_CARE.', dataSource: 'DOMAIN RULES (all phases): HEALTH signals = informational OEM display-grade only — NEVER injected into authoritative health calculations. Phase 3 consumer rules: Service Info Box prefers HM distance_to_next_service + time_to_next_service if HM Health active (fallback to manufacturer interval). Tire Pressure = display-only quick view + 4-wheel detail modal. AI Health Care = additive HM indicators (Oil Level fill bar, Limp Mode icon, Brake Lining Pre-Warning icon, Tire Pressure Warning icon); base assessment unchanged. Error Codes text = German locale (Keine Fehlercodes erkannt / X Fehlercode(s) erkannt / Daten veraltet). FULL_TELEMETRY = structurally ingested via MQTT V2; routing adapter points not yet wired to scoring/trips. HM_ONLY = first-class vehicle mode. DIMO-driven operational flows completely unchanged. Frontend (Phase 3 additions): PlatformVehiclesView vehicle detail drawer HM section (state badge + action buttons), HealthErrorsView Service Info HM badge + freshness, Tires quick HM pressure indicator, Tires modal 4-wheel pressure section, AI Health Care 4 HM indicator rows.' },
];

/* ------------------------------------------------------------------ */
/*  Data: Modules                                                      */
/* ------------------------------------------------------------------ */

interface ModuleSection {
  name: string;
  sections: string[];
  status: 'active' | 'coming-soon';
}

const MODULES: ModuleSection[] = [
  { name: 'Rental Module', sections: ['Dashboard', 'Bookings', 'Fleet', 'Customers', 'Trips', 'Health', 'Documents', 'Driving Analysis', 'Live Map', 'Fleet Condition', 'Parts & Accessories', 'AI Upload'], status: 'active' },
  { name: 'Fleet Module', sections: ['Dashboard', 'Fleet Management', 'Drivers', 'Trips', 'Health', 'Maintenance', 'Telematics'], status: 'coming-soon' },
];

/* ------------------------------------------------------------------ */
/*  Data: Integrations                                                 */
/* ------------------------------------------------------------------ */

interface IntegrationEntry {
  name: string;
  icon: React.ElementType;
  color: string;
  apis: { label: string; detail: string }[];
}

const INTEGRATIONS: IntegrationEntry[] = [
  {
    name: 'DIMO',
    icon: Radio,
    color: 'text-cyan-400',
    apis: [
      { label: 'Telemetry GraphQL', detail: 'signalsLatest, signals history, segments' },
      { label: 'REST API', detail: 'Vehicles, device status' },
      { label: 'Webhooks', detail: 'DTC codes, ignition events' },
    ],
  },
  {
    name: 'Mapbox',
    icon: Globe,
    color: 'text-blue-400',
    apis: [
      { label: 'Directions API', detail: 'Route reconstruction, road types' },
      { label: 'Geocoding API', detail: 'Address lookup / reverse geocode' },
      { label: 'Map GL', detail: 'Frontend map rendering' },
    ],
  },
  {
    name: 'Stripe',
    icon: Zap,
    color: 'text-violet-400',
    apis: [
      { label: 'Billing', detail: 'Subscriptions & invoices' },
      { label: 'Payments', detail: 'Payment processing' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Reusable sub-components                                            */
/* ------------------------------------------------------------------ */

function FlowArrow({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <ArrowRight
      size={14}
      className={`shrink-0 ${isDarkMode ? 'text-neutral-600' : 'text-gray-300'}`}
    />
  );
}

function SourceBadge({ label }: { label: string }) {
  return <span className={BADGE('bg-cyan-500/15 text-cyan-500')}>{label}</span>;
}

function StorageBadge({ label }: { label: string }) {
  return <span className={BADGE('bg-violet-500/15 text-violet-500')}><Database size={10} />{label}</span>;
}

function ConsumerBadge({ label }: { label: string }) {
  return <span className={BADGE('bg-emerald-500/15 text-emerald-500')}>{label}</span>;
}

function WorkerBadge({ label }: { label: string }) {
  return <span className={BADGE('bg-amber-500/15 text-amber-500')}><Cpu size={10} />{label}</span>;
}

/* ------------------------------------------------------------------ */
/*  Section renderers                                                  */
/* ------------------------------------------------------------------ */

function OverviewSection({ d }: { d: boolean }) {
  const layers: { label: string; icon: React.ElementType; items: string[]; color: string }[] = [
    { label: 'External Sources', icon: Globe, items: ['DIMO Telemetry', 'DIMO Webhooks', 'Mapbox', 'Stripe'], color: 'border-cyan-500/40' },
    { label: 'Ingestion Layer', icon: Server, items: ['SnapshotPollingWorker', 'TripDetectionWorker', 'DtcPollingJob', 'Webhook Handlers'], color: 'border-amber-500/40' },
    { label: 'Storage Layer', icon: Database, items: ['VehicleLatestState', 'VehicleTrip', 'ActiveDtc', 'HealthScores', 'Prisma / PostgreSQL'], color: 'border-violet-500/40' },
    { label: 'Business Logic', icon: Cpu, items: ['HealthCalculationWorker', 'EnrichmentJobProcessor', 'Connectivity Logic', 'AI Analysis'], color: 'border-emerald-500/40' },
    { label: 'API Layer', icon: Code2, items: ['/api/v1/vehicles', '/api/v1/dimo/*', '/api/v1/vehicle-intelligence/*', '/api/v1/health/*'], color: 'border-blue-500/40' },
    { label: 'Frontend', icon: Monitor, items: ['Next.js App Router', 'Vehicle Detail', 'Live Map', 'Health Dashboard', 'Trips View'], color: 'border-pink-500/40' },
  ];

  return (
    <div className="space-y-4">
      <p className={`text-sm leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-500'}`}>
        SynqDrive is a multi-tenant SaaS platform for fleet, rental, telematics, vehicle health, maintenance, AI-assisted analysis, and operations management. Data flows from external telemetry providers through ingestion workers into a normalised storage layer, is processed by business-logic workers, and served to the frontend through versioned API routes.
      </p>
      <div className="grid gap-3">
        {layers.map((layer, idx) => {
          const Icon = layer.icon;
          return (
            <div key={layer.label} className={`${CARD(d)} p-4 border-l-2 ${layer.color}`}>
              <div className="flex items-center gap-2 mb-2">
                {idx > 0 && (
                  <span className={`text-[10px] font-bold uppercase tracking-widest mr-2 ${d ? 'text-neutral-600' : 'text-gray-300'}`}>↓</span>
                )}
                <Icon size={16} className={d ? 'text-neutral-400' : 'text-gray-500'} />
                <span className={`text-sm font-semibold ${d ? 'text-neutral-200' : 'text-gray-800'}`}>{layer.label}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {layer.items.map((item) => (
                  <span key={item} className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${d ? 'bg-neutral-800 text-neutral-300' : 'bg-gray-100 text-gray-600'}`}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignalsSection({ d }: { d: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 mb-2">
        <span className={BADGE('bg-cyan-500/15 text-cyan-500')}>Source</span>
        <span className={BADGE('bg-amber-500/15 text-amber-500')}><Cpu size={10} />Worker</span>
        <span className={BADGE('bg-violet-500/15 text-violet-500')}><Database size={10} />Storage</span>
        <span className={BADGE('bg-emerald-500/15 text-emerald-500')}>Consumer</span>
      </div>
      {SIGNALS.map((sig) => {
        const Icon = sig.icon;
        return (
          <div key={sig.name} className={`${CARD(d)} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Icon size={16} className={d ? 'text-neutral-300' : 'text-gray-700'} />
              <span className={`text-sm font-semibold ${d ? 'text-neutral-200' : 'text-gray-800'}`}>{sig.name}</span>
              <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${d ? 'bg-neutral-800 text-neutral-400' : 'bg-gray-100 text-gray-500'}`}>
                <Clock size={10} className="inline mr-1 -mt-px" />{sig.interval}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <SourceBadge label={sig.source} />
              <FlowArrow isDarkMode={d} />
              <WorkerBadge label={sig.worker} />
              <FlowArrow isDarkMode={d} />
              <StorageBadge label={sig.storage} />
              <FlowArrow isDarkMode={d} />
              {sig.consumers.map((c, i) => (
                <span key={c} className="contents">
                  {i > 0 && <span className={`text-[10px] ${d ? 'text-neutral-600' : 'text-gray-300'}`}>/</span>}
                  <ConsumerBadge label={c} />
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WorkersSection({ d }: { d: boolean }) {
  return (
    <div className="space-y-3">
      {WORKERS.map((w) => {
        const Icon = w.icon;
        return (
          <div key={w.name} className={`${CARD(d)} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/15">
                <Icon size={16} className="text-amber-500" />
              </div>
              <div>
                <span className={`text-sm font-semibold block ${d ? 'text-neutral-200' : 'text-gray-800'}`}>{w.name}</span>
                <span className={`text-[11px] ${d ? 'text-neutral-500' : 'text-gray-400'}`}>{w.trigger}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={BADGE('bg-blue-500/15 text-blue-400')}>{w.action}</span>
              <FlowArrow isDarkMode={d} />
              <span className={BADGE('bg-emerald-500/15 text-emerald-500')}>{w.output}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HealthSection({ d }: { d: boolean }) {
  return (
    <div className="space-y-3">
      {HEALTH_CALCS.map((h) => {
        const Icon = h.icon;
        return (
          <div key={h.name} className={`${CARD(d)} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-neutral-800/60`}>
                <Icon size={16} className={h.color} />
              </div>
              <span className={`text-sm font-semibold ${d ? 'text-neutral-200' : 'text-gray-800'}`}>{h.name}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${d ? 'text-neutral-500' : 'text-gray-400'}`}>Inputs</span>
                <div className="flex flex-wrap gap-1">
                  {h.inputs.map((inp) => (
                    <span key={inp} className={`text-[11px] px-2 py-0.5 rounded-md ${d ? 'bg-neutral-800 text-neutral-300' : 'bg-gray-100 text-gray-600'}`}>{inp}</span>
                  ))}
                </div>
              </div>
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${d ? 'text-neutral-500' : 'text-gray-400'}`}>Algorithm</span>
                <span className={`text-[11px] font-mono leading-snug ${d ? 'text-neutral-300' : 'text-gray-600'}`}>{h.algorithm}</span>
              </div>
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${d ? 'text-neutral-500' : 'text-gray-400'}`}>Output</span>
                <span className={BADGE('bg-emerald-500/15 text-emerald-500')}>{h.output}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TripsSection({ d }: { d: boolean }) {
  const h3 = `text-sm font-semibold mb-2 ${d ? 'text-neutral-200' : 'text-gray-800'}`;
  const body = `text-xs leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-600'}`;
  const code = `px-1 py-0.5 rounded text-[11px] font-mono ${d ? 'bg-neutral-800 text-violet-400' : 'bg-gray-100 text-violet-600'}`;
  const row = `flex items-center gap-1.5 flex-wrap mb-1`;

  return (
    <div className="space-y-3">
      {/* Signal Groups */}
      <div className={`${CARD(d)} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Radio size={15} className="text-violet-500" />
          <span className={`text-sm font-bold ${d ? 'text-neutral-100' : 'text-gray-900'}`}>V3 Signal Groups</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'TripDetectionCore', interval: '20-second buckets', color: 'text-violet-400', signals: ['isIgnitionOn → MAX', 'speed → AVG', 'powertrainTransmissionTravelledDistance → MAX', 'powertrainFuelSystemAbsoluteLevel → AVG', 'powertrainTractionBatteryStateOfChargeCurrentEnergy → AVG'], purpose: 'Primary source for trip start / end detection' },
            { name: 'RouteEnrichment', interval: '7-second buckets', color: 'text-blue-400', signals: ['currentLocationCoordinates → RAND', 'speed → AVG'], purpose: 'GPS route, geocoding, live waypoints' },
            { name: 'Performance', interval: '15-second buckets', color: 'text-orange-400', signals: ['powertrainCombustionEngineECT → AVG', 'powertrainCombustionEngineSpeed → AVG', 'obdThrottlePosition → AVG', 'obdEngineLoad → AVG'], purpose: 'Engine activity confirmation for IDLE/END verdict' },
          ].map(g => (
            <div key={g.name} className={`rounded-lg p-3 ${d ? 'bg-neutral-800/60' : 'bg-gray-50'}`}>
              <p className={`text-xs font-bold mb-1 ${g.color}`}>{g.name}</p>
              <p className={`text-[11px] mb-2 ${d ? 'text-neutral-500' : 'text-gray-400'}`}>{g.interval}</p>
              <ul className={`space-y-0.5 text-[11px] mb-2 ${d ? 'text-neutral-400' : 'text-gray-500'}`}>
                {g.signals.map(s => <li key={s} className="truncate">• {s}</li>)}
              </ul>
              <p className={`text-[11px] italic ${d ? 'text-neutral-500' : 'text-gray-400'}`}>{g.purpose}</p>
            </div>
          ))}
        </div>
      </div>

      {/* State Machine */}
      <div className={`${CARD(d)} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Cpu size={15} className="text-emerald-500" />
          <span className={`text-sm font-bold ${d ? 'text-neutral-100' : 'text-gray-900'}`}>V3 State Machine</span>
        </div>
        <div className={row}>
          {[
            { label: 'RESTING', color: 'bg-neutral-500/20 text-neutral-400' },
            { label: '→', color: '' },
            { label: 'POSSIBLE_START', color: 'bg-yellow-500/20 text-yellow-400' },
            { label: '→', color: '' },
            { label: 'ACTIVE_TRIP', color: 'bg-emerald-500/20 text-emerald-400' },
            { label: '⇄', color: '' },
            { label: 'IDLE_WITHIN_TRIP', color: 'bg-blue-500/20 text-blue-400' },
          ].map((s, i) => s.color ? (
            <span key={i} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
          ) : (
            <span key={i} className={`text-xs ${d ? 'text-neutral-500' : 'text-gray-400'}`}>{s.label}</span>
          ))}
        </div>
        <div className={`${row} mt-1`}>
          <span className={`text-xs ${d ? 'text-neutral-500' : 'text-gray-400'}`}>↓ inactivity evidence</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">POSSIBLE_END</span>
          <span className={`text-xs ${d ? 'text-neutral-500' : 'text-gray-400'}`}>→ stability window → CUSUM validation → finalize →</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-500/20 text-neutral-400">RESTING</span>
        </div>
      </div>

      {/* Trip End — V3 Hardened Logic */}
      <div className={`${CARD(d)} p-4`}>
        <div className="flex items-center gap-2 mb-1">
          <Zap size={15} className="text-orange-400" />
          <span className={`text-sm font-bold ${d ? 'text-neutral-100' : 'text-gray-900'}`}>Trip End — V3 Hardened Logic (CUSUM)</span>
          <span className={BADGE('bg-orange-500/15 text-orange-400')}>v3.0</span>
        </div>
        <p className={`${body} mb-3`}>
          <strong className="text-orange-400">v2.2 fix:</strong> Stale ignition-ON no longer blocks Trip End.
          <strong className="text-cyan-400"> v2.3 additions:</strong> EV/HYBRID stops are now correctly classified
          as IDLE when signal frequency is still active (not just ICE engines). Continuity evaluation is
          time-based (last 120s) instead of fixed last-5-points. evaluateFrequency() uses profile thresholds
          (resting = 0.5 pt/min, not the old hardcoded 1.0 pt/min). hasActivityResumed() requires real speed,
          not stale ignition-ON alone.
        </p>
        <div className="space-y-2">
          {[
            { label: 'PRIMARY evidence (no ignition required)', color: 'text-emerald-400', items: ['No speed / no movement in recent 120s core window', 'No odometer progress across window', 'Signal frequency drop to resting level (< 0.5 pt/min per profile)', 'Signal silence (0 points in time window)', 'Stale ignition-ON + no perf + no energy change (stale-ignition guard)'] },
            { label: 'EV/HYBRID IDLE path (v2.3 new)', color: 'text-cyan-400', items: ['Stopped + signal frequency still active (≥ 2 pt/min) → IDLE (not POSSIBLE_END)', 'Stopped + light energy activity (regen, warm-down) → IDLE', 'ICE perf signals (RPM/throttle/load) not required for EV/HYBRID'] },
            { label: 'SECONDARY / bonus evidence', color: 'text-blue-400', items: ['Ignition-off confirmed (HIGH confidence bonus, still not required)', 'Energy / fuel activity ceased', 'Performance signals all inactive'] },
          ].map(g => (
            <div key={g.label}>
              <p className={`text-[11px] font-semibold mb-1 ${g.color}`}>{g.label}</p>
              <ul className={`space-y-0.5 ${body}`}>
                {g.items.map(i => <li key={i}>• {i}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className={`mt-3 rounded-lg p-3 ${d ? 'bg-orange-900/20 border border-orange-800/30' : 'bg-orange-50 border border-orange-200/50'}`}>
          <p className={`text-[11px] font-semibold mb-1 ${d ? 'text-orange-300' : 'text-orange-700'}`}>End Detection Mode Priority</p>
          <div className="flex flex-wrap gap-1.5">
            {['CUSUM_VALIDATED', 'FREQUENCY_DROP_TIMEOUT', 'NO_ACTIVITY_TIMEOUT', 'COMPOSITE_INACTIVITY', 'IGNITION_OFF_CONFIRMED'].map((m, i) => (
              <span key={m} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${i === 0 ? 'bg-emerald-500/20 text-emerald-400' : i === 4 ? 'bg-neutral-500/20 text-neutral-400' : 'bg-orange-500/15 text-orange-400'}`}>
                {i + 1}. {m}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* CUSUM End Validation Flow */}
      <div className={`${CARD(d)} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} className="text-cyan-400" />
          <span className={`text-sm font-bold ${d ? 'text-neutral-100' : 'text-gray-900'}`}>CUSUM End Validation Flow</span>
          <span className={BADGE('bg-cyan-500/15 text-cyan-400')}>Targeted only</span>
        </div>
        <div className="space-y-1.5">
          {[
            { step: '1', label: 'POSSIBLE_END entered', desc: 'Local inactivity evidence triggers POSSIBLE_END. possibleEndAt and endValidationAttempts=0 recorded.' },
            { step: '2', label: 'Stability window (3 min default)', desc: 'Wait for TRIP_END_STABILITY_WINDOW_MS. If activity resumes → cancel POSSIBLE_END, return to ACTIVE_TRIP.' },
            { step: '3', label: 'CUSUM trigger (END_VALIDATION job)', desc: 'Fetch bounded TripDetectionCore window [possibleEndAt − 15min … +5min]. Apply CUSUM change-point detection over speed time-series.' },
            { step: '4a', label: 'Change-point detected → finalize', desc: 'Trip end time set from CUSUM change-point (most accurate). endDetectionMode = CUSUM_VALIDATED.' },
            { step: '4b', label: 'Still ongoing → back to ACTIVE_TRIP', desc: 'CUSUM shows activity still present → cancel end, resume ACTIVE_TICK loop.' },
            { step: '4c', label: 'Inconclusive → retry', desc: 'Reschedule POSSIBLE_END_CHECK after TRIP_END_VALIDATION_RETRY_MS. Up to TRIP_END_VALIDATION_MAX_ATTEMPTS (default 3).' },
            { step: '5', label: 'Timeout fallback (30 min default)', desc: 'If all attempts exhausted without CUSUM confirmation, TRIP_END_TIMEOUT_MS forces finalization. End time uses lastMeaningfulMovementAt priority.' },
          ].map(s => (
            <div key={s.step} className="flex gap-3">
              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${d ? 'bg-neutral-700 text-cyan-400' : 'bg-cyan-50 text-cyan-600'}`}>{s.step}</span>
              <div>
                <p className={`text-xs font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{s.label}</p>
                <p className={`text-[11px] ${d ? 'text-neutral-500' : 'text-gray-400'}`}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* End Time Selection + Finalization */}
      <div className={`${CARD(d)} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-amber-400" />
          <span className={`text-sm font-bold ${d ? 'text-neutral-100' : 'text-gray-900'}`}>End Time Selection & Finalization</span>
        </div>
        <div className="space-y-2 mb-3">
          <p className={`${body} font-semibold ${d ? 'text-amber-300' : 'text-amber-700'}`}>End timestamp priority (most → least reliable):</p>
          {['1. CUSUM cusumSegmentEnd — validated change-point (most accurate)', '2. lastMeaningfulMovementAt — last confirmed movement observed', '3. lastWaypoint.recordedAt — last GPS fix', '4. possibleEndAt — first inactivity candidate', '5. now() — absolute fallback'].map((p, i) => (
            <div key={i} className={`text-[11px] px-2 py-1 rounded ${i === 0 ? (d ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700') : (d ? 'text-neutral-400' : 'text-gray-500')}`}>{p}</div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: 'Cancellation', items: ['Duration < 60s AND distance < 0.1 km', 'Distance < 0.1 km AND maxConsecutiveActive < 2'] },
            { label: 'Merge with previous trip', items: ['Gap to previous COMPLETED trip < 5 min', 'Reopens previous trip record (ONGOING)'] },
            { label: 'Success → HF Enrichment', items: ['Trip status set to COMPLETED', 'BullMQ job: hf-enrich queued (5s delay)', 'High-frequency 1s segments fetched'] },
            { label: 'Post-HF → Driving Impact', items: ['TripBehaviorEvent records created', 'VehicleDrivingImpactCurrent updated', 'Tire + Brake health modules consume output'] },
          ].map(g => (
            <div key={g.label} className={`rounded-lg p-3 ${d ? 'bg-neutral-800/60' : 'bg-gray-50'}`}>
              <p className={`text-xs font-semibold mb-1.5 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>{g.label}</p>
              <ul className={`space-y-0.5 text-[11px] ${d ? 'text-neutral-500' : 'text-gray-500'}`}>
                {g.items.map(i => <li key={i}>• {i}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Legacy V1 isolation notice */}
      <div className={`${CARD(d)} p-4 border-l-4 ${d ? 'border-amber-700/60' : 'border-amber-300'}`}>
        <p className={`text-xs font-bold mb-1 ${d ? 'text-amber-300' : 'text-amber-700'}`}>⚠ LEGACY V1 PATH — DEPRECATED (v2.3)</p>
        <p className={`text-[11px] leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-600'}`}>
          <code className="font-mono">POST /vehicles/:id/trips/sync</code> calls the V1 ignition-based trip detection path
          (<code className="font-mono">DimoSegmentsService.fetchAndDetectTrips → detectTrips</code>).
          This is <strong>NOT</strong> the live V3 engine. It is retained only for historical back-fill or admin debugging.
          The live trip engine runs entirely through <code className="font-mono">DimoSnapshotProcessor → TripDetectionOrchestrationService</code>.
          Similarly, <code className="font-mono">POST /trips/:id/enrich</code> is route-based enrichment (road type, speeding sections V3.4)
          — complementary, not the canonical behavior pipeline. Speeding analysis now uses the V3.4 Speeding Sections architecture
          (overspeed points → section builder → severity → summary). The canonical post-trip behavior path is
          <code className="font-mono">POST /trips/:id/behavior-enrich</code> (HF enrichment → Driving Impact Engine).
        </p>
      </div>

      {/* Legacy flow cards */}
      {TRIP_FLOWS.filter(t => t.name !== 'Trip Detection').map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.name} className={`${CARD(d)} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Icon size={16} className={d ? 'text-neutral-300' : 'text-gray-700'} />
              <span className={`text-sm font-semibold ${d ? 'text-neutral-200' : 'text-gray-800'}`}>{t.name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <SourceBadge label={t.source} />
              <FlowArrow isDarkMode={d} />
              <span className={BADGE('bg-amber-500/15 text-amber-500')}>{t.process}</span>
              <FlowArrow isDarkMode={d} />
              <StorageBadge label={t.storage} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConnectivitySection({ d }: { d: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CONNECTIVITY_STATES.map((s) => (
          <div key={s.label} className={`${CARD(d)} p-5 text-center`}>
            <div className={`w-4 h-4 rounded-full mx-auto mb-3 ${s.dotColor} shadow-[0_0_10px] shadow-current`} />
            <span className={`text-base font-bold block mb-1 ${d ? 'text-neutral-100' : 'text-gray-800'}`}>{s.label}</span>
            <span className={`text-xs ${d ? 'text-neutral-400' : 'text-gray-500'}`}>{s.rule}</span>
          </div>
        ))}
      </div>
      <div className={`${CARD(d)} p-4`}>
        <div className="flex items-center gap-2 mb-2">
          <RefreshCw size={14} className={d ? 'text-neutral-400' : 'text-gray-500'} />
          <span className={`text-sm font-semibold ${d ? 'text-neutral-200' : 'text-gray-800'}`}>Freshness Calculation</span>
        </div>
        <p className={`text-xs leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-500'}`}>
          Computed from <code className={`px-1 py-0.5 rounded text-[11px] ${d ? 'bg-neutral-800 text-violet-400' : 'bg-gray-100 text-violet-600'}`}>VehicleLatestState.updatedAt</code> vs current time. The delta determines which state badge is shown in the UI. Values are refreshed every time the <code className={`px-1 py-0.5 rounded text-[11px] ${d ? 'bg-neutral-800 text-violet-400' : 'bg-gray-100 text-violet-600'}`}>SnapshotPollingWorker</code> runs.
        </p>
      </div>
    </div>
  );
}

function FrontendFlowSection({ d }: { d: boolean }) {
  return (
    <div className="space-y-3">
      {FRONTEND_FLOWS.map((f) => {
        const Icon = f.icon;
        return (
          <div key={f.name} className={`${CARD(d)} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Icon size={16} className={d ? 'text-neutral-300' : 'text-gray-700'} />
              <span className={`text-sm font-semibold ${d ? 'text-neutral-200' : 'text-gray-800'}`}>{f.name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${d ? 'bg-neutral-800 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>{f.endpoint}</span>
              <FlowArrow isDarkMode={d} />
              <span className={BADGE('bg-amber-500/15 text-amber-500')}>{f.service}</span>
              <FlowArrow isDarkMode={d} />
              <StorageBadge label={f.dataSource} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModulesSection({ d }: { d: boolean }) {
  return (
    <div className="space-y-4">
      {MODULES.map((m) => (
        <div key={m.name} className={`${CARD(d)} p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={16} className={m.status === 'active' ? 'text-emerald-500' : (d ? 'text-neutral-500' : 'text-gray-400')} />
            <span className={`text-sm font-semibold ${d ? 'text-neutral-200' : 'text-gray-800'}`}>{m.name}</span>
            <span className={BADGE(m.status === 'active' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-neutral-500/15 text-neutral-400')}>
              {m.status === 'active' ? 'Active' : 'Coming Soon'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {m.sections.map((sec) => (
              <span key={sec} className={`text-[11px] px-2.5 py-1 rounded-lg font-medium ${
                m.status === 'active'
                  ? (d ? 'bg-neutral-800 text-neutral-300' : 'bg-gray-100 text-gray-700')
                  : (d ? 'bg-neutral-800/50 text-neutral-500' : 'bg-gray-50 text-gray-400')
              }`}>
                {sec}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function IntegrationsSection({ d }: { d: boolean }) {
  return (
    <div className="space-y-4">
      {INTEGRATIONS.map((intg) => {
        const Icon = intg.icon;
        return (
          <div key={intg.name} className={`${CARD(d)} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-neutral-800/60">
                <Icon size={16} className={intg.color} />
              </div>
              <span className={`text-sm font-bold ${d ? 'text-neutral-200' : 'text-gray-800'}`}>{intg.name}</span>
            </div>
            <div className="space-y-2">
              {intg.apis.map((a) => (
                <div key={a.label} className={`flex items-start gap-2 text-xs ${d ? 'text-neutral-400' : 'text-gray-500'}`}>
                  <ChevronRight size={12} className="mt-0.5 shrink-0" />
                  <div>
                    <span className={`font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{a.label}</span>
                    <span className="mx-1">—</span>
                    <span>{a.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

export function ArchitekturView({ isDarkMode }: ArchitekturViewProps) {
  const [active, setActive] = useState<CategoryId>('overview');
  const d = isDarkMode;

  const activeCat = CATEGORIES.find((c) => c.id === active)!;

  const renderContent = () => {
    switch (active) {
      case 'overview': return <OverviewSection d={d} />;
      case 'signals': return <SignalsSection d={d} />;
      case 'workers': return <WorkersSection d={d} />;
      case 'health': return <HealthSection d={d} />;
      case 'trips': return <TripsSection d={d} />;
      case 'connectivity': return <ConnectivitySection d={d} />;
      case 'frontend': return <FrontendFlowSection d={d} />;
      case 'modules': return <ModulesSection d={d} />;
      case 'integrations': return <IntegrationsSection d={d} />;
    }
  };

  return (
    <div className="flex h-full gap-6">
      {/* ---- Left sidebar navigation ---- */}
      <nav className={`w-56 shrink-0 ${CARD(d)} p-2 self-start sticky top-4`}>
        <div className="px-3 pt-2 pb-3">
          <span className={`text-xs font-bold uppercase tracking-widest ${d ? 'text-neutral-500' : 'text-gray-400'}`}>Architecture</span>
        </div>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = cat.id === active;
          return (
            <button
              key={cat.id}
              onClick={() => setActive(cat.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm transition-all ${
                isActive
                  ? (d ? 'bg-neutral-800 text-white' : 'bg-gray-100 text-gray-900')
                  : (d ? 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700')
              }`}
            >
              <Icon size={15} className={isActive ? (d ? 'text-cyan-400' : 'text-blue-600') : ''} />
              <span className="font-medium truncate">{cat.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ---- Main content ---- */}
      <div className="flex-1 min-w-0">
        <div className="mb-5">
          <h2 className={`text-xl font-bold ${d ? 'text-neutral-100' : 'text-gray-900'}`}>{activeCat.label}</h2>
          <p className={`text-sm mt-0.5 ${d ? 'text-neutral-500' : 'text-gray-400'}`}>{activeCat.description}</p>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
