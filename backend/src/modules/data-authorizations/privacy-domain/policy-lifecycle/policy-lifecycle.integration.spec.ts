import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import { PolicyLifecycleEventsService } from './policy-lifecycle-events.service';
import { PolicyLifecycleService, PolicyLifecycleTransitionValidator } from './policy-lifecycle.service';
import { ProcessingActivityLifecycleService } from './processing-activity-lifecycle.service';

function noopAuditService() {
  return {
    enqueueLifecycleAuditInTransaction: jest.fn().mockResolvedValue(null),
    enqueueReviewDecisionAuditInTransaction: jest.fn().mockResolvedValue(null),
  };
}

describe('Policy lifecycle integration (in-memory harness)', () => {
  it('runs review → approve → activate with append-only events', async () => {
    const events: Array<{ eventType: string; newStatus: PrivacyPolicyLifecycleStatus }> = [];
    const row = {
      id: 'pa-1',
      organizationId: 'org-1',
      policyFamilyId: 'fam-1',
      versionNumber: 1,
      status: PrivacyPolicyLifecycleStatus.DRAFT,
      activityCode: 'fleet-telematics',
      title: 'Fleet telematics',
      description: null,
      isCurrentVersion: true,
      ownerUserId: null,
      ownerRole: 'ORG_ADMIN' as const,
      validFrom: null,
      validUntil: null,
    };

    const store = { row: { ...row } };
    const prisma = {
      processingActivity: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
          where.id === store.row.id ? { ...store.row } : null,
        ),
        update: jest.fn(async ({ data }: { data: Partial<typeof row> & { status?: PrivacyPolicyLifecycleStatus } }) => {
          Object.assign(store.row, data);
          return { ...store.row };
        }),
        findMany: jest.fn(async () => []),
      },
      processingActivityLifecycleEvent: {
        create: jest.fn(async ({ data }: { data: { eventType: string; newStatus: PrivacyPolicyLifecycleStatus } }) => {
          events.push({ eventType: data.eventType, newStatus: data.newStatus });
          return data;
        }),
      },
      dataAuthorizationAuditOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

    const lifecycleEvents = new PolicyLifecycleEventsService(noopAuditService() as never);
    const lifecycle = new PolicyLifecycleService(
      prisma as never,
      new PolicyLifecycleTransitionValidator(),
      lifecycleEvents,
    );
    const service = new ProcessingActivityLifecycleService(
      prisma as never,
      lifecycle,
      new PolicyLifecycleTransitionValidator(),
      lifecycleEvents,
    );

    await service.submitForReview('org-1', 'pa-1', 'reviewer-1');
    await service.approve('org-1', 'pa-1', 'approver-1');
    const activated = await service.activate('org-1', 'pa-1', { actorUserId: 'approver-1' });

    expect(activated.status).toBe(PrivacyPolicyLifecycleStatus.ACTIVE);
    expect(store.row.status).toBe(PrivacyPolicyLifecycleStatus.ACTIVE);
    expect(events.map((e) => e.newStatus)).toEqual([
      PrivacyPolicyLifecycleStatus.IN_REVIEW,
      PrivacyPolicyLifecycleStatus.APPROVED,
      PrivacyPolicyLifecycleStatus.ACTIVE,
    ]);
  });
});
