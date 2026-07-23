import { NotFoundException } from '@nestjs/common';
import { LiveGpsEnforcementService } from './live-gps-enforcement.service';
import { LiveGpsAccessDeniedException } from './live-gps-enforcement.exceptions';
import {
  LIVE_GPS_PURPOSE,
  LIVE_GPS_SERVICE_IDENTITY,
} from './live-gps-enforcement.constants';
import { DataAuthorizationDeniedException } from '../data-authorization.exceptions';

describe('LiveGpsEnforcementService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
  };
  const redis = { del: jest.fn().mockResolvedValue(1) };
  const dataAuthorizations = {
    ensureDimoTelemetryAuthorization: jest.fn().mockResolvedValue(undefined),
  };
  const enforcement = { assertDataAuthorization: jest.fn() };
  const authorizationDecision = {
    invalidateOrganizationCache: jest.fn().mockReturnValue(2),
  };

  let service: LiveGpsEnforcementService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    enforcement.assertDataAuthorization.mockResolvedValue({ id: 'auth-1' });
    service = new LiveGpsEnforcementService(
      prisma as never,
      redis as never,
      dataAuthorizations as never,
      enforcement as never,
      authorizationDecision as never,
    );
  });

  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    purpose: LIVE_GPS_PURPOSE.LIVE_MAP,
    serviceIdentity: LIVE_GPS_SERVICE_IDENTITY.VEHICLES_LIVE_GPS_API,
    correlationId: 'corr-1',
  };

  it('rejects missing purpose', async () => {
    await expect(
      service.assertVehicleGpsRead({ ...baseCtx, purpose: '' as never }),
    ).rejects.toBeInstanceOf(LiveGpsAccessDeniedException);
  });

  it('rejects missing service identity', async () => {
    await expect(
      service.assertVehicleGpsRead({ ...baseCtx, serviceIdentity: '' as never }),
    ).rejects.toBeInstanceOf(LiveGpsAccessDeniedException);
  });

  it('enforces tenant vehicle scope', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.assertVehicleGpsRead(baseCtx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delegates full authorization decision with GPS_LOCATION READ', async () => {
    await service.assertVehicleGpsRead(baseCtx);

    expect(enforcement.assertDataAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        vehicleId: 'veh-1',
        dataCategory: 'GPS_LOCATION',
        purpose: 'LIVE_MAP',
        processorId: LIVE_GPS_SERVICE_IDENTITY.VEHICLES_LIVE_GPS_API,
        correlationId: 'corr-1',
      }),
    );
  });

  it('maps enforcement deny to GPS_ACCESS_DENIED without location details', async () => {
    enforcement.assertDataAuthorization.mockRejectedValue(
      new DataAuthorizationDeniedException('denied', 'DATA_AUTHORIZATION_DENIED', {
        blockingReasons: ['POLICY_UNCLEAR'],
      }),
    );

    await expect(service.assertVehicleGpsRead(baseCtx)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GPS_ACCESS_DENIED',
        reasonCode: 'POLICY_UNCLEAR',
      }),
    });
  });

  it('redacts coordinates when batch gate denies vehicle', async () => {
    jest.spyOn(service, 'isVehicleGpsReadAllowed').mockResolvedValue(false);

    const result = await service.applyFleetMapGate('org-1', [
      { id: 'veh-1', latitude: 52.5, longitude: 13.4 },
    ]);

    expect(result[0].latitude).toBeNull();
    expect(result[0].longitude).toBeNull();
  });

  it('invalidates org decision cache and fleet-map redis on revocation hook', async () => {
    await service.invalidateOrgGpsCaches('org-1');

    expect(authorizationDecision.invalidateOrganizationCache).toHaveBeenCalledWith('org-1');
    expect(redis.del).toHaveBeenCalledWith('fleet-map:org-1:v1');
  });

  it('requires master-admin service identity for support access', async () => {
    await expect(
      service.assertVehicleGpsRead({
        ...baseCtx,
        supportAccess: true,
        serviceIdentity: LIVE_GPS_SERVICE_IDENTITY.FLEET_MAP_API,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ reasonCode: 'SUPPORT_IDENTITY_REQUIRED' }),
    });
  });
});
