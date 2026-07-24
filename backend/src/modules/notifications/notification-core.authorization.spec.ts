import { NotificationCoreService } from './notification-core.service';
import { NotificationEnforcementService } from '@modules/data-authorizations/notification-enforcement/notification-enforcement.service';
import { NotificationSeverity as DomainSeverity } from './notification.enums';
import type { NotificationCandidate } from './notification.types';

describe('NotificationCoreService authorization', () => {
  function buildCandidate(overrides: Partial<NotificationCandidate> = {}): NotificationCandidate {
    return {
      organizationId: 'org-1',
      eventType: 'BRAKE_CRITICAL',
      eventKind: 'STATE' as NotificationCandidate['eventKind'],
      domain: 'VEHICLE_HEALTH' as NotificationCandidate['domain'],
      severity: DomainSeverity.CRITICAL as NotificationCandidate['severity'],
      entityType: 'VEHICLE' as NotificationCandidate['entityType'],
      entityId: 'veh-1',
      conditionCode: 'brake_critical',
      sourceType: 'DASHBOARD_INSIGHT' as NotificationCandidate['sourceType'],
      sourceRef: 'ref-1',
      occurredAt: new Date('2026-07-23T12:00:00.000Z'),
      titleKey: 'notification.title.brakeCritical',
      bodyKey: 'notification.body.brakeCritical',
      templateParams: { label: 'AB-123', wearPct: 8 },
      actionType: 'OPEN_VEHICLE' as NotificationCandidate['actionType'],
      actionTarget: { type: 'OPEN_VEHICLE' as NotificationCandidate['actionType'], vehicleId: 'veh-1' },
      resolutionPolicy: {
        eventKind: 'STATE' as NotificationCandidate['eventKind'],
        autoResolveWhenConditionClears: true,
      },
      ...overrides,
    };
  }

  it('skips ingest when authorization denies', async () => {
    const enforcement = {
      extractVehicleIdFromCandidate: jest.fn().mockReturnValue('veh-1'),
      checkIngest: jest.fn().mockResolvedValue({
        mayProceed: false,
        reasonCode: 'DPIA_MISSING',
        correlationId: 'corr-deny',
        auditEventId: null,
        gateKind: 'HEALTH_ALERT',
      }),
    } as unknown as NotificationEnforcementService;

    const repository = {
      runTransaction: jest.fn(),
      findAnyActiveByFingerprint: jest.fn(),
    };
    const engineConfig = { isV2Enabled: () => true };
    const service = new NotificationCoreService(
      repository as never,
      engineConfig as never,
      {} as never,
      {} as never,
      {} as never,
      enforcement,
    );

    const result = await service.ingestCandidate(buildCandidate());
    expect(result.operation).toBe('skipped_auth_denied');
    expect(result.reason).toBe('DPIA_MISSING');
    expect(repository.runTransaction).not.toHaveBeenCalled();
  });

  it('blocks ingest when upstream derived data denied', async () => {
    const enforcement = {
      extractVehicleIdFromCandidate: jest.fn().mockReturnValue('veh-1'),
      checkIngest: jest.fn().mockResolvedValue({
        mayProceed: false,
        reasonCode: 'NOTIFICATION_DERIVED_DATA_BLOCKED',
        correlationId: 'corr-upstream',
        auditEventId: null,
        gateKind: 'HEALTH_ALERT',
      }),
    } as unknown as NotificationEnforcementService;

    const repository = { runTransaction: jest.fn() };
    const engineConfig = { isV2Enabled: () => true };
    const service = new NotificationCoreService(
      repository as never,
      engineConfig as never,
      {} as never,
      {} as never,
      {} as never,
      enforcement,
    );

    const result = await service.ingestCandidate(buildCandidate(), { upstreamAllowed: false });
    expect(result.operation).toBe('skipped_auth_denied');
    expect(enforcement.checkIngest).toHaveBeenCalledWith(
      expect.objectContaining({ upstreamAllowed: false }),
      expect.any(Object),
    );
  });
});
