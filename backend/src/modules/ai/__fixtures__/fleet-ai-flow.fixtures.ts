import type { FleetChatResponseType } from '../chat/fleet-chat-evidence-response/fleet-chat-evidence-response.enums';
import type { FleetChatRouteResult } from '../routing/fleet-chat-intent.types';
import type { AiDomainQueryOutcome } from '../evidence/ai-domain-error.types';
import {
  createIntegrationNotConnectedError,
  createIntegrationTemporarilyUnavailableError,
  createPermissionDeniedError,
  createInvalidInputError,
  createTimeoutError,
  createSignalNotSupportedError,
} from '../evidence/ai-domain-error.factory';
import { buildAiDomainQueryOutcome } from '../evidence/ai-domain-error.factory';
import {
  FLEET_AI_ORG_ID,
  FLEET_AI_VEHICLE_TIGUAN_A,
  makeFleetRoute,
} from './fleet-ai-test.fixtures';

const PLATE = 'WOB-L 7503';

function okOutcome<T>(data: T): AiDomainQueryOutcome<T> {
  return buildAiDomainQueryOutcome({
    tenantId: FLEET_AI_ORG_ID,
    data,
    errors: [],
    warnings: [],
  });
}

function errorOutcome(errors: import('../evidence/ai-domain-error.types').AiDomainError[]): AiDomainQueryOutcome<unknown> {
  return buildAiDomainQueryOutcome({
    tenantId: FLEET_AI_ORG_ID,
    data: null,
    errors,
    warnings: [],
  });
}

function baseLocation(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: FLEET_AI_VEHICLE_TIGUAN_A,
    licensePlate: PLATE,
    displayName: 'VW Tiguan 2021',
    latitude: 52.42345,
    longitude: 10.78654,
    observedAt: '2026-07-24T10:00:00.000Z',
    freshness: 'live',
    isLastKnownLocation: false,
    source: 'vehicle_latest_state',
    availability: 'available',
    ...overrides,
  };
}

function baseHealth(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: FLEET_AI_VEHICLE_TIGUAN_A,
    displayName: 'VW Tiguan 2021',
    licensePlate: PLATE,
    overallStatus: 'unremarkable',
    limitedData: false,
    lastUpdatedAt: '2026-07-24T10:00:00.000Z',
    readyToRentBlockers: [],
    ...overrides,
  };
}

function baseOverdue(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: FLEET_AI_VEHICLE_TIGUAN_A,
    licensePlate: PLATE,
    displayName: 'VW Tiguan 2021',
    returnOverdue: true,
    explanation: 'Rückgabefrist überschritten.',
    reasonCodes: ['RETURN_DEADLINE_PASSED'],
    ...overrides,
  };
}

function locationRoute(language: 'de' | 'en'): FleetChatRouteResult {
  return makeFleetRoute({
    primaryIntent: 'VEHICLE_LOCATION',
    detectedIntents: ['VEHICLE_LOCATION'],
    requiredTools: ['get_vehicle_location'],
    language,
  });
}

function healthRoute(language: 'de' | 'en'): FleetChatRouteResult {
  return makeFleetRoute({
    primaryIntent: 'VEHICLE_HEALTH',
    detectedIntents: ['VEHICLE_HEALTH'],
    requiredTools: ['get_vehicle_health_summary'],
    language,
  });
}

function overdueRoute(language: 'de' | 'en'): FleetChatRouteResult {
  return makeFleetRoute({
    primaryIntent: 'OVERDUE_RETURN_EXPLANATION',
    detectedIntents: ['OVERDUE_RETURN_EXPLANATION'],
    requiredTools: ['explain_overdue_return'],
    language,
  });
}

function combinedRoute(
  language: 'de' | 'en',
  tools: FleetChatRouteResult['requiredTools'],
): FleetChatRouteResult {
  return makeFleetRoute({
    primaryIntent: 'COMBINED_VEHICLE_STATUS',
    detectedIntents: ['COMBINED_VEHICLE_STATUS', ...tools.map((t) => {
      if (t === 'get_vehicle_location') return 'VEHICLE_LOCATION';
      if (t === 'get_vehicle_health_summary') return 'VEHICLE_HEALTH';
      if (t === 'get_vehicle_telemetry_status') return 'VEHICLE_TELEMETRY_STATUS';
      return 'OVERDUE_RETURN_EXPLANATION';
    })],
    requiredTools: tools,
    language,
  });
}

export interface FleetAiFlowScenario {
  readonly id: string;
  readonly category: 'location' | 'health' | 'overdue' | 'combined' | 'security';
  readonly messages: { de: string; en: string };
  readonly route: (locale: 'de' | 'en') => FleetChatRouteResult;
  readonly toolOutcomes: Record<string, AiDomainQueryOutcome<unknown>>;
  readonly expectedResponseType?: FleetChatResponseType;
  readonly textPattern: RegExp;
  readonly useDeterministicFallback?: boolean;
  /** Early orchestrator clarification path — no structured payload. */
  readonly expectNoStructuredResponse?: boolean;
}

export const FLEET_AI_FLOW_SCENARIOS: readonly FleetAiFlowScenario[] = [
  // STANDORT
  {
    id: 'location-fresh',
    category: 'location',
    messages: {
      de: `Wo steht ${PLATE} aktuell?`,
      en: `Where is ${PLATE} currently?`,
    },
    route: locationRoute,
    toolOutcomes: {
      get_vehicle_location: okOutcome(baseLocation({ freshness: 'live' })),
    },
    expectedResponseType: 'LOCATION_SUMMARY',
    textPattern: /Live-Position|Live position|52\.42/i,
    useDeterministicFallback: true,
  },
  {
    id: 'location-last-known',
    category: 'location',
    messages: {
      de: `Letzte Position ${PLATE}`,
      en: `Last known position for ${PLATE}`,
    },
    route: locationRoute,
    toolOutcomes: {
      get_vehicle_location: okOutcome(
        baseLocation({
          freshness: 'offline',
          isLastKnownLocation: true,
        }),
      ),
    },
    expectedResponseType: 'LOCATION_SUMMARY',
    textPattern: /Letzte bekannte|Last-known|Nicht als aktuell|Do not present as current/i,
    useDeterministicFallback: true,
  },
  {
    id: 'location-stale',
    category: 'location',
    messages: {
      de: `Veraltete Position ${PLATE}`,
      en: `Stale position for ${PLATE}`,
    },
    route: locationRoute,
    toolOutcomes: {
      get_vehicle_location: okOutcome(
        baseLocation({
          freshness: 'signal_delayed',
          observedAt: '2026-07-23T08:00:00.000Z',
        }),
      ),
    },
    expectedResponseType: 'LOCATION_SUMMARY',
    textPattern: /offline|delayed|Frische/i,
    useDeterministicFallback: true,
  },
  {
    id: 'location-unavailable',
    category: 'location',
    messages: {
      de: `Keine Position für ${PLATE}`,
      en: `No position for ${PLATE}`,
    },
    route: locationRoute,
    toolOutcomes: {
      get_vehicle_location: okOutcome({
        ...baseLocation(),
        availability: 'unavailable',
        latitude: null,
        longitude: null,
      }),
    },
    expectedResponseType: 'LOCATION_SUMMARY',
    textPattern: /keine Position|No position|Koordinaten nicht/i,
    useDeterministicFallback: true,
  },
  {
    id: 'location-telemetry-disconnected',
    category: 'location',
    messages: {
      de: `GPS nicht verbunden ${PLATE}`,
      en: `Telemetry not connected ${PLATE}`,
    },
    route: locationRoute,
    toolOutcomes: {
      get_vehicle_location: errorOutcome([
        createIntegrationNotConnectedError({ organizationId: FLEET_AI_ORG_ID }),
      ]),
    },
    expectedResponseType: 'PARTIAL_DATA',
    textPattern: /teilweise|partial|Domain-Tools|laden|load/i,
    useDeterministicFallback: true,
  },
  {
    id: 'location-provider-timeout',
    category: 'location',
    messages: {
      de: `Wo steht ${PLATE}?`,
      en: `Where is ${PLATE}?`,
    },
    route: locationRoute,
    toolOutcomes: {
      get_vehicle_location: errorOutcome([
        createTimeoutError({
          causeCode: 'AI_DOMAIN_TOOL_TIMEOUT',
          organizationId: FLEET_AI_ORG_ID,
        }),
      ]),
    },
    expectedResponseType: 'PARTIAL_DATA',
    textPattern: /teilweise|partial|Timeout|Domain-Tools/i,
    useDeterministicFallback: true,
  },
  // HEALTH
  {
    id: 'health-unremarkable',
    category: 'health',
    messages: {
      de: `Gesundheit ${PLATE}`,
      en: `Health status ${PLATE}`,
    },
    route: healthRoute,
    toolOutcomes: {
      get_vehicle_health_summary: okOutcome(baseHealth({ overallStatus: 'unremarkable' })),
    },
    expectedResponseType: 'HEALTH_SUMMARY',
    textPattern: /unremarkable|unauffällig|Gesamtstatus/i,
    useDeterministicFallback: true,
  },
  {
    id: 'health-limited-data',
    category: 'health',
    messages: {
      de: `Limited Data ${PLATE}`,
      en: `Limited data ${PLATE}`,
    },
    route: healthRoute,
    toolOutcomes: {
      get_vehicle_health_summary: okOutcome(
        baseHealth({ limitedData: true, overallStatus: 'unknown' }),
      ),
    },
    expectedResponseType: 'HEALTH_SUMMARY',
    textPattern: /Limited Data/i,
    useDeterministicFallback: true,
  },
  {
    id: 'health-critical-dtc',
    category: 'health',
    messages: {
      de: `Kritische DTC ${PLATE}`,
      en: `Critical DTC ${PLATE}`,
    },
    route: healthRoute,
    toolOutcomes: {
      get_vehicle_health_summary: okOutcome(
        baseHealth({
          overallStatus: 'critical',
          readyToRentBlockers: ['active_dtc_critical'],
        }),
      ),
    },
    expectedResponseType: 'HEALTH_SUMMARY',
    textPattern: /critical|kritisch|DTC|Blocker/i,
    useDeterministicFallback: true,
  },
  {
    id: 'health-battery-warning',
    category: 'health',
    messages: {
      de: `Batterie ${PLATE}`,
      en: `Battery warning ${PLATE}`,
    },
    route: healthRoute,
    toolOutcomes: {
      get_vehicle_health_summary: okOutcome(
        baseHealth({
          overallStatus: 'warning',
          readyToRentBlockers: ['battery_warning'],
        }),
      ),
    },
    expectedResponseType: 'HEALTH_SUMMARY',
    textPattern: /warning|Batterie|battery/i,
    useDeterministicFallback: true,
  },
  {
    id: 'health-stale-tire',
    category: 'health',
    messages: {
      de: `Reifen veraltet ${PLATE}`,
      en: `Stale tire data ${PLATE}`,
    },
    route: healthRoute,
    toolOutcomes: {
      get_vehicle_health_summary: okOutcome(
        baseHealth({
          overallStatus: 'warning',
          readyToRentBlockers: ['tire_stale'],
        }),
      ),
    },
    expectedResponseType: 'HEALTH_SUMMARY',
    textPattern: /tire_stale|Reifen/i,
    useDeterministicFallback: true,
  },
  {
    id: 'health-observation-blocker',
    category: 'health',
    messages: {
      de: `Technische Beobachtung ${PLATE}`,
      en: `Technical observation ${PLATE}`,
    },
    route: healthRoute,
    toolOutcomes: {
      get_vehicle_health_summary: okOutcome(
        baseHealth({
          overallStatus: 'warning',
          readyToRentBlockers: ['technical_observation'],
        }),
      ),
    },
    expectedResponseType: 'HEALTH_SUMMARY',
    textPattern: /technical_observation|Beobachtung/i,
    useDeterministicFallback: true,
  },
  {
    id: 'health-signal-not-supported',
    category: 'health',
    messages: {
      de: `Health Signal nicht unterstützt ${PLATE}`,
      en: `Health signal not supported ${PLATE}`,
    },
    route: healthRoute,
    toolOutcomes: {
      get_vehicle_health_summary: errorOutcome([
        createSignalNotSupportedError({ organizationId: FLEET_AI_ORG_ID }),
      ]),
    },
    expectedResponseType: 'PARTIAL_DATA',
    textPattern: /teilweise|partial|signal|Signal|unterstützt|supported/i,
    useDeterministicFallback: true,
  },
  // OVERDUE
  {
    id: 'overdue-true',
    category: 'overdue',
    messages: {
      de: `Warum überfällig ${PLATE}?`,
      en: `Why overdue ${PLATE}?`,
    },
    route: overdueRoute,
    toolOutcomes: {
      explain_overdue_return: okOutcome(baseOverdue()),
    },
    expectedResponseType: 'OVERDUE_EXPLANATION',
    textPattern: /überfällig|overdue|RETURN_DEADLINE/i,
    useDeterministicFallback: true,
  },
  {
    id: 'overdue-grace-period',
    category: 'overdue',
    messages: {
      de: `Karenzzeit ${PLATE}`,
      en: `Grace period ${PLATE}`,
    },
    route: overdueRoute,
    toolOutcomes: {
      explain_overdue_return: okOutcome(
        baseOverdue({
          returnOverdue: false,
          reasonCodes: ['RETURN_GRACE_PERIOD_ACTIVE'],
          explanation: 'Karenzzeit läuft noch.',
        }),
      ),
    },
    expectedResponseType: 'OVERDUE_EXPLANATION',
    textPattern: /Karenz|grace|Grace/i,
    useDeterministicFallback: true,
  },
  {
    id: 'overdue-extension-approved',
    category: 'overdue',
    messages: {
      de: `Verlängerung genehmigt ${PLATE}`,
      en: `Extension approved ${PLATE}`,
    },
    route: overdueRoute,
    toolOutcomes: {
      explain_overdue_return: okOutcome(
        baseOverdue({
          returnOverdue: false,
          reasonCodes: ['RETURN_EXTENSION_APPROVED'],
          explanation: 'Genehmigte Verlängerung aktiv.',
        }),
      ),
    },
    expectedResponseType: 'OVERDUE_EXPLANATION',
    textPattern: /Verlängerung|extension|Extension/i,
    useDeterministicFallback: true,
  },
  {
    id: 'overdue-completed',
    category: 'overdue',
    messages: {
      de: `Rückgabe abgeschlossen ${PLATE}`,
      en: `Return completed ${PLATE}`,
    },
    route: overdueRoute,
    toolOutcomes: {
      explain_overdue_return: okOutcome(
        baseOverdue({
          returnOverdue: false,
          reasonCodes: ['RETURN_COMPLETED'],
          explanation: 'Rückgabe bereits abgeschlossen.',
        }),
      ),
    },
    expectedResponseType: 'OVERDUE_EXPLANATION',
    textPattern: /abgeschlossen|completed/i,
    useDeterministicFallback: true,
  },
  {
    id: 'overdue-stale-runtime',
    category: 'overdue',
    messages: {
      de: `Runtime State veraltet ${PLATE}`,
      en: `Stale runtime state ${PLATE}`,
    },
    route: overdueRoute,
    toolOutcomes: {
      explain_overdue_return: okOutcome(
        baseOverdue({
          returnOverdue: true,
          reasonCodes: ['RETURN_RUNTIME_STATE_STALE'],
        }),
      ),
    },
    expectedResponseType: 'OVERDUE_EXPLANATION',
    textPattern: /RUNTIME|runtime|veraltet|stale/i,
    useDeterministicFallback: true,
  },
  {
    id: 'overdue-no-booking',
    category: 'overdue',
    messages: {
      de: `Keine aktive Buchung ${PLATE}`,
      en: `No active booking ${PLATE}`,
    },
    route: overdueRoute,
    toolOutcomes: {
      explain_overdue_return: okOutcome(
        baseOverdue({
          returnOverdue: false,
          explanation: 'Keine passende aktive Buchung.',
          reasonCodes: ['NO_OPEN_BOOKING'],
        }),
      ),
    },
    expectedResponseType: 'OVERDUE_EXPLANATION',
    textPattern: /keine|no.*booking|Buchung/i,
    useDeterministicFallback: true,
  },
  {
    id: 'overdue-cancelled-wrongly',
    category: 'overdue',
    messages: {
      de: `Stornierte Buchung markiert ${PLATE}`,
      en: `Cancelled booking wrongly marked ${PLATE}`,
    },
    route: overdueRoute,
    toolOutcomes: {
      explain_overdue_return: okOutcome(
        baseOverdue({
          returnOverdue: true,
          reasonCodes: ['BOOKING_CANCELLED_BUT_OVERDUE_FLAG'],
          explanation: 'Stornierte Buchung fälschlich als überfällig markiert.',
        }),
      ),
    },
    expectedResponseType: 'OVERDUE_EXPLANATION',
    textPattern: /storniert|cancelled/i,
    useDeterministicFallback: true,
  },
  // COMBINED
  {
    id: 'combined-location-overdue',
    category: 'combined',
    messages: {
      de: `Wo steht ${PLATE} und warum überfällig?`,
      en: `Where is ${PLATE} and why overdue?`,
    },
    route: (locale) =>
      combinedRoute(locale, ['explain_overdue_return', 'get_vehicle_location']),
    toolOutcomes: {
      explain_overdue_return: okOutcome(baseOverdue()),
      get_vehicle_location: okOutcome(baseLocation()),
    },
    expectedResponseType: 'COMBINED_SUMMARY',
    textPattern: /überfällig|overdue|52\.42/i,
    useDeterministicFallback: true,
  },
  {
    id: 'combined-health-telemetry',
    category: 'combined',
    messages: {
      de: `Gesundheit und Telemetrie ${PLATE}`,
      en: `Health and telemetry ${PLATE}`,
    },
    route: (locale) =>
      combinedRoute(locale, ['get_vehicle_health_summary', 'get_vehicle_telemetry_status']),
    toolOutcomes: {
      get_vehicle_health_summary: okOutcome(baseHealth({ overallStatus: 'warning' })),
      get_vehicle_telemetry_status: okOutcome({
        connectivity: 'live',
        freshness: 'live',
        observedAt: '2026-07-24T10:00:00.000Z',
      }),
    },
    expectedResponseType: 'COMBINED_SUMMARY',
    textPattern: /Gesundheit|Health|live|Telemetrie/i,
    useDeterministicFallback: true,
  },
  {
    id: 'combined-full-summary',
    category: 'combined',
    messages: {
      de: `Vollständige Zusammenfassung ${PLATE}`,
      en: `Full vehicle summary ${PLATE}`,
    },
    route: (locale) =>
      combinedRoute(locale, [
        'get_vehicle_location',
        'get_vehicle_health_summary',
        'get_vehicle_telemetry_status',
      ]),
    toolOutcomes: {
      get_vehicle_location: okOutcome(baseLocation()),
      get_vehicle_health_summary: okOutcome(baseHealth()),
      get_vehicle_telemetry_status: okOutcome({ connectivity: 'live', freshness: 'live' }),
    },
    expectedResponseType: 'COMBINED_SUMMARY',
    textPattern: /Live-Position|Gesundheit|Health/i,
    useDeterministicFallback: true,
  },
  // SECURITY
  {
    id: 'security-foreign-org',
    category: 'security',
    messages: {
      de: `Fahrzeug fremde Organisation ${PLATE}`,
      en: `Foreign organization ${PLATE}`,
    },
    route: (locale) =>
      makeFleetRoute({
        primaryIntent: 'VEHICLE_LOCATION',
        requiredTools: ['get_vehicle_location'],
        language: locale,
      }),
    toolOutcomes: {
      get_vehicle_location: errorOutcome([
        createInvalidInputError({
          causeCode: 'vehicle_not_in_tenant',
          organizationId: FLEET_AI_ORG_ID,
        }),
      ]),
    },
    expectedResponseType: 'PARTIAL_DATA',
    textPattern: /teilweise|partial|Zugriff|tenant|Tenant/i,
    useDeterministicFallback: true,
  },
  {
    id: 'security-role-restricted',
    category: 'security',
    messages: {
      de: `Gesundheit ohne Rolle ${PLATE}`,
      en: `Health restricted role ${PLATE}`,
    },
    route: healthRoute,
    toolOutcomes: {
      get_vehicle_health_summary: errorOutcome([
        createPermissionDeniedError({ organizationId: FLEET_AI_ORG_ID }),
      ]),
    },
    expectedResponseType: 'PERMISSION_RESTRICTED',
    textPattern: /Berechtigung|Permission/i,
    useDeterministicFallback: true,
  },
  {
    id: 'security-customer-pii',
    category: 'security',
    messages: {
      de: `Buchungskontext Kunde ${PLATE}`,
      en: `Booking customer context ${PLATE}`,
    },
    route: (locale) =>
      makeFleetRoute({
        primaryIntent: 'VEHICLE_BOOKING_CONTEXT',
        detectedIntents: ['VEHICLE_BOOKING_CONTEXT'],
        requiredTools: ['get_vehicle_booking_context'],
        language: locale,
      }),
    toolOutcomes: {
      get_vehicle_booking_context: okOutcome({
        bookingId: 'bk-1',
        customerName: null,
        customerRefRedacted: true,
      }),
    },
    expectedResponseType: 'BOOKING_SUMMARY',
    textPattern: /Buchung|booking|Kunde|customer/i,
    useDeterministicFallback: true,
  },
  {
    id: 'security-manipulated-id',
    category: 'security',
    messages: {
      de: `vehicleId=evil-uuid ${PLATE}`,
      en: `vehicleId=evil-uuid ${PLATE}`,
    },
    route: (locale) =>
      makeFleetRoute({
        primaryIntent: 'AMBIGUOUS',
        clarificationNeeded: {
          kind: 'vehicle_ambiguous',
          messageDe: 'Bitte Kennzeichen nennen.',
          messageEn: 'Please specify plate.',
          candidatePlates: [PLATE],
        },
        requiredTools: [],
        securityFlags: ['suspicious_identifier_in_text', 'vehicle_not_in_tenant'],
        language: locale,
        vehicleResolution: {
          resolvedVehicleId: null,
          displayName: null,
          licensePlate: null,
          matchType: 'none',
          confidence: 0,
          ambiguity: { isAmbiguous: true, reason: 'vehicle_not_in_tenant', candidates: [] },
          allowedDataScope: {
            inOrganization: false,
            inStationScope: false,
            hasDimoTelemetry: false,
            operational: false,
            vehicleStatus: null,
          },
        },
      }),
    toolOutcomes: {},
    expectNoStructuredResponse: true,
    textPattern: /Kennzeichen|plate/i,
    useDeterministicFallback: true,
  },
];
