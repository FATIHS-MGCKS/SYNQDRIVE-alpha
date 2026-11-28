import type { PrismaClient } from '@prisma/client';
import { MasterAdminAuditOutboxProcessorService } from '@modules/activity-log/master-admin-audit-outbox.processor';
import { MasterAdminAuditDeliveryService } from '@modules/activity-log/master-admin-audit-delivery.service';
import { MasterAdminAuditOutboxRepository } from '@modules/activity-log/master-admin-audit-outbox.repository';
import { MasterGlobalIdentityService } from '../master-global-identity.service';

export type UsrP3a3IdentityPgStack = {
  prisma: PrismaClient;
  globalIdentity: MasterGlobalIdentityService;
  auditDelivery: MasterAdminAuditDeliveryService;
};

/** Minimal real audit outbox + identity service (org invite + org user paths mocked). */
export function createUsrP3a3IdentityPgStack(prisma: PrismaClient): UsrP3a3IdentityPgStack {
  const outboxRepo = new MasterAdminAuditOutboxRepository(prisma as never);
  const processor = {
    processIds: jest.fn().mockResolvedValue(undefined),
    deliverAtomic: jest.fn().mockResolvedValue('DELIVERED'),
  } as unknown as MasterAdminAuditOutboxProcessorService;
  const auditDelivery = new MasterAdminAuditDeliveryService(prisma as never, outboxRepo, processor);

  const globalIdentity = new MasterGlobalIdentityService(
    prisma as never,
    { createOrgUser: jest.fn() } as never,
    {
      persistNewInviteInTransaction: jest.fn(),
      ensureInviteDeliveryContinuity: jest.fn(),
      enqueueDeliveryForPersistedInvite: jest.fn(),
    } as never,
    { enqueueInTransaction: jest.fn(), processOutboxIds: jest.fn() } as never,
    auditDelivery,
    { requestAdminReset: jest.fn() } as never,
  );

  return { prisma, globalIdentity, auditDelivery };
}