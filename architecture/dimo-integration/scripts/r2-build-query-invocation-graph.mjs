#!/usr/bin/env node
/**
 * Static query invocation graph for DIMO Integration R2.
 * Usage: node architecture/dimo-integration/scripts/r2-build-query-invocation-graph.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const GRAPH_DIR = path.join(ROOT, 'architecture/dimo-integration/graph');
const EVIDENCE_DIR = path.join(ROOT, 'architecture/dimo-integration/evidence');
const auditHead = fs.readFileSync(path.join(ROOT, '.git/HEAD'), 'utf8').includes('ref:')
  ? (() => {
      const ref = fs.readFileSync(path.join(ROOT, '.git/HEAD'), 'utf8').trim().split(' ')[1];
      return fs.readFileSync(path.join(ROOT, '.git', ref), 'utf8').trim();
    })()
  : '';

/** Curated from code trace @ R2 — each row is one runtime invocation surface. */
const INVOCATIONS = [
  {
    implementationId: 'IMPL-Q001-SNAPSHOT',
    queryId: 'DIMO-Q001',
    registryName: 'LatestVehicleSnapshot',
    sourceFile: 'backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts',
    sourceSymbol: 'buildLatestSnapshotQuery',
    graphqlRoot: 'signalsLatest',
    authentication: 'vehicleJwt',
    privileges: '[1,2,3,4,5,6] default',
    endpoint: 'dimo.telemetryApiUrl POST GraphQL',
    entrypoints: ['DimoSnapshotScheduler → dimo.snapshot.poll → DimoSnapshotProcessor.process'],
    directCallers: ['DimoTelemetryService.fetchLatestVehicleSnapshot'],
    indirectCallers: ['TripDetectionOrchestrationService (post-snapshot)', 'BatteryV2SnapshotObservationProducer'],
    triggerConditions: 'Tier-eligible CONNECTED vehicle; registry operational active',
    schedulerOrWebhook: 'scheduler 30s tick + R9 wake coalesce',
    queueAndProcessor: 'QUEUE_NAMES.DIMO_SNAPSHOT / DimoSnapshotProcessor',
    rateBudgetCategory: 'LIVE_SNAPSHOT / HIGH',
    pollingOrExecutionFrequency: 'tier: 30s–30min; scheduler tick 30s',
    aggregationInterval: 'signalsLatest (point-in-time)',
    responseNormalizer: 'VLS mappers, tire pressure, battery mapper, trip start eval',
    persistenceTarget: 'VehicleLatestState; optional ClickHouse telemetry_snapshots',
    downstreamConsumers: ['Fleet map', 'Vehicle detail', 'Trip FSM', 'Battery V2 snapshot obs', 'Connectivity episodes'],
    errorSemantics: 'BullMQ retry; job failure blocks jobId until removed next tick',
    featureFlags: ['WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED', 'WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE'],
    runtimeReachability: 'ACTIVE',
    productionVerification: 'INFERRED from deployed processor @ 2b89f746…',
    evidence: ['backend/src/workers/processors/dimo-snapshot.processor.ts:327', 'backend/src/modules/dimo/dimo-telemetry.service.ts:87-99'],
  },
  {
    implementationId: 'IMPL-Q002-LASTSEEN',
    queryId: 'DIMO-Q002',
    registryName: 'LastSeenLocation',
    sourceFile: 'backend/src/modules/dimo/queries/last-seen-location.query.ts',
    sourceSymbol: 'buildLastSeenLocationQuery',
    graphqlRoot: 'signalsLatest',
    authentication: 'vehicleJwt',
    privileges: 'default',
    endpoint: 'telemetry GraphQL',
    entrypoints: ['VehiclesService on-demand'],
    directCallers: ['DimoTelemetryService.fetchLastSeenLocation'],
    indirectCallers: ['Fleet map fallback'],
    runtimeReachability: 'ACTIVE',
    rateBudgetCategory: 'on-demand via gateway',
    productionVerification: 'CONFIRMED_FROM_CODE',
    evidence: ['backend/src/modules/vehicles/vehicles.service.ts'],
  },
  {
    implementationId: 'IMPL-Q003-VEHICLE-SUMMARY-INLINE',
    queryId: 'DIMO-Q003',
    registryName: 'VehicleSummary',
    sourceFile: 'backend/src/modules/dimo/dimo-telemetry.service.ts',
    sourceSymbol: 'fetchVehicleSummary (inline GraphQL)',
    graphqlRoot: 'signalsLatest',
    authentication: 'vehicleJwt',
    entrypoints: ['DimoController', 'DimoApiSyncService'],
    directCallers: ['DimoTelemetryService.fetchVehicleSummary'],
    runtimeReachability: 'ACTIVE',
    rateBudgetCategory: 'IDENTITY',
    evidence: ['dimo-telemetry.service.ts:326-387'],
  },
  {
    implementationId: 'IMPL-Q004-VIN-INLINE',
    queryId: 'DIMO-Q004',
    registryName: 'VehicleVin',
    sourceFile: 'backend/src/modules/dimo/dimo-telemetry.service.ts',
    sourceSymbol: 'fetchVehicleVin',
    graphqlRoot: 'vinVCLatest',
    authentication: 'vehicleJwt',
    entrypoints: ['Vehicle sync / onboarding paths'],
    runtimeReachability: 'ACTIVE',
    errorSemantics: 'returns null on failure (swallowed)',
    evidence: ['dimo-telemetry.service.ts:389-421'],
  },
  {
    implementationId: 'IMPL-Q005-DTC',
    queryId: 'DIMO-Q005',
    registryName: 'GetLatestDTCs',
    sourceFile: 'backend/src/modules/dimo/queries/latest-dtc.query.ts',
    sourceSymbol: 'buildLatestDtcQuery',
    graphqlRoot: 'signalsLatest',
    entrypoints: ['dimo-dtc.processor scheduled poll', 'webhook obdDTCList'],
    queueAndProcessor: 'DTC poll queue',
    runtimeReachability: 'ACTIVE',
    evidence: ['backend/src/workers/processors/dimo-dtc.processor.ts'],
  },
  {
    implementationId: 'IMPL-Q006-TRIP-CORE',
    queryId: 'DIMO-Q006',
    registryName: 'TripDetectionCore',
    sourceFile: 'backend/src/modules/dimo/queries/trip-detection-core.query.ts',
    sourceSymbol: 'buildTripDetectionCoreQuery',
    graphqlRoot: 'signals',
    entrypoints: ['TripDetectionOrchestrationService active trip ticks'],
    directCallers: ['DimoSegmentsService.fetchRawTripCoreData'],
    runtimeReachability: 'ACTIVE',
    aggregationInterval: 'windowed buckets (trip phase)',
    errorSemantics: 'returns [] on failure',
    evidence: ['dimo-segments.service.ts:566-621'],
  },
  {
    implementationId: 'IMPL-Q007-ROUTE',
    queryId: 'DIMO-Q007',
    registryName: 'RouteEnrichment',
    sourceSymbol: 'buildRouteEnrichmentQuery',
    graphqlRoot: 'signals',
    directCallers: ['DimoSegmentsService.fetchRouteEnrichmentData'],
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts'],
  },
  {
    implementationId: 'IMPL-Q008-PERF',
    queryId: 'DIMO-Q008',
    registryName: 'Performance',
    sourceSymbol: 'buildPerformanceQuery',
    graphqlRoot: 'signals',
    directCallers: ['DimoSegmentsService.fetchPerformanceData'],
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts:850+'],
  },
  {
    implementationId: 'IMPL-Q009-HF',
    queryId: 'DIMO-Q009',
    registryName: 'HighFrequency',
    sourceSymbol: 'buildHighFrequencyQuery',
    graphqlRoot: 'signals',
    directCallers: ['DimoSegmentsService.fetchHighFrequencyData'],
    indirectCallers: ['Driving Intelligence', 'Reference capture', 'Energy calibration scripts'],
    aggregationInterval: '1s requested buckets',
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts:964+'],
  },
  {
    implementationId: 'IMPL-Q010-ENV-TEMP',
    queryId: 'DIMO-Q010',
    registryName: 'EnvironmentTemperature',
    sourceSymbol: 'buildEnvironmentTemperatureQuery',
    graphqlRoot: 'signals',
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts'],
  },
  {
    implementationId: 'IMPL-Q011-TIRE-HISTORY',
    queryId: 'DIMO-Q011',
    registryName: 'TirePressureHistory',
    sourceSymbol: 'buildTirePressureHistoryQuery',
    graphqlRoot: 'signals',
    directCallers: ['DimoSegmentsService.fetchTirePressureHistory'],
    runtimeReachability: 'DORMANT',
    productionVerification: 'NO_CALLERS outside dimo-segments.service.ts',
    evidence: ['grep fetchTirePressureHistory → definition only'],
  },
  {
    implementationId: 'IMPL-Q012-CRANK',
    queryId: 'DIMO-Q012',
    registryName: 'BatteryCrankWindow',
    sourceSymbol: 'buildBatteryCrankQuery',
    graphqlRoot: 'signals',
    directCallers: ['DimoSegmentsService.fetchBatteryCrankWindow'],
    indirectCallers: ['Battery V2'],
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts'],
  },
  {
    implementationId: 'IMPL-Q013-FUEL-SEGMENTS',
    queryId: 'DIMO-Q013',
    registryName: 'TripFuelSummary',
    sourceSymbol: 'inline / trip-segments builders',
    graphqlRoot: 'segments|signals',
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts trip fuel paths'],
  },
  {
    implementationId: 'IMPL-Q015-EVENTS',
    queryId: 'DIMO-Q015',
    registryName: 'DrivingEvents',
    sourceSymbol: 'buildDrivingEventsQuery',
    graphqlRoot: 'events',
    directCallers: ['DimoSegmentsService.fetchDrivingEvents*'],
    errorSemantics: 'DIM-GAP-007 empty array on failure',
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts', 'queries/driving-events.query.ts'],
  },
  {
    implementationId: 'IMPL-Q017-EVENT-SUMMARY',
    queryId: 'DIMO-Q017',
    registryName: 'EventDataSummary',
    sourceSymbol: 'buildEventDataSummaryQuery',
    graphqlRoot: 'dataSummary',
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts'],
  },
  {
    implementationId: 'IMPL-Q018-DATA-SUMMARY',
    queryId: 'DIMO-Q018',
    registryName: 'DataSummary',
    sourceSymbol: 'buildDataSummaryQuery',
    graphqlRoot: 'dataSummary',
    directCallers: ['dimo-available-signals-preflight', 'reference-capture-preflight'],
    runtimeReachability: 'ACTIVE',
    rateBudgetCategory: 'diagnostic / preflight',
    evidence: ['queries/data-summary.query.ts'],
  },
  {
    implementationId: 'IMPL-Q019-AVAILABLE',
    queryId: 'DIMO-Q019',
    registryName: 'AvailableSignals',
    sourceSymbol: 'buildAvailableSignalsQuery',
    graphqlRoot: 'availableSignals',
    runtimeReachability: 'ACTIVE',
    evidence: ['queries/available-signals.query.ts'],
  },
  {
    implementationId: 'IMPL-Q020-BATTERY-PREFLIGHT',
    queryId: 'DIMO-Q020',
    registryName: 'BatteryCapabilityPreflight',
    sourceSymbol: 'buildBatteryCapabilityPreflightQuery',
    graphqlRoot: 'availableSignals+signalsLatest+segments',
    directCallers: ['DimoTelemetryService.fetchBatteryCapabilityPreflightSnapshot', 'battery-capability-preflight.service'],
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-telemetry.service.ts:120-159'],
  },
  {
    implementationId: 'IMPL-Q021-RECHARGE-PROBE',
    queryId: 'DIMO-Q021',
    registryName: 'RechargeSegmentsProbe',
    sourceSymbol: 'buildRechargeSegmentsProbeQuery',
    graphqlRoot: 'segments',
    directCallers: ['DimoTelemetryService.probeRechargeSegments'],
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-telemetry.service.ts:162-196'],
  },
  {
    implementationId: 'IMPL-Q022-TRIP-SEGMENTS',
    queryId: 'DIMO-Q022',
    registryName: 'TripSegments',
    sourceSymbol: 'buildTripSegmentsQuery',
    graphqlRoot: 'segments',
    directCallers: ['DimoSegmentsService.fetchTripSegments*'],
    indirectCallers: ['Trip detection', 'Reconciliation'],
    runtimeReachability: 'ACTIVE',
    evidence: ['dimo-segments.service.ts:624+'],
  },
  {
    implementationId: 'IMPL-Q023-REFUEL-SEG',
    queryId: 'DIMO-Q023',
    registryName: 'EnergyEventSegments refuel',
    sourceSymbol: 'buildEnergyEventSegmentsQuery',
    graphqlRoot: 'segments',
    indirectCallers: ['Energy Events / KG-EED'],
    runtimeReachability: 'ACTIVE',
    evidence: ['queries/energy-event-segments.query.ts'],
  },
  {
    implementationId: 'IMPL-Q025-RECHARGE-SEG',
    queryId: 'DIMO-Q025',
    registryName: 'DimoRechargeSegments',
    sourceSymbol: 'DimoRechargeSegmentsClient',
    graphqlRoot: 'segments(mechanism:recharge)',
    runtimeReachability: 'ACTIVE',
    evidence: ['recharge-segments/'],
  },
  {
    implementationId: 'IMPL-ADMIN-GRAPHQL',
    queryId: 'N/A',
    registryName: 'Admin arbitrary GraphQL',
    sourceSymbol: 'DimoController.queryGraphQL',
    graphqlRoot: 'user-supplied',
    runtimeReachability: 'OPS_ONLY',
    authentication: 'vehicleJwt',
    evidence: ['dimo.controller.ts:363'],
  },
  {
    implementationId: 'IMPL-DI-S4-DORMANT',
    queryId: 'DIMO-Q009 context',
    registryName: 'DI S4C queryGraphQL',
    sourceSymbol: 'di-v0-s4c-dimo-ports',
    runtimeReachability: 'FLAG_GATED',
    productionVerification: 'Dormant module — no live caller per DI specs',
    evidence: ['driving-intelligence/s4-runtime dormant specs'],
  },
  {
    implementationId: 'IMPL-REF-CAPTURE',
    queryId: 'DIMO-Q026/Q027',
    registryName: 'Reference capture HF',
    sourceSymbol: 'queryGraphQLWithIngressTiming',
    runtimeReachability: 'FLAG_GATED',
    featureFlags: ['reference capture feature flags'],
    evidence: ['reference-capture-acquisition.service.ts'],
  },
];

const nodes = INVOCATIONS.map((row) => ({
  id: row.implementationId,
  type: 'query_invocation',
  ...row,
  auditHeadSha: auditHead,
  epistemic_status: row.runtimeReachability === 'DORMANT' ? 'CONFIRMED' : 'CONFIRMED_FROM_CODE',
}));

const edges = [];
for (const row of INVOCATIONS) {
  for (const ep of row.entrypoints ?? []) {
    edges.push({ from: `entry:${ep.split('→')[0].trim()}`, to: row.implementationId, kind: 'triggers' });
  }
  for (const c of row.directCallers ?? []) {
    edges.push({ from: c, to: row.implementationId, kind: 'direct_call' });
  }
  for (const c of row.indirectCallers ?? []) {
    edges.push({ from: c, to: row.implementationId, kind: 'indirect_call' });
  }
}

fs.mkdirSync(GRAPH_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(path.join(GRAPH_DIR, 'query-invocation-nodes.json'), JSON.stringify({ generatedAt: new Date().toISOString(), auditHeadSha: auditHead, nodes }, null, 2));
fs.writeFileSync(path.join(GRAPH_DIR, 'query-invocation-edges.json'), JSON.stringify({ generatedAt: new Date().toISOString(), auditHeadSha: auditHead, edges }, null, 2));

const roots = new Set(nodes.map((n) => n.graphqlRoot).filter(Boolean));
const unresolved = [];
for (const builder of fs.readdirSync(path.join(ROOT, 'backend/src/modules/dimo/queries')).filter((f) => f.endsWith('.query.ts'))) {
  const impl = nodes.find((n) => n.sourceFile?.includes(builder));
  if (!impl) unresolved.push({ file: builder, reason: 'no_invocation_row' });
}

console.log(JSON.stringify({
  nodes: nodes.length,
  edges: edges.length,
  graphqlRoots: [...roots],
  unresolvedBuilders: unresolved,
}, null, 2));
