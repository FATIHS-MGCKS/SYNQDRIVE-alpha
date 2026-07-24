import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';
import { POLICY_RESOLVER_SOURCE_SYSTEM } from '../policy-resolver/policy-resolver.constants';
import { TELEMETRY_INGEST_PATH } from '../telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.constants';
import { TRIP_LOCATION_PATH } from '../trip-location-enforcement/trip-location-enforcement.constants';
import { VEHICLE_HEALTH_PATH } from '../vehicle-health-enforcement/vehicle-health-enforcement.constants';
import { DRIVING_BEHAVIOR_PATH } from '../driving-behavior-enforcement/driving-behavior-enforcement.constants';
import { LIVE_GPS_SERVICE_IDENTITY } from '../live-gps-enforcement/live-gps-enforcement.constants';
import { EXTERNAL_ACCESS_PATH } from '../external-access-enforcement/external-access-enforcement.constants';
import { NOTIFICATION_ENFORCEMENT_PATH } from '../notification-enforcement/notification-enforcement.constants';
import {
  ENFORCEMENT_COVERAGE_DOMAIN,
  ENFORCEMENT_POINT,
} from './enforcement-coverage-registry.constants';
import type { EnforcementFlowCatalogEntry } from './enforcement-coverage.types';

const STANDARD_GATE_POINTS = [
  ENFORCEMENT_POINT.POLICY_DECISION_GATE,
  ENFORCEMENT_POINT.TENANT_SCOPE_VALIDATION,
  ENFORCEMENT_POINT.AUDIT_ON_DENY,
  ENFORCEMENT_POINT.METRICS_EMIT,
  ENFORCEMENT_POINT.UNIT_TEST_COVERAGE,
] as const;

const FULLY_WIRED = [...STANDARD_GATE_POINTS] as const;

function flow(
  entry: Omit<EnforcementFlowCatalogEntry, 'requiredEnforcementPoints'> & {
    requiredEnforcementPoints?: readonly (typeof ENFORCEMENT_POINT)[keyof typeof ENFORCEMENT_POINT][];
  },
): EnforcementFlowCatalogEntry {
  return {
    requiredEnforcementPoints: entry.requiredEnforcementPoints ?? STANDARD_GATE_POINTS,
    ...entry,
  };
}

/**
 * Central enforcement coverage catalog — source of truth for Prompt 23.
 * Baseline CSV: docs/audits/data/data-authorization-enforcement-coverage-baseline-2026-07.csv
 */
export const ENFORCEMENT_COVERAGE_CATALOG: readonly EnforcementFlowCatalogEntry[] = [
  // --- Live GPS (Prompt 16) ---
  flow({
    flowId: 'live-gps-fleet-map-read',
    flowName: 'Fleet map live GPS read',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['GPS_LOCATION'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'LiveGpsEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.LIVE_GPS,
    processingPath: 'fleet-map-read',
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/live-gps-enforcement/live-gps-enforcement.service.spec.ts',
    productive: true,
  }),
  flow({
    flowId: 'live-gps-trips-route-read',
    flowName: 'Trip route GPS read',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['GPS_LOCATION'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'LiveGpsEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.LIVE_GPS,
    processingPath: TRIP_LOCATION_PATH.TRIP_ROUTE_READ,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/live-gps-enforcement/live-gps-enforcement.service.spec.ts',
    productive: true,
  }),
  flow({
    flowId: 'live-gps-vehicle-telemetry-read',
    flowName: 'Vehicle telemetry GPS read',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['GPS_LOCATION'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'LiveGpsEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.LIVE_GPS,
    processingPath: LIVE_GPS_SERVICE_IDENTITY.VEHICLES_TELEMETRY_API,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/live-gps-enforcement/live-gps-enforcement.service.spec.ts',
    productive: true,
  }),

  // --- Telemetry ingest (Prompt 17) ---
  flow({
    flowId: 'telemetry-dimo-snapshot-ingest',
    flowName: 'DIMO snapshot telemetry ingest',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['TELEMETRY_DATA', 'GPS_LOCATION'],
    actions: [AUTHORIZATION_DECISION_ACTION.INGEST],
    responsibleService: 'TelemetryIngestionEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.TELEMETRY_INGEST,
    processingPath: TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_INGEST_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'telemetry-dimo-dtc-webhook-ingest',
    flowName: 'DIMO DTC webhook ingest',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['DTC_CODES'],
    actions: [AUTHORIZATION_DECISION_ACTION.INGEST],
    responsibleService: 'TelemetryIngestionEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.TELEMETRY_INGEST,
    processingPath: TELEMETRY_INGEST_PATH.DIMO_DTC_WEBHOOK,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_INGEST_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'telemetry-hm-mqtt-ingest',
    flowName: 'High Mobility MQTT telemetry ingest',
    sourceSystem: 'HIGH_MOBILITY',
    dataCategories: ['TELEMETRY_DATA'],
    actions: [AUTHORIZATION_DECISION_ACTION.INGEST],
    responsibleService: 'TelemetryIngestionEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.TELEMETRY_INGEST,
    processingPath: TELEMETRY_INGEST_PATH.HM_TELEMETRY_MQTT,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_INGEST_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'telemetry-trip-backfill-ingest',
    flowName: 'Trip backfill telemetry ingest',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['TRIP_DATA', 'GPS_LOCATION'],
    actions: [AUTHORIZATION_DECISION_ACTION.INGEST],
    responsibleService: 'TelemetryIngestionEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.TELEMETRY_INGEST,
    processingPath: TELEMETRY_INGEST_PATH.TRIP_BACKFILL,
    implementedEnforcementPoints: [
      ENFORCEMENT_POINT.POLICY_DECISION_GATE,
      ENFORCEMENT_POINT.UNIT_TEST_COVERAGE,
    ],
    testSpecPath:
      'backend/src/modules/data-authorizations/telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_INGEST_SHADOW_MODE',
    productive: true,
  }),

  // --- Trip location (Prompt 18) ---
  flow({
    flowId: 'trip-create-ingest',
    flowName: 'Trip create ingest',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['TRIP_DATA', 'GPS_LOCATION'],
    actions: [AUTHORIZATION_DECISION_ACTION.INGEST],
    responsibleService: 'TripLocationEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.TRIP_LOCATION,
    processingPath: TRIP_LOCATION_PATH.TRIP_CREATE,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/trip-location-enforcement/trip-location-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_TRIP_LOCATION_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'trip-route-read',
    flowName: 'Trip route read',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['GPS_LOCATION', 'TRIP_DATA'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'TripLocationEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.TRIP_LOCATION,
    processingPath: TRIP_LOCATION_PATH.TRIP_ROUTE_READ,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/trip-location-enforcement/trip-location-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_TRIP_LOCATION_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'trip-enrich-derive',
    flowName: 'Trip enrichment derive',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['TRIP_DATA', 'DRIVING_BEHAVIOR'],
    actions: [AUTHORIZATION_DECISION_ACTION.DERIVE],
    responsibleService: 'TripLocationEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.TRIP_LOCATION,
    processingPath: TRIP_LOCATION_PATH.TRIP_ENRICH,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/trip-location-enforcement/trip-location-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_TRIP_LOCATION_SHADOW_MODE',
    productive: true,
  }),

  // --- Vehicle health (Prompt 19) ---
  flow({
    flowId: 'health-dtc-ingest',
    flowName: 'DTC code ingest',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['DTC_CODES'],
    actions: [AUTHORIZATION_DECISION_ACTION.INGEST],
    responsibleService: 'VehicleHealthEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.VEHICLE_HEALTH,
    processingPath: VEHICLE_HEALTH_PATH.DTC_INGEST,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_HEALTH_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'health-dtc-read',
    flowName: 'DTC summary read',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['DTC_CODES'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'VehicleHealthEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.VEHICLE_HEALTH,
    processingPath: VEHICLE_HEALTH_PATH.DTC_READ,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_HEALTH_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'health-ai-use',
    flowName: 'AI health care summary',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['HEALTH_SIGNALS'],
    actions: [AUTHORIZATION_DECISION_ACTION.USE_FOR_AI],
    responsibleService: 'VehicleHealthEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.VEHICLE_HEALTH,
    processingPath: VEHICLE_HEALTH_PATH.HEALTH_AI,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_HEALTH_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'health-export',
    flowName: 'Vehicle health file export',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['HEALTH_SIGNALS', 'DTC_CODES'],
    actions: [AUTHORIZATION_DECISION_ACTION.EXPORT],
    responsibleService: 'VehicleHealthEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.VEHICLE_HEALTH,
    processingPath: VEHICLE_HEALTH_PATH.HEALTH_EXPORT,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_HEALTH_SHADOW_MODE',
    productive: true,
  }),

  // --- Driving behavior (Prompt 20) ---
  flow({
    flowId: 'behavior-enrich-derive',
    flowName: 'Driving behavior enrichment derive',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['DRIVING_BEHAVIOR'],
    actions: [AUTHORIZATION_DECISION_ACTION.DERIVE],
    responsibleService: 'DrivingBehaviorEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.DRIVING_BEHAVIOR,
    processingPath: DRIVING_BEHAVIOR_PATH.BEHAVIOR_EVENT_DERIVE,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'misuse-reconcile-profile',
    flowName: 'Misuse reconcile profiling',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['DRIVING_BEHAVIOR'],
    actions: [AUTHORIZATION_DECISION_ACTION.PROFILE],
    responsibleService: 'DrivingBehaviorEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.DRIVING_BEHAVIOR,
    processingPath: DRIVING_BEHAVIOR_PATH.MISUSE_AGGREGATE,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'driver-score-read',
    flowName: 'Driver score read',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['DRIVING_BEHAVIOR'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'DrivingBehaviorEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.DRIVING_BEHAVIOR,
    processingPath: DRIVING_BEHAVIOR_PATH.DRIVER_SCORE_READ,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE',
    productive: true,
  }),

  // --- Notifications (Prompt 21) ---
  flow({
    flowId: 'notification-ingest',
    flowName: 'Notification ingest gate',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['HEALTH_SIGNALS', 'DRIVING_BEHAVIOR', 'GPS_LOCATION'],
    actions: [AUTHORIZATION_DECISION_ACTION.NOTIFY],
    responsibleService: 'NotificationEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.NOTIFICATION,
    processingPath: NOTIFICATION_ENFORCEMENT_PATH.NOTIFICATION_INGEST,
    implementedEnforcementPoints: [
      ...STANDARD_GATE_POINTS,
      ENFORCEMENT_POINT.DATA_MINIMIZATION,
    ],
    testSpecPath:
      'backend/src/modules/data-authorizations/notification-enforcement/notification-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_NOTIFICATION_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'notification-delivery',
    flowName: 'Notification delivery gate',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['HEALTH_SIGNALS', 'DRIVING_BEHAVIOR'],
    actions: [AUTHORIZATION_DECISION_ACTION.NOTIFY],
    responsibleService: 'NotificationEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.NOTIFICATION,
    processingPath: NOTIFICATION_ENFORCEMENT_PATH.NOTIFICATION_DELIVERY,
    implementedEnforcementPoints: [
      ...STANDARD_GATE_POINTS,
      ENFORCEMENT_POINT.DATA_MINIMIZATION,
    ],
    testSpecPath:
      'backend/src/modules/data-authorizations/notification-enforcement/notification-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_NOTIFICATION_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'notification-deep-link',
    flowName: 'Notification deep link gate',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['HEALTH_SIGNALS', 'DRIVING_BEHAVIOR'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'NotificationEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.NOTIFICATION,
    processingPath: NOTIFICATION_ENFORCEMENT_PATH.NOTIFICATION_DEEP_LINK,
    implementedEnforcementPoints: [
      ...STANDARD_GATE_POINTS,
      ENFORCEMENT_POINT.DATA_MINIMIZATION,
    ],
    testSpecPath:
      'backend/src/modules/data-authorizations/notification-enforcement/notification-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_NOTIFICATION_SHADOW_MODE',
    productive: true,
  }),

  // --- External access (Prompt 22) ---
  flow({
    flowId: 'external-fleet-chat-ai',
    flowName: 'Fleet chat AI inference',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['TELEMETRY_DATA', 'HEALTH_SIGNALS'],
    actions: [AUTHORIZATION_DECISION_ACTION.USE_FOR_AI],
    responsibleService: 'ExternalAccessEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.EXTERNAL_ACCESS,
    processingPath: EXTERNAL_ACCESS_PATH.FLEET_CHAT_AI,
    implementedEnforcementPoints: [
      ...STANDARD_GATE_POINTS,
      ENFORCEMENT_POINT.DATA_MINIMIZATION,
    ],
    testSpecPath:
      'backend/src/modules/data-authorizations/external-access-enforcement/external-access-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'external-document-download',
    flowName: 'Generated document PDF export',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['CUSTOMER_DATA'],
    actions: [AUTHORIZATION_DECISION_ACTION.EXPORT],
    responsibleService: 'ExternalAccessEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.EXTERNAL_ACCESS,
    processingPath: EXTERNAL_ACCESS_PATH.FILE_DOWNLOAD,
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/external-access-enforcement/external-access-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'external-voice-mcp-tool',
    flowName: 'Voice MCP tool read',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['CUSTOMER_DATA', 'GPS_LOCATION'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'ExternalAccessEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.EXTERNAL_ACCESS,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    implementedEnforcementPoints: [
      ...STANDARD_GATE_POINTS,
      ENFORCEMENT_POINT.DATA_MINIMIZATION,
    ],
    testSpecPath:
      'backend/src/modules/data-authorizations/external-access-enforcement/external-access-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE',
    productive: true,
  }),
  flow({
    flowId: 'external-reporting-export',
    flowName: 'Reporting export egress',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['TELEMETRY_DATA'],
    actions: [AUTHORIZATION_DECISION_ACTION.EXPORT],
    responsibleService: 'ExternalAccessEnforcementService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.EXTERNAL_ACCESS,
    processingPath: EXTERNAL_ACCESS_PATH.REPORTING_EXPORT,
    implementedEnforcementPoints: [
      ENFORCEMENT_POINT.POLICY_DECISION_GATE,
      ENFORCEMENT_POINT.UNIT_TEST_COVERAGE,
    ],
    testSpecPath:
      'backend/src/modules/data-authorizations/external-access-enforcement/external-access-enforcement.service.spec.ts',
    shadowModeEnv: 'DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE',
    productive: true,
  }),

  // --- Authorization decision spine (Prompt 13) ---
  flow({
    flowId: 'authorization-decision-engine',
    flowName: 'Authorization decision engine',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['TELEMETRY_DATA'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ],
    responsibleService: 'AuthorizationDecisionService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.AUTHORIZATION_DECISION,
    processingPath: 'authorization-decision',
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/authorization-decision-engine/authorization-decision.engine.spec.ts',
    productive: true,
  }),

  // --- Revocation Orchestrator (Prompt 24) ---
  flow({
    flowId: 'revocation-deny-switch',
    flowName: 'Revocation synchronous deny switch',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['GPS_LOCATION', 'TELEMETRY_RAW'],
    actions: [AUTHORIZATION_DECISION_ACTION.READ, AUTHORIZATION_DECISION_ACTION.INGEST],
    responsibleService: 'RevocationOrchestratorService',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.REVOCATION,
    processingPath: 'data-auth/revocation/deny-switch',
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/revocation-orchestrator/revocation-orchestrator.service.spec.ts',
    productive: true,
  }),
  flow({
    flowId: 'revocation-provider-revoke',
    flowName: 'Revocation provider access revoke',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['TELEMETRY_RAW'],
    actions: [AUTHORIZATION_DECISION_ACTION.INGEST],
    responsibleService: 'RevocationOrchestratorSteps',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.REVOCATION,
    processingPath: 'data-auth/revocation/provider-revoke',
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/revocation-orchestrator/revocation-orchestrator.service.spec.ts',
    productive: true,
  }),
  flow({
    flowId: 'revocation-partner-notify',
    flowName: 'Revocation partner downstream notification',
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategories: ['CUSTOMER_DATA'],
    actions: [AUTHORIZATION_DECISION_ACTION.SHARE],
    responsibleService: 'RevocationOrchestratorSteps',
    responsibleOwner: 'data-authorizations',
    domain: ENFORCEMENT_COVERAGE_DOMAIN.REVOCATION,
    processingPath: 'data-auth/revocation/partner-notify',
    implementedEnforcementPoints: FULLY_WIRED,
    testSpecPath:
      'backend/src/modules/data-authorizations/revocation-orchestrator/revocation-orchestrator.service.spec.ts',
    productive: true,
  }),
];

export const ENFORCEMENT_COVERAGE_CATALOG_VERSION = '2026-07-prompt24-v1';

export function getCatalogFlowById(flowId: string): EnforcementFlowCatalogEntry | undefined {
  return ENFORCEMENT_COVERAGE_CATALOG.find((row) => row.flowId === flowId);
}

export function getProductiveProcessingPaths(): string[] {
  return ENFORCEMENT_COVERAGE_CATALOG.filter((row) => row.productive).map(
    (row) => row.processingPath,
  );
}
