import { ActivityAction, ActivityEntity } from '@prisma/client';
import { StationDomainAuditService } from './station-domain-audit.service';
import { StationDomainAuditAction } from '@shared/stations/station-domain-audit.constants';

describe('StationDomainAuditService', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    activityLog: {
      findFirst: jest.fn(),
    },
  };

  const service = new StationDomainAuditService(audit as never, prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('skips duplicate writes for the same correlationId', async () => {
    prisma.activityLog.findFirst.mockResolvedValue({ id: 'existing' });

    await service.record({
      organizationId: 'org-1',
      stationId: 'station-1',
      auditAction: StationDomainAuditAction.ACTIVATED,
      correlationId: 'corr-1',
    });

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('persists station domain audit rows via AuditService', async () => {
    prisma.activityLog.findFirst.mockResolvedValue(null);

    await service.record({
      organizationId: 'org-1',
      stationId: 'station-1',
      auditAction: StationDomainAuditAction.ACTIVATED,
      actorUserId: 'user-1',
      from: 'INACTIVE',
      to: 'ACTIVE',
      correlationId: 'corr-2',
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        actorOrganizationId: 'org-1',
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.STATION,
        entityId: 'station-1',
        metaJson: expect.objectContaining({
          auditAction: StationDomainAuditAction.ACTIVATED,
          correlationId: 'corr-2',
          from: 'INACTIVE',
          to: 'ACTIVE',
        }),
      }),
    );
  });

  it('records station updates from audit hints', async () => {
    prisma.activityLog.findFirst.mockResolvedValue(null);

    await service.recordStationUpdated({
      organizationId: 'org-1',
      stationId: 'station-1',
      auditHints: [
        { command: 'UpdateStationMasterData' },
        { command: 'UpdateStationCapabilities' },
      ],
    });

    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metaJson: expect.objectContaining({
          auditAction: StationDomainAuditAction.MASTER_DATA_UPDATED,
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metaJson: expect.objectContaining({
          auditAction: StationDomainAuditAction.OPERATIONS_UPDATED,
        }),
      }),
    );
  });

  it('writes one row per station for cross-station events', async () => {
    prisma.activityLog.findFirst.mockResolvedValue(null);

    await service.recordForStations(['station-a', 'station-b'], {
      organizationId: 'org-1',
      auditAction: StationDomainAuditAction.HOME_STATION_CHANGED,
      correlationId: 'shared-corr',
      vehicleId: 'vehicle-1',
    });

    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'station-a' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'station-b' }),
    );
  });
});
