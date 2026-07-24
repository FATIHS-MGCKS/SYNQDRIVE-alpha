import { NotFoundException } from '@nestjs/common';
import { GpsPositionAccessService } from './gps-position-access.service';
import { DataAuthorizationDeniedException } from './data-authorization.exceptions';
import { VehicleDetailAccessAuditAction } from '@modules/activity-log/vehicle-detail-access-audit.service';

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
  const vehicleDetailAudit = { record: jest.fn() };

  let service: GpsPositionAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GpsPositionAccessService(
      prisma as never,
      dataAuthorizations as never,
      dataAuthEnforcement as never,
      audit as never,
      vehicleDetailAudit as never,
    );
  });

  describe('assertVehicleGpsAccess', () => {
    const baseRequest = {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      purpose: 'LIVE_MAP' as const,
      actorUserId: 'user-1',
      route: 'GET /live-gps',
      requestId: 'req-abc',
    };

    it('allows access for vehicle in the correct organization', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      dataAuthEnforcement.assertDataAuthorization.mockResolvedValue({ id: 'auth-1' });

      await expect(service.assertVehicleGpsAccess(baseRequest)).resolves.toBeUndefined();

      expect(vehicleDetailAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: VehicleDetailAccessAuditAction.LIVE_GPS_READ,
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          actorUserId: 'user-1',
          requestId: 'req-abc',
          outcome: 'allowed',
          deduplicate: true,
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

    it('audits data authorization denial without logging coordinates', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      dataAuthEnforcement.assertDataAuthorization.mockRejectedValue(
        new DataAuthorizationDeniedException('No active data authorization covers this access'),
      );

      await expect(service.assertVehicleGpsAccess(baseRequest)).rejects.toBeInstanceOf(
        DataAuthorizationDeniedException,
      );

      expect(vehicleDetailAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: VehicleDetailAccessAuditAction.LIVE_GPS_READ,
          outcome: 'denied',
          errorClass: 'DATA_AUTHORIZATION_DENIED',
        }),
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
        actorUserId: 'user-1',
      });

      expect(vehicleDetailAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: VehicleDetailAccessAuditAction.FLEET_MAP_READ,
          outcome: 'allowed',
          metadata: expect.objectContaining({ accessKind: 'org_fleet', fromCache: true }),
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

      expect(vehicleDetailAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: VehicleDetailAccessAuditAction.FLEET_MAP_READ,
          outcome: 'denied',
          errorClass: 'DATA_AUTHORIZATION_DENIED',
        }),
      );
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
      expect(vehicleDetailAudit.record).not.toHaveBeenCalled();
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
