import {
  AUTHORIZATION_DECISION_OUTCOME,
} from '../authorization-decision-engine/authorization-decision.constants';
import { NotificationEnforcementMetricsService } from './notification-enforcement.metrics';
import { NotificationEnforcementService } from './notification-enforcement.service';
import {
  NOTIFICATION_AUTH_DENY_REASON,
  NOTIFICATION_GATE_KIND,
} from './notification-enforcement.constants';
import { createNotificationAuthCache } from './notification-enforcement.types';

describe('NotificationEnforcementService', () => {
  const baseCtx = {
    organizationId: 'org-1',
    eventType: 'BRAKE_CRITICAL',
    vehicleId: 'veh-1',
    correlationId: 'corr-notify-1',
  };

  let prisma: {
    vehicle: { findFirst: jest.Mock };
    notification: { findMany: jest.Mock; updateMany: jest.Mock };
    notificationDeliveryOutbox: { updateMany: jest.Mock };
  };
  let authorizationDecision: { decide: jest.Mock };
  let auditService: { recordIngestionSkipped: jest.Mock };
  let healthEnforcement: { mayNotify: jest.Mock };
  let behaviorEnforcement: { mayNotify: jest.Mock };
  let metrics: NotificationEnforcementMetricsService;
  let service: NotificationEnforcementService;

  beforeEach(() => {
    prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }) },
      notification: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      notificationDeliveryOutbox: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    authorizationDecision = { decide: jest.fn() };
    auditService = { recordIngestionSkipped: jest.fn().mockResolvedValue('audit-1') };
    healthEnforcement = { mayNotify: jest.fn().mockResolvedValue(true) };
    behaviorEnforcement = { mayNotify: jest.fn().mockResolvedValue(true) };
    metrics = new NotificationEnforcementMetricsService();
    service = new NotificationEnforcementService(
      prisma as never,
      authorizationDecision as never,
      auditService as unknown as never,
      metrics,
      healthEnforcement as never,
      behaviorEnforcement as never,
    );
    process.env.DATA_AUTH_NOTIFICATION_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_NOTIFICATION_FAIL_CLOSED = 'true';
  });

  afterEach(() => {
    metrics.reset();
    delete process.env.DATA_AUTH_NOTIFICATION_SHADOW_MODE;
    delete process.env.DATA_AUTH_NOTIFICATION_FAIL_CLOSED;
  });

  it('Alert ALLOW — operational notification passes without privacy gate', async () => {
    const result = await service.checkIngest({
      organizationId: 'org-1',
      eventType: 'PICKUP_OVERDUE',
      correlationId: 'corr-op-1',
      bookingId: 'book-1',
      entityId: 'book-1',
    });
    expect(result.mayProceed).toBe(true);
    expect(result.gateKind).toBe(NOTIFICATION_GATE_KIND.OPERATIONAL);
    expect(healthEnforcement.mayNotify).not.toHaveBeenCalled();
  });

  it('Alert DENY — health notification blocked when mayNotify denies', async () => {
    healthEnforcement.mayNotify.mockResolvedValue(false);
    const result = await service.checkIngest(baseCtx);
    expect(result.mayProceed).toBe(false);
    expect(result.isAuthorizationDeny).toBe(true);
    expect(healthEnforcement.mayNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        dataCategory: 'HEALTH_SIGNALS',
        purpose: 'ALERTS',
      }),
    );
    expect(auditService.recordIngestionSkipped).toHaveBeenCalled();
  });

  it('blocks notification from denied upstream derived data', async () => {
    const result = await service.checkIngest({
      ...baseCtx,
      upstreamAllowed: false,
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe(NOTIFICATION_AUTH_DENY_REASON.DERIVED_DATA_BLOCKED);
    expect(healthEnforcement.mayNotify).not.toHaveBeenCalled();
  });

  it('Multi-Tenant — foreign vehicle denied', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const result = await service.checkIngest(baseCtx);
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe(NOTIFICATION_AUTH_DENY_REASON.TENANT_MISMATCH);
  });

  it('Duplikate — same process uses decision cache', async () => {
    const cache = createNotificationAuthCache();
    await service.checkIngest(baseCtx, cache);
    await service.checkIngest(baseCtx, cache);
    expect(healthEnforcement.mayNotify).toHaveBeenCalledTimes(1);
    expect(metrics.countFor('ingest', 'BRAKE_CRITICAL', 'cache_hit')).toBe(1);
  });

  it('technische versus fachliche Meldung — monitoring bypasses privacy gate', async () => {
    const result = await service.checkIngest({
      organizationId: 'org-1',
      eventType: 'WEBHOOK_FAILURE',
      correlationId: 'corr-tech-1',
    });
    expect(result.mayProceed).toBe(true);
    expect(result.gateKind).toBe(NOTIFICATION_GATE_KIND.TECHNICAL_MONITORING);
    expect(authorizationDecision.decide).not.toHaveBeenCalled();
  });

  it('driving misuse notification uses behavior mayNotify', async () => {
    await service.checkIngest({
      organizationId: 'org-1',
      eventType: 'MISUSE_DETECTED',
      vehicleId: 'veh-1',
      correlationId: 'corr-misuse-1',
    });
    expect(behaviorEnforcement.mayNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'ABUSE_MISUSE_DETECTION',
      }),
    );
  });

  it('Widerruf — resolves active notifications and cancels pending delivery', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n-1', eventType: 'BRAKE_CRITICAL' },
      { id: 'n-2', eventType: 'TIRE_CRITICAL' },
    ]);
    prisma.notificationDeliveryOutbox.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.handleRevocation({
      organizationId: 'org-1',
      dataCategory: 'HEALTH_SIGNALS',
      correlationId: 'revoke-1',
    });

    expect(result.resolvedCount).toBe(2);
    expect(result.cancelledDeliveries).toBe(3);
    expect(prisma.notification.updateMany).toHaveBeenCalled();
  });

  it('connectivity alert uses direct NOTIFY decision when no domain service', async () => {
    authorizationDecision.decide.mockResolvedValue({
      decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
      enforced: false,
      isShadowMode: false,
      reasonCode: 'POLICY_MATCH',
      reasonCodes: ['POLICY_MATCH'],
      correlationId: 'corr-conn-1',
      auditEventId: 'evt-conn-1',
    });

    const svc = new NotificationEnforcementService(
      prisma as never,
      authorizationDecision as never,
      auditService as unknown as never,
      metrics,
    );

    const result = await svc.checkIngest({
      organizationId: 'org-1',
      eventType: 'TELEMETRY_OFFLINE',
      vehicleId: 'veh-1',
      correlationId: 'corr-conn-1',
    });

    expect(result.mayProceed).toBe(true);
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NOTIFY' }),
    );
  });
});
