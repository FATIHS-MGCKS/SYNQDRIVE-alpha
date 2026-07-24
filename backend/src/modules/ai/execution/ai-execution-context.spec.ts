import { MembershipRole } from '@prisma/client';
import {
  assertAiBookingAccess,
  assertAiCustomerDataAccess,
  assertAiFleetSummaryAccess,
  assertAiHealthAccess,
  assertAiLocationAccess,
  assertAiToolExecutionAllowed,
  buildAiExecutionContext,
  resolveAiExecutionContextError,
  resolveAiVehicleAccess,
  validateAiExecutionContext,
} from './index';
import type {
  AiDataAuthorizationProbe,
  AiExecutionContext,
  AiVehicleScopeResolver,
  VerifiedAiExecutionContextInput,
} from './ai-execution-context.types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '99999999-9999-4999-8999-999999999999';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_A = '33333333-3333-4333-8333-333333333333';
const VEHICLE_B = '44444444-4444-4444-8444-444444444444';
const STATION_A = '55555555-5555-4555-8555-555555555555';
const STATION_B = '66666666-6666-4666-8666-666666666666';

function baseVerifiedInput(
  overrides: Partial<VerifiedAiExecutionContextInput> = {},
): VerifiedAiExecutionContextInput {
  return {
    organizationId: ORG_ID,
    userId: USER_ID,
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      'fleet-condition': { read: true, write: false },
      bookings: { read: true, write: false },
      customers: { read: true, write: false },
      dashboard: { read: true, write: false },
      'ai-assistant': { read: true, write: false },
    },
    stationScope: 'ALL',
    stationIds: [],
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: 'corr-0001',
    requestId: 'req-0001',
    ...overrides,
  };
}

function buildContext(
  overrides: Partial<VerifiedAiExecutionContextInput> = {},
): AiExecutionContext {
  return buildAiExecutionContext(baseVerifiedInput(overrides));
}

function createResolver(
  vehicles: Record<string, { organizationId: string; currentStationId: string | null }>,
): AiVehicleScopeResolver {
  return {
    async findVehicleInOrganization(vehicleId, organizationId) {
      const row = vehicles[vehicleId];
      if (!row || row.organizationId !== organizationId) {
        return null;
      }
      return {
        id: vehicleId,
        organizationId: row.organizationId,
        currentStationId: row.currentStationId,
      };
    },
  };
}

function createGpsProbe(authorizedVehicleIds: Set<string>): AiDataAuthorizationProbe {
  return {
    async isGpsLocationAuthorized({ vehicleId }) {
      return authorizedVehicleIds.has(vehicleId);
    },
  };
}

describe('AI execution context', () => {
  describe('buildAiExecutionContext', () => {
    it('builds immutable context from verified backend auth inputs only', () => {
      const ctx = buildContext();

      expect(ctx.organizationId).toBe(ORG_ID);
      expect(ctx.userId).toBe(USER_ID);
      expect(ctx.role).toBe(MembershipRole.WORKER);
      expect(ctx.correlationId).toBe('corr-0001');
      expect(ctx.requestId).toBe('req-0001');
      expect(ctx.channel).toBe('fleet_chat');
      expect(ctx.allowedVehicleScope.mode).toBe('all');
      expect(validateAiExecutionContext(ctx).valid).toBe(true);
    });

    it('marks station-restricted memberships as restricted vehicle scope', () => {
      const ctx = buildContext({
        stationScope: 'ALL',
        stationIds: [STATION_A],
        stationsScopeV2Enabled: true,
        permissions: {
          fleet: { read: true, write: false },
          'ai-assistant': { read: true, write: false },
        },
      });

      expect(ctx.allowedVehicleScope.mode).toBe('restricted');
      expect(ctx.allowedVehicleScope.effectiveStationIds).toEqual([STATION_A]);
    });
  });

  describe('resolveAiExecutionContextError', () => {
    it('rejects missing context before tool execution', () => {
      const error = resolveAiExecutionContextError(null);
      expect(error?.code).toBe('internal_processing_failed');
      expect(error?.diagnostics.causeCode).toBe('AI_EXECUTION_CONTEXT_MISSING');
    });
  });

  describe('assertAiToolExecutionAllowed', () => {
    it('allows execution with ai-assistant.read', () => {
      expect(assertAiToolExecutionAllowed(buildContext())).toBe(true);
    });

    it('denies execution without ai-assistant.read', () => {
      const ctx = buildContext({
        permissions: {
          fleet: { read: true, write: false },
        },
      });
      const result = assertAiToolExecutionAllowed(ctx);
      expect(result).not.toBe(true);
      if (result !== true) {
        expect(result.code).toBe('permission_denied');
      }
    });
  });

  describe('resolveAiVehicleAccess', () => {
    const resolver = createResolver({
      [VEHICLE_A]: { organizationId: ORG_ID, currentStationId: STATION_A },
      [VEHICLE_B]: { organizationId: ORG_ID, currentStationId: STATION_B },
    });

    it('allows org-bound vehicle access for authorized users', async () => {
      const result = await resolveAiVehicleAccess(
        buildContext(),
        { vehicleId: VEHICLE_A },
        resolver,
      );

      expect(result).toEqual({
        vehicleId: VEHICLE_A,
        organizationId: ORG_ID,
        vehicle: {
          id: VEHICLE_A,
          organizationId: ORG_ID,
          currentStationId: STATION_A,
        },
      });
    });

    it('masks existence when fleet.read is missing', async () => {
      const ctx = buildContext({
        permissions: {
          'ai-assistant': { read: true, write: false },
        },
      });

      const result = await resolveAiVehicleAccess(ctx, { vehicleId: VEHICLE_A }, resolver);
      expect(result).not.toBe(true);
      if (typeof result === 'object' && 'code' in result) {
        expect(result.code).toBe('permission_denied');
        expect(result.maskEntityExistence).toBe(true);
      }
    });

    it('rejects manipulated organizationId from tool arguments', async () => {
      const result = await resolveAiVehicleAccess(
        buildContext(),
        { vehicleId: VEHICLE_A, organizationId: OTHER_ORG_ID },
        resolver,
      );

      if (typeof result === 'object' && 'code' in result) {
        expect(result.code).toBe('permission_denied');
      } else {
        fail('expected permission_denied');
      }
    });

    it('returns vehicle_not_found for vehicles outside station scope', async () => {
      const ctx = buildContext({
        stationScope: 'ALL',
        stationIds: [STATION_A],
        stationsScopeV2Enabled: true,
        permissions: {
          fleet: { read: true, write: false },
          'ai-assistant': { read: true, write: false },
        },
      });

      const result = await resolveAiVehicleAccess(
        ctx,
        { vehicleId: VEHICLE_B },
        resolver,
      );

      if (typeof result === 'object' && 'code' in result) {
        expect(result.code).toBe('vehicle_not_found');
      } else {
        fail('expected vehicle_not_found');
      }
    });

    it('returns vehicle_not_found for manipulated vehicle id', async () => {
      const missingVehicleId = '77777777-7777-4777-8777-777777777777';
      const result = await resolveAiVehicleAccess(
        buildContext(),
        { vehicleId: missingVehicleId },
        resolver,
      );

      if (typeof result === 'object' && 'code' in result) {
        expect(result.code).toBe('vehicle_not_found');
      } else {
        fail('expected vehicle_not_found');
      }
    });
  });

  describe('assertAiLocationAccess', () => {
    it('allows location access with fleet read and data authorization', async () => {
      const allowed = await assertAiLocationAccess(
        buildContext(),
        createGpsProbe(new Set([VEHICLE_A])),
        VEHICLE_A,
      );
      expect(allowed).toBe(true);
    });

    it('denies location access without data authorization', async () => {
      const denied = await assertAiLocationAccess(
        buildContext(),
        createGpsProbe(new Set()),
        VEHICLE_A,
      );
      if (denied !== true) {
        expect(denied.code).toBe('permission_denied');
      } else {
        fail('expected permission_denied');
      }
    });
  });

  describe('module access guards', () => {
    it('allows health access with fleet-condition.read', () => {
      expect(assertAiHealthAccess(buildContext())).toBe(true);
    });

    it('denies health access without fleet-condition.read', () => {
      const ctx = buildContext({
        permissions: {
          fleet: { read: true, write: false },
          'ai-assistant': { read: true, write: false },
        },
      });
      const result = assertAiHealthAccess(ctx);
      if (result !== true) {
        expect(result.code).toBe('permission_denied');
      }
    });

    it('allows booking access with bookings.read', () => {
      expect(assertAiBookingAccess(buildContext())).toBe(true);
    });

    it('denies customer PII without customers.read', () => {
      const ctx = buildContext({
        permissions: {
          fleet: { read: true, write: false },
          'ai-assistant': { read: true, write: false },
        },
      });
      const result = assertAiCustomerDataAccess(ctx);
      if (result !== true) {
        expect(result.code).toBe('permission_denied');
      }
    });

    it('allows fleet summary with dashboard.read', () => {
      const ctx = buildContext({
        permissions: {
          dashboard: { read: true, write: false },
          'ai-assistant': { read: true, write: false },
        },
      });
      expect(assertAiFleetSummaryAccess(ctx)).toBe(true);
    });

    it('denies fleet summary when role permissions are missing', () => {
      const ctx = buildContext({
        permissions: {
          'ai-assistant': { read: true, write: false },
        },
      });
      const result = assertAiFleetSummaryAccess(ctx);
      if (result !== true) {
        expect(result.code).toBe('permission_denied');
      }
    });
  });
});
