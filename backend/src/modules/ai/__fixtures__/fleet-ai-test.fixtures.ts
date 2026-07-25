import { MembershipRole, VehicleStatus } from '@prisma/client';
import { buildAiExecutionContext } from '../execution/ai-execution-context.builder';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import type { AiVehicleResolutionRecord } from '../vehicle-resolution/ai-vehicle-resolution.types';
import type { FleetChatRouteResult } from '../routing/fleet-chat-intent.types';
import type { FleetChatToolExecutionRecord } from '../chat/fleet-chat-orchestrator.types';

export const FLEET_AI_ORG_ID = '11111111-1111-4111-8111-111111111111';
export const FLEET_AI_USER_ID = '22222222-2222-4222-8222-222222222222';
export const FLEET_AI_OTHER_ORG_ID = '99999999-9999-4999-8999-999999999999';
export const FLEET_AI_VEHICLE_TIGUAN_A = '33333333-3333-4333-8333-333333333333';
export const FLEET_AI_VEHICLE_TIGUAN_B = '44444444-4444-4444-8444-444444444444';
export const FLEET_AI_VEHICLE_GOLF = '55555555-5555-4555-8555-555555555555';
export const FLEET_AI_STATION_A = '66666666-6666-4666-8666-666666666666';
export const FLEET_AI_STATION_B = '77777777-7777-4777-8777-777777777777';
export const FLEET_AI_CORR_ID = 'corr-fleet-ai-test';

export function makeFleetVehicle(
  overrides: Partial<AiVehicleResolutionRecord> & Pick<AiVehicleResolutionRecord, 'vehicleId'>,
): AiVehicleResolutionRecord {
  return {
    organizationId: FLEET_AI_ORG_ID,
    licensePlate: null,
    vehicleName: null,
    make: 'VW',
    model: 'Tiguan',
    year: 2021,
    vin: 'WVWZZZ1JZYW000001',
    fuelType: 'DIESEL',
    tokenId: 872,
    status: VehicleStatus.AVAILABLE,
    currentStationId: FLEET_AI_STATION_A,
    ...overrides,
  };
}

export const FLEET_AI_TEST_FLEET: AiVehicleResolutionRecord[] = [
  makeFleetVehicle({
    vehicleId: FLEET_AI_VEHICLE_TIGUAN_A,
    licensePlate: 'WOB-L 7503',
    vehicleName: 'Fleet Tiguan North',
    tokenId: 872,
    currentStationId: FLEET_AI_STATION_A,
  }),
  makeFleetVehicle({
    vehicleId: FLEET_AI_VEHICLE_TIGUAN_B,
    licensePlate: 'B-XY 9901',
    vehicleName: 'Fleet Tiguan South',
    year: 2019,
    vin: 'WVWZZZ1JZYW000002',
    tokenId: 901,
    currentStationId: FLEET_AI_STATION_B,
  }),
  makeFleetVehicle({
    vehicleId: FLEET_AI_VEHICLE_GOLF,
    licensePlate: 'B-AB 1234',
    make: 'VW',
    model: 'Golf',
    year: 2020,
    vin: 'WVWZZZ1JZYW000003',
    tokenId: null,
    currentStationId: FLEET_AI_STATION_A,
  }),
];

export function buildFleetAiContext(
  overrides: Partial<Parameters<typeof buildAiExecutionContext>[0]> = {},
): AiExecutionContext {
  return buildAiExecutionContext({
    organizationId: FLEET_AI_ORG_ID,
    userId: FLEET_AI_USER_ID,
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      'fleet-condition': { read: true, write: false },
      bookings: { read: true, write: false },
      'ai-assistant': { read: true, write: true },
    },
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: FLEET_AI_CORR_ID,
    requestId: 'req-fleet-ai-test',
    ...overrides,
  });
}

export function makeFleetRoute(
  overrides: Partial<FleetChatRouteResult> = {},
): FleetChatRouteResult {
  return {
    detectedIntents: ['VEHICLE_LOCATION'],
    primaryIntent: 'VEHICLE_LOCATION',
    vehicleReferences: [
      {
        vehicleId: FLEET_AI_VEHICLE_TIGUAN_A,
        displayName: 'VW Tiguan 2021',
        licensePlate: 'WOB-L 7503',
        matchType: 'license_plate_exact',
        confidence: 0.95,
        source: 'hardened_resolver',
      },
    ],
    bookingReferences: [],
    requiredTools: ['get_vehicle_location'],
    ambiguities: [],
    clarificationNeeded: null,
    confidence: 0.9,
    language: 'de',
    securityFlags: [],
    vehicleResolution: {
      resolvedVehicleId: FLEET_AI_VEHICLE_TIGUAN_A,
      displayName: 'VW Tiguan 2021',
      licensePlate: 'WOB-L 7503',
      matchType: 'license_plate_exact',
      confidence: 0.95,
      ambiguity: { isAmbiguous: false, reason: null, candidates: [] },
      allowedDataScope: {
        inOrganization: true,
        inStationScope: true,
        hasDimoTelemetry: true,
        operational: true,
        vehicleStatus: VehicleStatus.AVAILABLE,
      },
    },
    intentScores: [],
    usedLlmClassification: false,
    sanitizedMessage: 'test',
    ...overrides,
  };
}

export function makeFleetToolRecord(
  toolName: FleetChatToolExecutionRecord['toolName'],
  data: Record<string, unknown> | null,
  errors: FleetChatToolExecutionRecord['outcome']['errors'] = [],
): FleetChatToolExecutionRecord {
  return {
    toolName,
    success: data != null || errors.length === 0,
    durationMs: 2,
    outcome: {
      tenantId: FLEET_AI_ORG_ID,
      partial: errors.length > 0 && data != null,
      data,
      evidence: [],
      errors,
      warnings: [],
      allowLlmInference: errors.every((e) => !e.blockLlmInference),
    },
  };
}
