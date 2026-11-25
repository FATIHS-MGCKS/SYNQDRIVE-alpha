/**
 * USR-P1A — master admin session audit durable recovery (PostgreSQL).
 */
import { BusinessType, IamAuditOutboxStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { MasterAdminAuditDeliveryService } from './master-admin-audit-delivery.service';
import { IamAuditOutboxRepository } from '@modules/users/iam-audit-outbox.repository';
import { IamAuditOutboxProcessorService } from '@modules/users/iam-audit-outbox.processor';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import { IamAuditOutboxMetricsService } from '@modules/users/iam-audit-outbox.metrics';
import { MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE } from './master-admin-audit-delivery.contract';
import { IAM_AUDIT_OUTBOX } from '@modules/users/iam-audit.constants';

const run = process.env.USR_P1A_SESSION_AUDIT_PG === '1';

(run ? describe : describe.skip)(
  'MasterAdminAuditDelivery — PostgreSQL recovery',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaClient();
    const iamOutboxRepo = new IamAuditOutboxRepository(prisma as never);
    const delivery = new MasterAdminAuditDeliveryService(prisma as never, iamOutboxRepo);
    const userAudit = new UserAccessAuditService({ record: jest.fn() } as never);
    const processor = new IamAuditOutboxProcessorService(
      prisma as never,
      iamOutboxRepo,
      userAudit,
      new IamAuditOutboxMetricsService(),
      undefined,
      delivery,
    );

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('delivers semantic audit directly to activity_log', async () => {
      const organizationId = randomUUID();
      await prisma.organization.create({
        data: { id: organizationId, companyName: 'usr p1a audit', businessType: BusinessType.FLEET },
      });

      const correlationId = randomUUID();
      const idempotencyKey = `usr-p1a-direct:${correlationId}`;
      const envelope = {
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        actorUserId: randomUUID(),
        actorPlatformRole: 'MASTER_ADMIN',
        correlationId,
        description: 'integration revoke direct',
        entityId: 'sess-int',
        targetOrganizationId: organizationId,
        metadata: {
          domain: 'master_user_session',
          operation: 'REVOKE_ONE',
          outcome: 'SUCCESS',
          targetUserId: randomUUID(),
          sessionId: 'sess-int',
        },
      };

      const direct = await delivery.deliver(envelope, {
        idempotencyKey,
        recoveryOrganizationId: organizationId,
      });
      expect(direct).toBe('DELIVERED');

      const recoveredLogs = await prisma.activityLog.count({
        where: {
          metaJson: {
            path: ['correlationId'],
            equals: correlationId,
          },
        },
      });
      expect(recoveredLogs).toBe(1);
    });

    it('recovers master admin audit from IAM outbox idempotently', async () => {
      const organizationId = randomUUID();
      await prisma.organization.create({
        data: {
          id: organizationId,
          companyName: 'usr p1a outbox',
          businessType: BusinessType.FLEET,
        },
      });

      const correlationId = randomUUID();
      const idempotencyKey = `usr-p1a-outbox:${correlationId}`;
      const envelope = {
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        actorUserId: randomUUID(),
        actorPlatformRole: 'MASTER_ADMIN',
        correlationId,
        description: 'integration outbox recovery',
        entityId: 'sess-outbox',
        targetOrganizationId: organizationId,
        metadata: {
          domain: 'master_user_session',
          operation: 'REVOKE_ONE',
          outcome: 'SUCCESS',
          targetUserId: randomUUID(),
          sessionId: 'sess-outbox',
        },
      };

      const outbox = await prisma.iamAuditOutbox.create({
        data: {
          organizationId,
          idempotencyKey,
          eventType: MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE,
          actorUserId: envelope.actorUserId,
          subjectUserId: envelope.metadata.targetUserId,
          payloadVersion: IAM_AUDIT_OUTBOX.payloadVersion,
          payload: {
            description: envelope.description,
            masterAdminAuditEnvelope: envelope,
          },
          status: IamAuditOutboxStatus.PENDING,
          nextRetryAt: new Date(),
        },
      });

      const firstProcess = await processor.processOutboxId(outbox.id);
      expect(firstProcess).toBe('processed');

      const secondProcess = await processor.processOutboxId(outbox.id);
      expect(secondProcess).toBe('duplicate');

      const recoveredLogs = await prisma.activityLog.count({
        where: {
          metaJson: {
            path: ['correlationId'],
            equals: correlationId,
          },
        },
      });
      expect(recoveredLogs).toBe(1);
    });
  },
);