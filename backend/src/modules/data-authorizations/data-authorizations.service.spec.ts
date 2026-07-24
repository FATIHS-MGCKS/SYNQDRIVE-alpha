import { DataAuthorizationsService } from './data-authorizations.service';
import {
  DIMO_TELEMETRY_AUTHORIZATION,
  DIMO_TELEMETRY_SYSTEM_KEY,
} from './data-authorization.constants';

describe('DataAuthorizationsService', () => {
  const audit = { record: jest.fn(), critical: jest.fn() };

  const prisma = {
    vehicle: { findMany: jest.fn(), count: jest.fn() },
    orgDataAuthorization: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    dataAuthorizationRevocationWorkflow: { findMany: jest.fn() },
    activityLog: { findMany: jest.fn() },
  };

  let service: DataAuthorizationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DataAuthorizationsService(
      prisma as any,
      audit as any,
      { invalidateOrgGpsCaches: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  describe('ensureDimoTelemetryAuthorization', () => {
    it('matches DIMO telemetry product contract', () => {
      expect(DIMO_TELEMETRY_AUTHORIZATION.title).toBe('DIMO Telemetry Authorization');
      expect(DIMO_TELEMETRY_AUTHORIZATION.sourceType).toBe('DIMO');
      expect(DIMO_TELEMETRY_AUTHORIZATION.processorType).toBe('SYNQDRIVE');
      expect(DIMO_TELEMETRY_AUTHORIZATION.processorName).toBe('SynqDrive');
      expect(DIMO_TELEMETRY_AUTHORIZATION.scope).toBe('CONNECTED_VEHICLES');
      expect(DIMO_TELEMETRY_AUTHORIZATION.riskLevel).toBe('HIGH');
      expect(DIMO_TELEMETRY_AUTHORIZATION.dataCategories).toEqual([
        'GPS_LOCATION',
        'TELEMETRY_DATA',
        'VEHICLE_IDENTITY',
        'VEHICLE_STATUS',
        'ODOMETER',
        'TRIP_DATA',
        'HEALTH_SIGNALS',
        'DTC_CODES',
      ]);
      expect(DIMO_TELEMETRY_AUTHORIZATION.purposes).toEqual([
        'LIVE_MAP',
        'TRIPS',
        'VEHICLE_HEALTH',
        'ALERTS',
        'FLEET_ANALYTICS',
        'RENTAL_ANALYTICS',
        'TECHNICAL_OVERVIEW',
      ]);
      expect(DIMO_TELEMETRY_SYSTEM_KEY).toBe('DIMO_TELEMETRY');
    });

    it('creates system authorization when DIMO vehicles exist', async () => {
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]);
      prisma.orgDataAuthorization.findUnique.mockResolvedValue(null);
      prisma.orgDataAuthorization.create.mockResolvedValue({ id: 'auth-1' });

      await service.ensureDimoTelemetryAuthorization('org-1');

      expect(prisma.orgDataAuthorization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            systemKey: DIMO_TELEMETRY_SYSTEM_KEY,
            status: 'ACTIVE',
            vehicleIds: ['v1', 'v2'],
            isSystemGenerated: true,
          }),
        }),
      );
    });

    it('does not create when no DIMO vehicles and no existing record', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.orgDataAuthorization.findUnique.mockResolvedValue(null);

      await service.ensureDimoTelemetryAuthorization('org-1');

      expect(prisma.orgDataAuthorization.create).not.toHaveBeenCalled();
    });

    it('updates vehicle list on existing system authorization', async () => {
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'v3' }]);
      prisma.orgDataAuthorization.findUnique.mockResolvedValue({
        id: 'auth-1',
        status: 'ACTIVE',
        grantedAt: new Date(),
        grantedByName: 'System',
      });
      prisma.orgDataAuthorization.update.mockResolvedValue({ id: 'auth-1' });

      await service.ensureDimoTelemetryAuthorization('org-1');

      expect(prisma.orgDataAuthorization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'auth-1' },
          data: expect.objectContaining({ vehicleIds: ['v3'] }),
        }),
      );
    });

    it('does not re-activate revoked system authorization', async () => {
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'v1' }]);
      prisma.orgDataAuthorization.findUnique.mockResolvedValue({
        id: 'auth-1',
        status: 'REVOKED',
      });
      prisma.orgDataAuthorization.update.mockResolvedValue({ id: 'auth-1' });

      await service.ensureDimoTelemetryAuthorization('org-1');

      const updateArg = prisma.orgDataAuthorization.update.mock.calls[0][0];
      expect(updateArg.data.status).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('counts active, expired, and high-risk authorizations correctly', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.orgDataAuthorization.findUnique.mockResolvedValue({
        id: 'sys',
        status: 'ACTIVE',
      });
      prisma.orgDataAuthorization.update.mockResolvedValue({});

      const past = new Date(Date.now() - 86_400_000);
      const soon = new Date(Date.now() + 7 * 86_400_000);

      prisma.orgDataAuthorization.findMany.mockResolvedValue([
        { status: 'ACTIVE', riskLevel: 'HIGH', expiresAt: null },
        { status: 'ACTIVE', riskLevel: 'LOW', expiresAt: soon },
        { status: 'ACTIVE', riskLevel: 'MEDIUM', expiresAt: past },
        { status: 'PENDING', riskLevel: 'LOW', expiresAt: null },
        { status: 'REVOKED', riskLevel: 'CRITICAL', expiresAt: null },
        { status: 'EXPIRED', riskLevel: 'LOW', expiresAt: past },
      ]);

      const stats = await service.getStats('org-1');

      expect(stats).toEqual({
        total: 6,
        active: 2,
        pending: 1,
        revoked: 1,
        expired: 2,
        highRisk: 1,
        expiringSoon: 1,
      });
    });
  });

  describe('findByOrg filters', () => {
    beforeEach(() => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.orgDataAuthorization.findUnique.mockResolvedValue({
        id: 'sys',
        status: 'ACTIVE',
      });
      prisma.orgDataAuthorization.update.mockResolvedValue({});
      prisma.dataAuthorizationRevocationWorkflow.findMany.mockResolvedValue([]);
    });

    it('applies expiringSoon server filter for active records within 30 days', async () => {
      prisma.orgDataAuthorization.findMany.mockResolvedValue([]);
      await service.findByOrg('org-1', { expiringSoon: true, limit: 25 });
      expect(prisma.orgDataAuthorization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            expiresAt: expect.objectContaining({ gt: expect.any(Date), lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('applies revokedOrExpired server filter including active past expiry', async () => {
      prisma.orgDataAuthorization.findMany.mockResolvedValue([]);
      await service.findByOrg('org-1', { revokedOrExpired: true, limit: 25 });
      expect(prisma.orgDataAuthorization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { status: 'REVOKED' },
              { status: 'EXPIRED' },
              { status: 'ACTIVE', expiresAt: { lte: expect.any(Date) } },
            ]),
          }),
        }),
      );
    });

    it('scopes revocationInProgress to legacy authorizations linked to workflows', async () => {
      prisma.dataAuthorizationRevocationWorkflow.findMany.mockResolvedValue([
        { legacyOrgAuthId: 'auth-1' },
      ]);
      prisma.orgDataAuthorization.findMany.mockResolvedValue([]);
      await service.findByOrg('org-1', { revocationInProgress: true, limit: 25 });
      expect(prisma.orgDataAuthorization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['auth-1'] } }),
        }),
      );
    });
  });
});
