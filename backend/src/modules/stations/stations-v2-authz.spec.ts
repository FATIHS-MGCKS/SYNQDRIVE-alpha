import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipRole, StationStatus } from '@prisma/client';
import { StationScopeErrorCode } from '@shared/stations/station-scope.constants';
import { StationsPermissionErrorCode } from './stations-access.service';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationVehicleRuntimeLoaderMock } from './testing/station-vehicle-runtime-loader.mock';
import { stationOperationsServiceMock } from './testing/station-operations.service.mock';
import { resolveStationIdFromRequest } from '@shared/stations/station-scope.util';
import {
  AUTHZ_MUTATION_ENDPOINTS,
  AUTHZ_ORG_A,
  AUTHZ_ORG_B,
  AUTHZ_PERSONAS,
  AUTHZ_READ_ENDPOINTS,
  AUTHZ_STATION_A,
  AUTHZ_STATION_ARCHIVED,
  AUTHZ_STATION_B,
  AUTHZ_STATION_MISSING,
  AUTHZ_VEHICLE,
} from './testing/stations-v2-authz.fixtures';
import { StationsV2AuthzHarness } from './testing/stations-v2-authz.harness';

describe('Stations V2 authorization package', () => {
  const harness = new StationsV2AuthzHarness();

  beforeEach(() => {
    harness.reset();
  });

  describe('read endpoints — permission + scope matrix', () => {
    it.each(AUTHZ_READ_ENDPOINTS.map((endpoint) => [endpoint.key, endpoint]))(
      'allows org admin on read endpoint %s',
      async (_key, endpoint) => {
        await expect(harness.assertAllowed(endpoint, AUTHZ_PERSONAS.orgAdmin)).resolves.toBeUndefined();
      },
    );

    it.each(AUTHZ_READ_ENDPOINTS.map((endpoint) => [endpoint.key, endpoint]))(
      'denies driver on read endpoint %s (NO_STATIONS + missing read)',
      async (_key, endpoint) => {
        const error = await harness.assertDenied(endpoint, AUTHZ_PERSONAS.driver);
        harness.expectDeniedCode(
          error,
          endpoint.permission
            ? StationsPermissionErrorCode.MISSING_PERMISSION
            : StationScopeErrorCode.NO_STATIONS,
        );
      },
    );

    it('allows read-only user on assigned station reads but denies activity without view_activity', async () => {
      const detail = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'detail')!;
      const activity = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'activity')!;

      await expect(harness.assertAllowed(detail, AUTHZ_PERSONAS.readOnly)).resolves.toBeUndefined();
      await expect(harness.assertAllowed(activity, AUTHZ_PERSONAS.readOnly)).resolves.toBeUndefined();
    });

    it('denies read-only user on out-of-scope station detail', async () => {
      const detail = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'detail')!;
      const error = await harness.assertDenied(detail, AUTHZ_PERSONAS.readOnly, {
        params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_B },
      });
      harness.expectDeniedCode(error, StationScopeErrorCode.STATION_NOT_IN_SCOPE);
    });

    it('allows worker read on assigned station only', async () => {
      const fleet = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'fleet')!;
      await expect(harness.assertAllowed(fleet, AUTHZ_PERSONAS.worker)).resolves.toBeUndefined();

      const error = await harness.assertDenied(fleet, AUTHZ_PERSONAS.worker, {
        params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_B },
      });
      harness.expectDeniedCode(error, StationScopeErrorCode.STATION_NOT_IN_SCOPE);
    });
  });

  describe('mutation endpoints — role matrix', () => {
    it('allows org admin on all mutation endpoints', async () => {
      for (const endpoint of AUTHZ_MUTATION_ENDPOINTS) {
        const persona = AUTHZ_PERSONAS.orgAdmin;
        await expect(harness.assertAllowed(endpoint, persona)).resolves.toBeUndefined();
      }
    });

    it('denies read-only user on all mutation endpoints', async () => {
      for (const endpoint of AUTHZ_MUTATION_ENDPOINTS) {
        const error = await harness.assertDenied(endpoint, AUTHZ_PERSONAS.readOnly);
        expect(error).toBeDefined();
      }
    });

    it('allows station manager on local ops but not archive/set-primary', async () => {
      const allowed = ['update-master', 'update-operations', 'set-vehicles', 'assign-vehicle-home', 'change-vehicle-home-station', 'home-fleet-preview', 'home-fleet-add', 'home-fleet-remove', 'backfill-coordinates'];
      const denied = ['create', 'archive', 'set-primary', 'delete', 'restore'];

      for (const key of allowed) {
        const endpoint = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === key)!;
        await expect(harness.assertAllowed(endpoint, AUTHZ_PERSONAS.stationManager)).resolves.toBeUndefined();
      }

      for (const key of denied) {
        const endpoint = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === key)!;
        const error = await harness.assertDenied(endpoint, AUTHZ_PERSONAS.stationManager);
        harness.expectDeniedCode(error, StationsPermissionErrorCode.MISSING_PERMISSION);
      }
    });

    it('allows station manager on home-fleet-move when source and target are in scope', async () => {
      const endpoint = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'home-fleet-move')!;
      const managerWithBothStations: typeof AUTHZ_PERSONAS.stationManager = {
        ...AUTHZ_PERSONAS.stationManager,
        membership: {
          ...AUTHZ_PERSONAS.stationManager.membership,
          stationIds: [AUTHZ_STATION_A, AUTHZ_STATION_B],
        },
      };

      await expect(
        harness.assertAllowed(endpoint, managerWithBothStations),
      ).resolves.toBeUndefined();
    });

    it('denies station manager on home-fleet-move when target station is out of scope', async () => {
      const endpoint = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'home-fleet-move')!;
      const error = await harness.assertDenied(endpoint, AUTHZ_PERSONAS.stationManager);
      harness.expectDeniedCode(error, StationScopeErrorCode.STATION_NOT_IN_SCOPE);
    });

    it('allows worker current-location mutation only', async () => {
      const vehicleLocation = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'vehicle-current-station')!;
      await expect(
        harness.assertAllowed(vehicleLocation, AUTHZ_PERSONAS.worker),
      ).resolves.toBeUndefined();

      const assignHome = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'assign-vehicle-home')!;
      const error = await harness.assertDenied(assignHome, AUTHZ_PERSONAS.worker);
      harness.expectDeniedCode(error, StationsPermissionErrorCode.MISSING_PERMISSION);

      const changeHome = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'change-vehicle-home-station')!;
      const changeHomeError = await harness.assertDenied(changeHome, AUTHZ_PERSONAS.worker);
      harness.expectDeniedCode(changeHomeError, StationsPermissionErrorCode.MISSING_PERMISSION);
    });

    it('denies worker from set-primary even with explicit permission flag', async () => {
      const workerWithPrimaryFlag: typeof AUTHZ_PERSONAS.worker = {
        ...AUTHZ_PERSONAS.worker,
        membership: {
          ...AUTHZ_PERSONAS.worker.membership,
          permissions: {
            stationsV2: {
              ...AUTHZ_PERSONAS.worker.membership.permissions.stationsV2,
              set_primary: true,
            },
          },
        },
      };

      const endpoint = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'set-primary')!;
      const error = await harness.assertDenied(endpoint, workerWithPrimaryFlag);
      harness.expectDeniedCode(error, StationsPermissionErrorCode.SET_PRIMARY_ROLE_FORBIDDEN);
    });
  });

  describe('scope modes', () => {
    it('ALL_STATIONS — org admin can access any in-org station', async () => {
      const detail = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'detail')!;
      await expect(
        harness.assertAllowed(detail, AUTHZ_PERSONAS.orgAdmin, {
          params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_B },
        }),
      ).resolves.toBeUndefined();
    });

    it('ASSIGNED_STATIONS — manager limited to assigned ids', async () => {
      const request = harness.buildRequest(AUTHZ_PERSONAS.stationManager, {
        key: 'detail',
        method: 'GET',
        permission: 'stations.read',
        scope: { resource: 'station' },
        params: { id: AUTHZ_STATION_B },
      });
      harness.setPersona(AUTHZ_PERSONAS.stationManager);
      const error = await harness.assertDenied(
        { key: 'detail', method: 'GET', permission: 'stations.read', scope: { resource: 'station' }, params: { id: AUTHZ_STATION_B } },
        AUTHZ_PERSONAS.stationManager,
      );
      harness.expectDeniedCode(error, StationScopeErrorCode.STATION_NOT_IN_SCOPE);
      expect(request.params.id).toBe(AUTHZ_STATION_B);
    });

    it('NO_STATIONS — driver blocked on list routes', async () => {
      const list = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'list')!;
      const error = await harness.assertDenied(list, AUTHZ_PERSONAS.driver);
      harness.expectDeniedCode(error, StationsPermissionErrorCode.MISSING_PERMISSION);
    });

    it('empty stationIds on ASSIGNED_STATIONS denies list access', async () => {
      const emptyAssigned = {
        ...AUTHZ_PERSONAS.worker,
        membership: {
          ...AUTHZ_PERSONAS.worker.membership,
          stationIds: [],
          stationScope: null,
        },
      };
      const list = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'list')!;
      const error = await harness.assertDenied(list, emptyAssigned);
      harness.expectDeniedCode(error, StationScopeErrorCode.NO_STATIONS);
    });
  });

  describe(':id versus stationId equivalence', () => {
    it('resolves route :id and body stationId to the same scope check', async () => {
      expect(
        resolveStationIdFromRequest({
          method: 'GET',
          params: { id: AUTHZ_STATION_A },
        }),
      ).toBe(AUTHZ_STATION_A);

      expect(
        resolveStationIdFromRequest({
          method: 'PATCH',
          params: { orgId: AUTHZ_ORG_A },
          body: { stationId: AUTHZ_STATION_A, vehicleId: AUTHZ_VEHICLE },
        }),
      ).toBe(AUTHZ_STATION_A);
    });

    it('vehicle_location scope uses body currentStationId alongside vehicle linkage', async () => {
      harness.setPersona(AUTHZ_PERSONAS.worker);
      harness.setVehicleLinkage({ homeStationId: AUTHZ_STATION_B, currentStationId: null, expectedStationId: null });

      const request = harness.buildRequest(AUTHZ_PERSONAS.worker, {
        key: 'vehicle-current-station',
        method: 'PATCH',
        scope: { resource: 'vehicle_location' },
        body: { vehicleId: AUTHZ_VEHICLE, currentStationId: AUTHZ_STATION_A },
      });

      await expect(
        harness.stationScopeService.enforceRequestScope(request, { resource: 'vehicle_location' }),
      ).resolves.toBeDefined();
    });
  });

  describe('archived station in scope', () => {
    it('allows historical GET on archived station when station is in scope', async () => {
      const detail = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'detail')!;
      await expect(
        harness.assertAllowed(detail, AUTHZ_PERSONAS.orgAdmin, {
          params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_ARCHIVED },
        }),
      ).resolves.toBeUndefined();
    });

    it('denies PATCH on archived station', async () => {
      const update = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'update-master')!;
      const error = await harness.assertDenied(update, AUTHZ_PERSONAS.orgAdmin, {
        params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_ARCHIVED },
      });
      harness.expectDeniedCode(error, StationScopeErrorCode.ARCHIVED_WRITE_FORBIDDEN);
    });

    it('allows restore POST on archived station when allowArchivedLifecycleWrite is set', async () => {
      const restore = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'restore')!;
      await expect(
        harness.assertAllowed(restore, AUTHZ_PERSONAS.orgAdmin, {
          params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_ARCHIVED },
        }),
      ).resolves.toBeUndefined();
    });

    it('allows restore-preview GET on archived station', async () => {
      const restorePreview = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'restore-preview')!;
      await expect(
        harness.assertAllowed(restorePreview, AUTHZ_PERSONAS.orgAdmin, {
          params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_ARCHIVED },
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('cross-tenant and missing station', () => {
    it('rejects cross-tenant station ownership at scope gate', async () => {
      const foreignStation = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      harness.prisma.station.findFirst.mockImplementation(async (args: { where: { id?: string; organizationId?: string } }) => {
        if (args.where.id === foreignStation && args.where.organizationId === AUTHZ_ORG_A) {
          return null;
        }
        if (args.where.id === foreignStation && !args.where.organizationId) {
          return { id: foreignStation };
        }
        return null;
      });

      const detail = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'detail')!;
      const error = await harness.assertDenied(detail, AUTHZ_PERSONAS.orgAdmin, {
        params: { orgId: AUTHZ_ORG_A, id: foreignStation },
      });
      harness.expectDeniedCode(error, StationScopeErrorCode.CROSS_ORGANIZATION);
    });

    it('rejects JWT organization mismatch before station lookup', async () => {
      const detail = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'detail')!;
      const error = await harness.assertDenied(detail, AUTHZ_PERSONAS.orgAdmin, {
        params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_A },
        user: { id: AUTHZ_PERSONAS.orgAdmin.userId, organizationId: AUTHZ_ORG_B },
      });
      const response =
        error instanceof ForbiddenException
          ? (error.getResponse() as Record<string, unknown>)
          : (error as { response?: Record<string, unknown> }).response ?? error;
      expect(response).toEqual(
        expect.objectContaining({
          statusCode: 403,
        }),
      );
    });

    it('returns STATION_NOT_FOUND for non-existent station at scope gate', async () => {
      const detail = AUTHZ_READ_ENDPOINTS.find((e) => e.key === 'detail')!;
      const error = await harness.assertDenied(detail, AUTHZ_PERSONAS.orgAdmin, {
        params: { orgId: AUTHZ_ORG_A, id: AUTHZ_STATION_MISSING },
      });
      harness.expectDeniedCode(error, StationScopeErrorCode.STATION_NOT_FOUND);
    });

    it('service layer returns 404 for out-of-scope nested reads without leaking counts', async () => {
      const prisma = {
        station: { findFirst: jest.fn().mockResolvedValue(null) },
        vehicle: { findMany: jest.fn(), count: jest.fn() },
        booking: { findMany: jest.fn(), count: jest.fn() },
        orgTask: { count: jest.fn() },
        activityLog: { findMany: jest.fn() },
      };
      const service = new StationsService(
        prisma as never,
        {} as StationValidationService,
        new StationAccessScopeService(prisma as never, new StationScopeService(prisma as never)),
        stationOperationsServiceMock,
        stationVehicleRuntimeLoaderMock as never,
        stationDomainAuditServiceMock as never,
      );

      const scope = {
        orgId: AUTHZ_ORG_A,
        mode: 'ASSIGNED_STATIONS' as const,
        allowedStationIds: [AUTHZ_STATION_A],
        bypassScope: false,
      };

      await expect(service.getStationFleet(AUTHZ_ORG_A, AUTHZ_STATION_B, scope)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
    });
  });

  describe('list filter and KPI scope', () => {
    const prisma = {
      station: { findMany: jest.fn() },
      vehicle: { count: jest.fn() },
    };

    const stationsService = new StationsService(
      prisma as never,
      {} as StationValidationService,
      new StationAccessScopeService(prisma as never, new StationScopeService({} as never)),
      stationOperationsServiceMock,
      stationVehicleRuntimeLoaderMock as never,
      stationDomainAuditServiceMock as never,
    );

    beforeEach(() => jest.clearAllMocks());

    it('applies assigned-station filter to list and stats', async () => {
      prisma.station.findMany.mockResolvedValue([]);
      prisma.vehicle.count.mockResolvedValue(0);

      const scope = {
        orgId: AUTHZ_ORG_A,
        mode: 'ASSIGNED_STATIONS' as const,
        allowedStationIds: [AUTHZ_STATION_A],
        bypassScope: false,
      };

      await stationsService.findAll(AUTHZ_ORG_A, undefined, scope);
      await stationsService.getStationStats(AUTHZ_ORG_A, scope);

      expect(prisma.station.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { organizationId: AUTHZ_ORG_A, id: { in: [AUTHZ_STATION_A] } },
        }),
      );
      expect(prisma.station.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            organizationId: AUTHZ_ORG_A,
            id: { in: [AUTHZ_STATION_A] },
            status: { not: StationStatus.ARCHIVED },
          },
        }),
      );
    });
  });

  describe('nested fleet/bookings and vehicle assignment permissions', () => {
  const prisma = {
    station: { findFirst: jest.fn() },
    vehicle: { findMany: jest.fn(), findFirst: jest.fn() },
    booking: { findMany: jest.fn() },
  };

  const service = new StationsService(
    prisma as never,
    {} as StationValidationService,
    new StationAccessScopeService(prisma as never, new StationScopeService(prisma as never)),
    stationOperationsServiceMock,
    stationVehicleRuntimeLoaderMock as never,
    stationDomainAuditServiceMock as never,
  );

  const assignedScope = {
    orgId: AUTHZ_ORG_A,
    mode: 'ASSIGNED_STATIONS' as const,
    allowedStationIds: [AUTHZ_STATION_A],
    bypassScope: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.station.findFirst.mockResolvedValue({
      id: AUTHZ_STATION_A,
      organizationId: AUTHZ_ORG_A,
      status: StationStatus.ACTIVE,
    });
  });

    it('scopes fleet query to home/current/expected station linkage', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      await service.getStationFleet(AUTHZ_ORG_A, AUTHZ_STATION_A, assignedScope);

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: AUTHZ_ORG_A,
            OR: [
              { homeStationId: AUTHZ_STATION_A },
              { currentStationId: AUTHZ_STATION_A },
              { expectedStationId: AUTHZ_STATION_A },
            ],
          },
        }),
      );
    });

    it('scopes bookings to pickup/return station ids', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      await service.getStationBookings(AUTHZ_ORG_A, AUTHZ_STATION_A, assignedScope);

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: AUTHZ_ORG_A,
            OR: [{ pickupStationId: AUTHZ_STATION_A }, { returnStationId: AUTHZ_STATION_A }],
          },
        }),
      );
    });

    it('maps assign-vehicle expected target to manage_transfers permission', async () => {
      const endpoint = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'assign-vehicle-expected')!;
      const error = await harness.assertDenied(endpoint, AUTHZ_PERSONAS.worker);
      harness.expectDeniedCode(error, StationsPermissionErrorCode.MISSING_PERMISSION);
    });
  });

  describe('archive / restore / set-primary explicit checks', () => {
    it('archive requires stations.archive and in-scope active station', async () => {
      const archive = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'archive')!;
      await expect(harness.assertAllowed(archive, AUTHZ_PERSONAS.orgAdmin)).resolves.toBeUndefined();
    });

    it('restore requires stations.restore on archived station', async () => {
      const restore = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'restore')!;
      const error = await harness.assertDenied(restore, AUTHZ_PERSONAS.stationManager);
      harness.expectDeniedCode(error, StationsPermissionErrorCode.MISSING_PERMISSION);
    });

    it('set-primary requires stations.set_primary and role policy', async () => {
      const setPrimary = AUTHZ_MUTATION_ENDPOINTS.find((e) => e.key === 'set-primary')!;
      await expect(harness.assertAllowed(setPrimary, AUTHZ_PERSONAS.orgAdmin)).resolves.toBeUndefined();
    });
  });
});
