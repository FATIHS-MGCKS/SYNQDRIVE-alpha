import { NotFoundException } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { GpsPositionAccessService } from './gps-position-access.service';
import { DataAuthorizationDeniedException } from './data-authorization.exceptions';

describe('GpsPositionAccessService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
  };
  const dataAuthorizations = {
    ensureDimoTelemetryAuthorization: jest.fn().mockResolvedValue(undefined),
  };
  const dataAuthEnforcement = {
    assertDataAuthorization: jest.fn(),
    assertOrganizationDataAuthorization: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  let service: GpsPositionAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GpsPositionAccessService(
      prisma as never,
      dataAuthorizations as never,
      dataAuthEnforcement as never,
      audit as never,
    );
  });

  describe('assertVehicleGpsAccess', () => {
    const baseRequest = {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      purpose: 'LIVE_MAP' as const,
      actorUserId: 'user-1',
      route: 'GET /live-gps',
    };

    it('allows access for vehicle in the correct organization', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      dataAuthEnforcement.assertDataAuthorization.mockResolvedValue({ id: 'auth-1' });

      await expect(service.assertVehicleGpsAccess(baseRequest)).resolves.toBeUndefined();

      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
        where: { id: 'veh-1', organizationId: 'org-1' },
        select: { id: true },
      });
      expect(dataAuthorizations.ensureDimoTelemetryAuthorization).toHaveBeenCalledWith('org-1');
      expect(dataAuthEnforcement.assertDataAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-1',
          vehicleId: 'veh-1',
          sourceType: 'DIMO',
          dataCategory: 'GPS_LOCATION',
          purpose: 'LIVE_MAP',
          processorType: 'SYNQDRIVE',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          actorOrganizationId: 'org-1',
          action: ActivityAction.SYNC,
          entity: ActivityEntity.VEHICLE,
          entityId: 'veh-1',
        }),
      );
    });

    it('denies foreign organization (vehicle not in org)', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.assertVehicleGpsAccess(baseRequest)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(dataAuthEnforcement.assertDataAuthorization).not.toHaveBeenCalled();
    });

    it('denies when vehicle does not exist', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(
        service.assertVehicleGpsAccess({
          ...baseRequest,
          vehicleId: 'missing',
        }),
      ).rejects.toThrow('Vehicle not found');
    });

    it('denies when data authorization is disabled', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      dataAuthEnforcement.assertDataAuthorization.mockRejectedValue(
        new DataAuthorizationDeniedException('No active data authorization covers this access'),
      );

      await expect(service.assertVehicleGpsAccess(baseRequest)).rejects.toBeInstanceOf(
        DataAuthorizationDeniedException,
      );
    });

    it('denies when purpose does not match consent', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      dataAuthEnforcement.assertDataAuthorization.mockRejectedValue(
        new DataAuthorizationDeniedException('wrong purpose'),
      );

      await expect(
        service.assertVehicleGpsAccess({
          ...baseRequest,
          purpose: 'TRIPS',
        }),
      ).rejects.toBeInstanceOf(DataAuthorizationDeniedException);

      expect(dataAuthEnforcement.assertDataAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          dataCategory: 'TRIP_DATA',
          purpose: 'TRIPS',
        }),
      );
    });
  });

  describe('assertOrgFleetGpsAccess', () => {
    it('checks org-wide consent before fleet map reads', async () => {
      dataAuthEnforcement.assertOrganizationDataAuthorization.mockResolvedValue({ id: 'auth-org' });

      await service.assertOrgFleetGpsAccess({
        organizationId: 'org-1',
        purpose: 'FLEET_ANALYTICS',
        route: 'GET /fleet-map',
        fromCache: true,
      });

      expect(dataAuthEnforcement.assertOrganizationDataAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-1',
          dataCategory: 'GPS_LOCATION',
          purpose: 'FLEET_ANALYTICS',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metaJson: expect.objectContaining({ accessKind: 'org_fleet', fromCache: true }),
        }),
      );
    });

    it('denies fleet map when org consent is missing', async () => {
      dataAuthEnforcement.assertOrganizationDataAuthorization.mockRejectedValue(
        new DataAuthorizationDeniedException('denied'),
      );

      await expect(
        service.assertOrgFleetGpsAccess({
          organizationId: 'org-foreign',
          purpose: 'FLEET_ANALYTICS',
        }),
      ).rejects.toBeInstanceOf(DataAuthorizationDeniedException);
    });
  });

  describe('assertSystemGpsIngest', () => {
    it('allows system job with documented tenant and vehicle context', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      dataAuthEnforcement.assertDataAuthorization.mockResolvedValue({ id: 'auth-sys' });

      await service.assertSystemGpsIngest({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        systemJob: 'dimo.snapshot.poll',
        documentedPurpose: 'TECHNICAL_OVERVIEW',
      });

      expect(dataAuthEnforcement.assertDataAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-1',
          vehicleId: 'veh-1',
          dataCategory: 'TELEMETRY_DATA',
          purpose: 'TECHNICAL_OVERVIEW',
          processorType: 'INTERNAL_SYSTEM',
          trackAccess: false,
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'dimo.snapshot.poll',
          metaJson: expect.objectContaining({
            systemJob: 'dimo.snapshot.poll',
            documentedPurpose: 'TECHNICAL_OVERVIEW',
            processorType: 'INTERNAL_SYSTEM',
          }),
        }),
      );
    });

    it('denies system ingest for vehicle outside tenant', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(
        service.assertSystemGpsIngest({
          organizationId: 'org-1',
          vehicleId: 'veh-foreign',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
