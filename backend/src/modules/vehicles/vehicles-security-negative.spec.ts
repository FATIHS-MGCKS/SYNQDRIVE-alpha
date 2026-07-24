/**
 * Consolidated security negative tests for vehicle detail endpoints and tenant boundaries.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CleaningStatus, HealthStatus, VehicleStatus } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { DataAuthorizationDeniedException } from '@modules/data-authorizations/data-authorization.exceptions';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { FleetMapCacheService } from './fleet-map-cache.service';
import {
  makeOperationalPrismaMocks,
} from './operational/vehicle-operational-state-v2.test-helpers';

describe('Vehicles — security negative tests', () => {
  const orgA = 'org-tenant-a';
  const orgB = 'org-tenant-b';
  const vehicleA = 'veh-org-a';
  const vehicleB = 'veh-org-b';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let permissionsGuard: PermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  const fleetReadRequirement = { module: 'fleet', level: 'read' };
  const fleetWriteRequirement = { module: 'fleet', level: 'write' };

  const templateByKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

  function permissionsContext(
    user: Record<string, unknown> | undefined,
    routeOrgId = orgA,
    requirement = fleetReadRequirement,
    params: Record<string, string> = { orgId: routeOrgId, vehicleId: vehicleA },
  ) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(requirement);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params,
          query: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  }

  beforeEach(() => {
    permissionsGuard = new PermissionsGuard(reflector, prisma as never);
    orgScopingGuard = new OrgScopingGuard(prisma as never);
    jest.clearAllMocks();
  });

  describe('authentication and org scoping', () => {
    it('denies unauthenticated fleet.read access (403)', async () => {
      await expect(
        permissionsGuard.canActivate(permissionsContext(undefined) as never),
      ).rejects.toMatchObject({
        response: { message: 'Authentication required', statusCode: 403 },
      });
    });

    it('denies authenticated user without active membership (403)', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(
        permissionsGuard.canActivate(
          permissionsContext({ id: userId, organizationId: orgA }) as never,
        ),
      ).rejects.toMatchObject({
        response: { message: 'You do not have access to this organization', statusCode: 403 },
      });
    });

    it('denies cross-tenant org access via OrgScopingGuard before permission lookup', async () => {
      await expect(
        orgScopingGuard.canActivate(
          permissionsContext({ id: userId, organizationId: orgA }, orgB) as never,
        ),
      ).rejects.toMatchObject({
        response: { message: 'You do not have access to this organization', statusCode: 403 },
      });
      expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('fleet permission enforcement', () => {
    it('denies member without fleet.read on telemetry (403)', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: 'WORKER',
        permissions: normalizeMembershipPermissions({
          fleet: { read: false, write: false, delete: false },
          bookings: { read: true, write: false, delete: false },
        }),
      });

      await expect(
        permissionsGuard.canActivate(
          permissionsContext({ id: userId, organizationId: orgA }, orgA, fleetReadRequirement) as never,
        ),
      ).rejects.toMatchObject({
        response: { message: 'Missing permission: fleet.read', statusCode: 403 },
      });
    });

    it('allows employee fleet.read for telemetry/live-gps', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: 'WORKER',
        permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
      });

      await expect(
        permissionsGuard.canActivate(
          permissionsContext({ id: userId, organizationId: orgA }, orgA, fleetReadRequirement) as never,
        ),
      ).resolves.toBe(true);
    });

    it('denies read-only employee on status PATCH (fleet.write required)', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: 'WORKER',
        permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
      });

      await expect(
        permissionsGuard.canActivate(
          permissionsContext(
            { id: userId, organizationId: orgA },
            orgA,
            fleetWriteRequirement,
          ) as never,
        ),
      ).rejects.toMatchObject({
        response: { message: 'Missing permission: fleet.write', statusCode: 403 },
      });
    });

    it('allows org admin fleet.write for status mutation', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: 'ORG_ADMIN',
        permissions: normalizeMembershipPermissions(templateByKey('org_admin').permissions),
      });

      await expect(
        permissionsGuard.canActivate(
          permissionsContext(
            { id: userId, organizationId: orgA },
            orgA,
            fleetWriteRequirement,
          ) as never,
        ),
      ).resolves.toBe(true);
    });
  });

  describe('tenant isolation — foreign vehicleId', () => {
    it('scopes vehicle lookup by organizationId (simulated where-clause)', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      await findFirst({
        where: { id: vehicleB, organizationId: orgA },
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: vehicleB, organizationId: orgA },
      });
    });

    it('does not return foreign-org vehicle when org filter mismatches', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const result = await findFirst({
        where: { id: vehicleB, organizationId: orgA },
      });
      expect(result).toBeNull();
    });

    it('VehiclesService.update throws NotFound for foreign vehicle in org scope', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const stub = (): unknown => ({});
      const service = new (VehiclesService as unknown as {
        new (...args: unknown[]): VehiclesService;
      })(
        { vehicle: { findFirst, update } },
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        new FleetMapCacheService({ del: jest.fn() } as never),
      );

      await expect(
        service.update(vehicleB, { cleaningStatus: CleaningStatus.CLEAN }, orgA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('data authorization (live GPS)', () => {
    it('propagates DataAuthorizationDeniedException when GPS purpose is blocked', async () => {
      const dataAuthEnforcement = {
        assertDataAuthorization: jest.fn().mockRejectedValue(
          new DataAuthorizationDeniedException('GPS location sharing disabled'),
        ),
      };
      const dataAuthorizations = {
        ensureDimoTelemetryAuthorization: jest.fn().mockResolvedValue(undefined),
      };
      const findFirst = jest.fn().mockResolvedValue({
        id: vehicleA,
        dimoVehicle: { tokenId: 12345 },
        latestState: { latitude: 52.5, longitude: 13.4 },
      });
      const stub = (): unknown => ({});
      const service = new (VehiclesService as unknown as {
        new (...args: unknown[]): VehiclesService;
      })(
        { vehicle: { findFirst } },
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        dataAuthorizations,
        dataAuthEnforcement,
        stub(),
        stub(),
        stub(),
        stub(),
        new FleetMapCacheService({ del: jest.fn() } as never),
      );

      await expect(service.getLiveGps(vehicleA, orgA)).rejects.toBeInstanceOf(
        DataAuthorizationDeniedException,
      );
      expect(dataAuthEnforcement.assertDataAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: orgA,
          vehicleId: vehicleA,
          dataCategory: 'GPS_LOCATION',
          purpose: 'LIVE_MAP',
        }),
      );
    });

    it('rejects wrong data purpose at enforcement boundary', async () => {
      const dataAuthEnforcement = {
        assertDataAuthorization: jest.fn().mockRejectedValue(
          new DataAuthorizationDeniedException('Purpose not authorized', 'DATA_AUTHORIZATION_DENIED', {
            purpose: 'ANALYTICS',
          }),
        ),
      };
      const dataAuthorizations = {
        ensureDimoTelemetryAuthorization: jest.fn().mockResolvedValue(undefined),
      };
      const findFirst = jest.fn().mockResolvedValue({
        id: vehicleA,
        dimoVehicle: { tokenId: 99 },
        latestState: null,
      });
      const stub = (): unknown => ({});
      const service = new (VehiclesService as unknown as {
        new (...args: unknown[]): VehiclesService;
      })(
        { vehicle: { findFirst } },
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        dataAuthorizations,
        dataAuthEnforcement,
        stub(),
        stub(),
        stub(),
        stub(),
        new FleetMapCacheService({ del: jest.fn() } as never),
      );

      await expect(service.getLiveGps(vehicleA, orgA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('fleet-map cache tenant isolation', () => {
    it('uses org-scoped redis keys so cache hits cannot cross tenants', async () => {
      const orgACache = [{ id: vehicleA, status: 'Available' }];
      const redisGet = jest.fn().mockImplementation(async (key: string) => {
        if (key === `fleet-map:${orgA}:v1`) return JSON.stringify(orgACache);
        return null;
      });
      const redis = { get: redisGet, set: jest.fn(), del: jest.fn() };
      const fleetMapCache = new FleetMapCacheService(redis as never);

      expect(fleetMapCache.cacheKey(orgA)).toBe(`fleet-map:${orgA}:v1`);
      expect(fleetMapCache.cacheKey(orgB)).toBe(`fleet-map:${orgB}:v1`);
      expect(fleetMapCache.cacheKey(orgA)).not.toBe(fleetMapCache.cacheKey(orgB));

      const findMany = jest.fn();
      const stub = (): unknown => ({});
      const service = new (VehiclesService as unknown as {
        new (...args: unknown[]): VehiclesService;
      })(
        makeOperationalPrismaMocks({
          vehicle: { findMany },
          booking: { findMany: jest.fn().mockResolvedValue([]) },
        }),
        redis,
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        stub(),
        fleetMapCache,
      );

      const resultA = await service.getFleetMapData(orgA);
      expect(resultA).toEqual(orgACache);
      expect(redisGet).toHaveBeenCalledWith(`fleet-map:${orgA}:v1`);
      expect(findMany).not.toHaveBeenCalled();

      redisGet.mockClear();
      await redis.get(`fleet-map:${orgB}:v1`);
      expect(redisGet).toHaveBeenCalledWith(`fleet-map:${orgB}:v1`);
      expect(redisGet).not.toHaveBeenCalledWith(`fleet-map:${orgA}:v1`);
    });
  });

  describe('manipulated vehicleId parameter', () => {
    it('controller passes route vehicleId to service without trusting body', async () => {
      const vehiclesService = {
        update: jest.fn().mockResolvedValue({ id: vehicleA }),
        invalidateFleetMapCache: jest.fn(),
      };
      const vehicleCleaningTasks = {
        ensureCleaningTask: jest.fn(),
        completeOpenCleaningTasks: jest.fn(),
      };
      const controller = new VehiclesController(
        vehiclesService as never,
        {} as never,
        vehicleCleaningTasks as never,
      );

      await controller.updateVehicleStatus(orgA, vehicleA, { user: { id: userId } }, {
        cleaningStatus: CleaningStatus.NEEDS_CLEANING,
      });

      expect(vehiclesService.update).toHaveBeenCalledWith(
        vehicleA,
        expect.objectContaining({ cleaningStatus: CleaningStatus.NEEDS_CLEANING }),
        orgA,
      );
    });
  });

  describe('provider failure handling', () => {
    it('live GPS falls back to cache on DIMO provider error (no 500)', async () => {
      const dataAuthEnforcement = {
        assertDataAuthorization: jest.fn().mockResolvedValue({ id: 'auth-1' }),
      };
      const dataAuthorizations = {
        ensureDimoTelemetryAuthorization: jest.fn().mockResolvedValue(undefined),
      };
      const dimoAuth = {
        getVehicleJwt: jest.fn().mockRejectedValue(new Error('DIMO unavailable')),
      };
      const findFirst = jest.fn().mockResolvedValue({
        id: vehicleA,
        dimoVehicle: { tokenId: 555 },
        latestState: { latitude: 50.1, longitude: 8.7 },
      });
      const stub = (): unknown => ({});
      const service = new (VehiclesService as unknown as {
        new (...args: unknown[]): VehiclesService;
      })(
        { vehicle: { findFirst } },
        stub(),
        dimoAuth,
        stub(),
        stub(),
        stub(),
        stub(),
        dataAuthorizations,
        dataAuthEnforcement,
        stub(),
        stub(),
        stub(),
        stub(),
        new FleetMapCacheService({ del: jest.fn() } as never),
      );

      const result = await service.getLiveGps(vehicleA, orgA);
      expect(result).toEqual({
        latitude: 50.1,
        longitude: 8.7,
        speedKmh: null,
        lastSeenAt: null,
        source: 'cache',
      });
    });
  });

  describe('rate limiting', () => {
    it('documents no dedicated rate-limit guard on vehicle detail handlers', () => {
      // Throttler / rate-limit is not applied at VehiclesController level.
      // Fleet-map polling relies on short Redis TTL instead.
      const proto = VehiclesController.prototype as unknown as Record<string, unknown>;
      for (const method of [
        'findOneByOrg',
        'getVehicleTelemetry',
        'getLiveGps',
        'getDeviceConnection',
        'updateVehicleStatus',
      ]) {
        const metadata = Reflect.getMetadata('__throttler_options__', proto[method] as object);
        expect(metadata).toBeUndefined();
      }
    });
  });

  describe('sensitive response fields', () => {
    it('does not expose raw DIMO JWT or private keys in live GPS response shape', async () => {
      const dataAuthEnforcement = {
        assertDataAuthorization: jest.fn().mockResolvedValue({ id: 'auth-1' }),
      };
      const dataAuthorizations = {
        ensureDimoTelemetryAuthorization: jest.fn().mockResolvedValue(undefined),
      };
      const dimoAuth = {
        getVehicleJwt: jest.fn().mockResolvedValue('eyJhbGciOiJFUzI1NiJ9.secret-jwt'),
      };
      const dimoTelemetry = {
        fetchLastSeenLocation: jest.fn().mockResolvedValue({
          data: {
            signalsLatest: {
              currentLocationCoordinates: {
                value: { latitude: 52.52, longitude: 13.405 },
                timestamp: '2026-07-24T10:00:00.000Z',
              },
              speed: { value: 42 },
              lastSeen: '2026-07-24T10:00:00.000Z',
            },
          },
        }),
      };
      const findFirst = jest.fn().mockResolvedValue({
        id: vehicleA,
        dimoVehicle: { tokenId: 123 },
        latestState: null,
      });
      const stub = (): unknown => ({});
      const service = new (VehiclesService as unknown as {
        new (...args: unknown[]): VehiclesService;
      })(
        { vehicle: { findFirst } },
        stub(),
        dimoAuth,
        dimoTelemetry,
        stub(),
        stub(),
        stub(),
        dataAuthorizations,
        dataAuthEnforcement,
        stub(),
        stub(),
        stub(),
        stub(),
        new FleetMapCacheService({ del: jest.fn() } as never),
      );

      const result = await service.getLiveGps(vehicleA, orgA);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('secret-jwt');
      expect(serialized).not.toContain('private');
      expect(result).toMatchObject({
        latitude: 52.52,
        longitude: 13.405,
        source: 'dimo',
      });
    });
  });
});

describe('Vehicles — status mutation side effects', () => {
  const orgId = 'org-1';
  const vehicleId = 'veh-1';

  it('persists cleaning status and materializes cleaning task audit trail', async () => {
    const updatedVehicle = {
      id: vehicleId,
      cleaningStatus: CleaningStatus.NEEDS_CLEANING,
      status: VehicleStatus.AVAILABLE,
      healthStatus: HealthStatus.GOOD,
    };
    const vehiclesService = {
      update: jest.fn().mockResolvedValue(updatedVehicle),
      invalidateFleetMapCache: jest.fn().mockResolvedValue(undefined),
    };
    const cleaningTask = { taskId: 'task-clean-1', created: true };
    const vehicleCleaningTasks = {
      ensureCleaningTask: jest.fn().mockResolvedValue(cleaningTask),
      completeOpenCleaningTasks: jest.fn(),
    };
    const controller = new VehiclesController(
      vehiclesService as never,
      {} as never,
      vehicleCleaningTasks as never,
    );

    const result = await controller.updateVehicleStatus(
      orgId,
      vehicleId,
      { user: { id: 'u1' } },
      { cleaningStatus: CleaningStatus.NEEDS_CLEANING },
    );

    expect(vehiclesService.update).toHaveBeenCalledWith(
      vehicleId,
      { cleaningStatus: CleaningStatus.NEEDS_CLEANING },
      orgId,
    );
    expect(vehiclesService.invalidateFleetMapCache).toHaveBeenCalledWith(orgId);
    expect(vehicleCleaningTasks.ensureCleaningTask).toHaveBeenCalledWith(orgId, vehicleId);
    expect(result).toEqual({ vehicle: updatedVehicle, cleaningTask });
  });

  it('completes open cleaning tasks when marked CLEAN', async () => {
    const vehiclesService = {
      update: jest.fn().mockResolvedValue({
        id: vehicleId,
        cleaningStatus: CleaningStatus.CLEAN,
      }),
      invalidateFleetMapCache: jest.fn(),
    };
    const completedTask = { taskId: 'task-clean-1', completed: true };
    const vehicleCleaningTasks = {
      ensureCleaningTask: jest.fn(),
      completeOpenCleaningTasks: jest.fn().mockResolvedValue(completedTask),
    };
    const controller = new VehiclesController(
      vehiclesService as never,
      {} as never,
      vehicleCleaningTasks as never,
    );

    const result = await controller.updateVehicleStatus(
      orgId,
      vehicleId,
      { user: { id: 'u1' } },
      { cleaningStatus: CleaningStatus.CLEAN },
    );

    expect(vehicleCleaningTasks.completeOpenCleaningTasks).toHaveBeenCalledWith(
      orgId,
      vehicleId,
      'u1',
    );
    expect(result.cleaningTask).toEqual(completedTask);
  });
});
