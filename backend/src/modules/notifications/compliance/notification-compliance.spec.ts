import { NotificationDomain, NotificationStatus } from '@prisma/client';
import {
  minimizeOccurrencePayload,
  minimizeTemplateParams,
  sanitizeDeliveryErrorMessage,
} from './notification-data-minimization';
import {
  NOTIFICATION_RETENTION_CLASS,
  NOTIFICATION_RETENTION_DAYS,
  computeDeletionEligibleAt,
  resolveNotificationRetentionClass,
} from './notification-retention.constants';
import { WORKFLOW_AUDIT_RETENTION_DAYS } from '@modules/workflows/audit/workflow-audit.constants';

describe('notification-data-minimization', () => {
  it('strips direct PII from template params at write time', () => {
    const minimized = minimizeTemplateParams({
      label: 'B-AB 123',
      plate: 'B-AB 123',
      customerName: 'Max Mustermann',
      customerEmail: 'max@example.com',
      stationName: 'Berlin',
      bookingRef: 'BK-42',
    });
    expect(minimized).toEqual({
      label: 'B-AB 123',
      plate: 'B-AB 123',
      stationName: 'Berlin',
      bookingRef: 'BK-42',
    });
    expect(minimized.customerName).toBeUndefined();
    expect(minimized.customerEmail).toBeUndefined();
  });

  it('allows only operational occurrence metadata keys', () => {
    const payload = minimizeOccurrencePayload({
      runId: 'run-1',
      adapterId: 'adapter-a',
      customerEmail: 'secret@example.com',
      freeTextNote: 'should drop',
    });
    expect(payload).toEqual({
      runId: 'run-1',
      adapterId: 'adapter-a',
    });
  });

  it('sanitizes delivery error messages', () => {
    const sanitized = sanitizeDeliveryErrorMessage(
      'Failed for user alice@example.com with token abcdefghijklmnop',
    );
    expect(sanitized).toContain('[email]');
    expect(sanitized).not.toContain('alice@example.com');
  });
});

describe('notification-retention.constants', () => {
  it('derives resolved operational retention from fleet warning default', () => {
    expect(NOTIFICATION_RETENTION_DAYS.RESOLVED_OPERATIONAL).toBe(180);
  });

  it('aligns security governance with workflow GOVERNANCE_AUDIT', () => {
    expect(NOTIFICATION_RETENTION_DAYS.SECURITY_GOVERNANCE).toBe(
      WORKFLOW_AUDIT_RETENTION_DAYS.GOVERNANCE_AUDIT,
    );
  });

  it('aligns delivery technical with workflow TECHNICAL_LOG', () => {
    expect(NOTIFICATION_RETENTION_DAYS.DELIVERY_TECHNICAL).toBe(
      WORKFLOW_AUDIT_RETENTION_DAYS.TECHNICAL_LOG,
    );
  });

  it('classifies SECURITY domain as governance retention', () => {
    expect(
      resolveNotificationRetentionClass({
        domain: NotificationDomain.SECURITY,
        eventType: 'WEBHOOK_FAILURE',
        status: NotificationStatus.RESOLVED,
      }),
    ).toBe(NOTIFICATION_RETENTION_CLASS.SECURITY_GOVERNANCE);
  });

  it('computes deletion eligible date from anchor', () => {
    const anchor = new Date('2026-01-01T00:00:00.000Z');
    const eligible = computeDeletionEligibleAt(
      NOTIFICATION_RETENTION_CLASS.RESOLVED_OPERATIONAL,
      anchor,
    );
    expect(eligible?.toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });
});

describe('notification retention tenant isolation', () => {
  it('retention purge queries are org-scoped when organizationId provided', async () => {
    const prisma = {
      notificationRetentionPurgeRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn(),
      },
      notification: {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn(),
      },
      notificationDeliveryOutbox: {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    const { NotificationRetentionService } = await import('./notification-retention.service');
    const service = new NotificationRetentionService(prisma as any, {
      enabled: true,
      dryRun: false,
      batchSize: 100,
      policyVersion: 'test',
      days: {
        resolvedOperational: 180,
        securityGovernance: 2555,
        deliveryTechnical: 90,
        workflowTechnical: 90,
      },
    } as any);

    await service.runOnce({ organizationId: 'org-a', trigger: 'manual', dryRun: false });

    expect(prisma.notification.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
    expect(prisma.notificationDeliveryOutbox.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
  });
});
