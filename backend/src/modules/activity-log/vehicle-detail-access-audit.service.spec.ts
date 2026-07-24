import { ActivityAction, ActivityEntity } from '@prisma/client';
import { AuditService } from './audit.service';
import {
  VehicleDetailAccessAuditAction,
  VehicleDetailAccessAuditService,
} from './vehicle-detail-access-audit.service';

describe('VehicleDetailAccessAuditService', () => {
  const audit = { record: jest.fn().mockResolvedValue('log-1') };
  let service: VehicleDetailAccessAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VehicleDetailAccessAuditService(audit as never);
  });

  it('records allowed reads with structured metadata and request correlation', () => {
    service.record({
      auditAction: VehicleDetailAccessAuditAction.LIVE_GPS_READ,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      actorUserId: 'user-1',
      purpose: 'LIVE_MAP',
      route: 'GET /live-gps',
      requestId: 'req-42',
      outcome: 'allowed',
      deduplicate: false,
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        actorOrganizationId: 'org-1',
        action: ActivityAction.SYNC,
        entity: ActivityEntity.VEHICLE,
        entityId: 'veh-1',
        route: 'GET /live-gps',
        metaJson: expect.objectContaining({
          auditAction: VehicleDetailAccessAuditAction.LIVE_GPS_READ,
          purpose: 'LIVE_MAP',
          outcome: 'allowed',
          requestId: 'req-42',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          recordedAt: expect.any(String),
        }),
      }),
    );
  });

  it('records denials as AUTH_FAIL with WARN level by default', () => {
    service.record({
      auditAction: VehicleDetailAccessAuditAction.DATA_AUTHORIZATION_DENIED,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      outcome: 'denied',
      errorClass: 'DATA_AUTHORIZATION_DENIED',
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ActivityAction.AUTH_FAIL,
        level: 'WARN',
        metaJson: expect.objectContaining({
          outcome: 'denied',
          errorClass: 'DATA_AUTHORIZATION_DENIED',
        }),
      }),
    );
  });

  it('deduplicates repeated allowed reads within the window', () => {
    const input = {
      auditAction: VehicleDetailAccessAuditAction.TELEMETRY_READ,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      actorUserId: 'user-1',
      purpose: 'TECHNICAL_OVERVIEW',
      outcome: 'allowed' as const,
      deduplicate: true,
    };

    service.record(input);
    service.record(input);

    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('builds request context including correlation id', () => {
    const ctx = VehicleDetailAccessAuditService.contextFromRequest(
      {
        user: { id: 'user-1' },
        requestId: 'req-99',
        ip: '10.0.0.1',
        headers: { 'user-agent': 'jest' },
        method: 'GET',
        route: { path: '/organizations/:orgId/vehicles/:vehicleId/live-gps' },
      },
      'org-1',
      'GET /organizations/:orgId/vehicles/:vehicleId/live-gps',
    );

    expect(ctx).toEqual(
      expect.objectContaining({
        actorUserId: 'user-1',
        organizationId: 'org-1',
        requestId: 'req-99',
        ipAddress: '10.0.0.1',
        userAgent: 'jest',
      }),
    );
  });
});
