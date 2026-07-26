import {
  NOTIFICATION_AUDIT_EVENT_RETENTION,
  NOTIFICATION_AUDIT_PROTECTED_FIELDS,
} from './notification-audit.constants';
import {
  hashNotificationAuditPayload,
  sanitizeNotificationAuditClientMeta,
  sanitizeNotificationAuditState,
} from './notification-audit-sanitize.util';
import { NotificationAuditService } from './notification-audit.service';

describe('notification audit', () => {
  describe('constants', () => {
    it('maps all lifecycle events to retention classes', () => {
      expect(NOTIFICATION_AUDIT_EVENT_RETENTION.NOTIFICATION_CREATED).toBe('REVISION_AUDIT');
      expect(NOTIFICATION_AUDIT_EVENT_RETENTION.DELIVERY_DEAD_LETTER).toBe('GOVERNANCE_AUDIT');
      expect(NOTIFICATION_AUDIT_EVENT_RETENTION.DELIVERY_FAILED).toBe('TECHNICAL_LOG');
    });

    it('lists protected payload fields', () => {
      expect(NOTIFICATION_AUDIT_PROTECTED_FIELDS).toContain('titleKey');
      expect(NOTIFICATION_AUDIT_PROTECTED_FIELDS).toContain('bodyKey');
      expect(NOTIFICATION_AUDIT_PROTECTED_FIELDS).toContain('templateParams');
    });
  });

  describe('sanitize', () => {
    it('strips notification text from state snapshots', () => {
      const sanitized = sanitizeNotificationAuditState({
        status: 'OPEN',
        severity: 'CRITICAL',
        titleKey: 'secret.title',
        bodyKey: 'secret.body',
      } as any);
      expect(sanitized).toEqual({ status: 'OPEN', severity: 'CRITICAL' });
      expect((sanitized as any).titleKey).toBeUndefined();
    });

    it('removes protected keys from client meta', () => {
      const meta = sanitizeNotificationAuditClientMeta({
        route: 'POST /notifications/1/resolve',
        templateParams: { foo: 'bar' },
      });
      expect(meta?.route).toBe('POST /notifications/1/resolve');
      expect(meta?.templateParams).toBeUndefined();
    });

    it('produces stable payload hash for integrity', () => {
      const hashA = hashNotificationAuditPayload({
        eventType: 'RESOLVED',
        previousState: { status: 'OPEN', severity: 'WARNING' },
        nextState: { status: 'RESOLVED', severity: 'WARNING' },
        reasonCode: 'MANUAL_RESOLVE',
        correlationId: 'corr-1',
      });
      const hashB = hashNotificationAuditPayload({
        eventType: 'RESOLVED',
        previousState: { status: 'OPEN', severity: 'WARNING' },
        nextState: { status: 'RESOLVED', severity: 'WARNING' },
        reasonCode: 'MANUAL_RESOLVE',
        correlationId: 'corr-1',
      });
      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
    });
  });

  describe('NotificationAuditService', () => {
    const prisma = {
      notificationAuditEvent: {
        create: jest.fn(async (args: any) => ({ id: 'audit-1', ...args.data })),
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        count: jest.fn(async () => 0),
      },
    };
    const activityLog = { log: jest.fn(async () => undefined) };
    const service = new NotificationAuditService(prisma as any, activityLog as any);

    it('persists append-only audit row without notification text', async () => {
      const id = await service.record({
        organizationId: 'org-1',
        notificationId: 'notif-1',
        eventType: 'ACKNOWLEDGED',
        actorType: 'USER',
        actorUserId: 'user-1',
        previousState: { status: 'OPEN', severity: 'INFO' },
        nextState: { status: 'OPEN', severity: 'INFO', scope: 'personal' },
        reasonCode: 'PERSONAL_ACK',
        correlationId: 'req-1',
        clientMeta: { route: 'POST /ack' },
      });

      expect(id).toBe('audit-1');
      expect(prisma.notificationAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            notificationId: 'notif-1',
            eventType: 'ACKNOWLEDGED',
            actorType: 'USER',
            payloadHash: expect.any(String),
          }),
        }),
      );
      const createArg = prisma.notificationAuditEvent.create.mock.calls[0][0];
      expect(createArg.data.previousState).not.toHaveProperty('titleKey');
    });

    it('mirrors governance events to activity log', async () => {
      await service.record({
        organizationId: 'org-1',
        notificationId: 'notif-1',
        eventType: 'RESOLVED',
        actorType: 'USER',
        actorUserId: 'user-1',
        reasonCode: 'MANUAL_RESOLVE',
      });
      expect(activityLog.log).toHaveBeenCalled();
    });

    it('does not throw when persistence fails', async () => {
      prisma.notificationAuditEvent.create.mockRejectedValueOnce(new Error('db down'));
      const id = await service.record({
        organizationId: 'org-1',
        eventType: 'POLICY_REJECTED',
        actorType: 'SYSTEM',
        reasonCode: 'CHANNEL_DISABLED',
      });
      expect(id).toBeNull();
    });
  });
});
