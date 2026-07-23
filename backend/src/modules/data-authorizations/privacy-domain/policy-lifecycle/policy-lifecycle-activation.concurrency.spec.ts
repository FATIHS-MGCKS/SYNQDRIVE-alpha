import { Prisma, PrivacyPolicyLifecycleStatus } from '@prisma/client';
import { PolicyActiveConflictException, PolicyNotActivatableException } from './policy-lifecycle.exceptions';
import { PolicyLifecycleEventsService } from './policy-lifecycle-events.service';
import { PolicyLifecycleService, PolicyLifecycleTransitionValidator } from './policy-lifecycle.service';

function noopAuditService() {
  return {
    enqueueLifecycleAuditInTransaction: jest.fn().mockResolvedValue(null),
    enqueueReviewDecisionAuditInTransaction: jest.fn().mockResolvedValue(null),
  };
}

type Row = {
  id: string;
  organizationId: string;
  policyFamilyId: string;
  versionNumber: number;
  status: PrivacyPolicyLifecycleStatus;
  validFrom?: Date | null;
};

describe('PolicyLifecycleService.activateVersion (concurrency)', () => {
  const orgId = 'org-a';
  const familyId = 'fam-1';

  function buildService(rows: Map<string, Row>) {
    let activeLock = false;
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          find: (id: string) => rows.get(id) ?? null,
          set: (row: Row) => rows.set(row.id, row),
        };
        return fn({
          load: tx,
        });
      }),
    };

    const lifecycle = new PolicyLifecycleService(
      prisma as never,
      new PolicyLifecycleTransitionValidator(),
      new PolicyLifecycleEventsService(noopAuditService() as never),
    );

    const activate = (id: string) =>
      lifecycle.activateVersion({
        entityKind: 'PROCESSING_ACTIVITY',
        orgId,
        record: rows.get(id)!,
        loadCurrent: async (_tx, currentId) => rows.get(currentId) ?? null,
        findActivePeers: async (_tx, current) =>
          [...rows.values()].filter(
            (r) => r.policyFamilyId === current.policyFamilyId && r.status === PrivacyPolicyLifecycleStatus.ACTIVE,
          ),
        applyTransition: async (_tx, current, toStatus, patch) => {
          if (toStatus === PrivacyPolicyLifecycleStatus.ACTIVE) {
            if (activeLock) {
              const err = new Prisma.PrismaClientKnownRequestError('Unique', {
                code: 'P2002',
                clientVersion: '5.22.0',
                meta: { target: ['processing_activities_single_active_per_family_key'] },
              });
              throw err;
            }
            activeLock = true;
          }
          if (toStatus === PrivacyPolicyLifecycleStatus.SUPERSEDED) {
            activeLock = false;
          }
          const updated = { ...current, status: toStatus, ...patch };
          rows.set(current.id, updated);
          return updated;
        },
        recordEvent: jest.fn(),
      });

    return { lifecycle, activate };
  }

  it('is idempotent when the same ACTIVE version is activated twice', async () => {
    const rows = new Map<string, Row>([
      ['v1', { id: 'v1', organizationId: orgId, policyFamilyId: familyId, versionNumber: 1, status: PrivacyPolicyLifecycleStatus.ACTIVE }],
    ]);
    const { activate } = buildService(rows);
    const [a, b] = await Promise.all([activate('v1'), activate('v1')]);
    expect(a.status).toBe(PrivacyPolicyLifecycleStatus.ACTIVE);
    expect(b.status).toBe(PrivacyPolicyLifecycleStatus.ACTIVE);
  });

  it('returns HTTP 409 conflict when two versions race to activate', async () => {
    const rows = new Map<string, Row>([
      ['v-a', { id: 'v-a', organizationId: orgId, policyFamilyId: familyId, versionNumber: 1, status: PrivacyPolicyLifecycleStatus.APPROVED }],
      ['v-b', { id: 'v-b', organizationId: orgId, policyFamilyId: familyId, versionNumber: 2, status: PrivacyPolicyLifecycleStatus.APPROVED }],
    ]);
    const { activate } = buildService(rows);
    const results = await Promise.allSettled([activate('v-a'), activate('v-b')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PolicyActiveConflictException);
    expect([...rows.values()].filter((r) => r.status === PrivacyPolicyLifecycleStatus.ACTIVE)).toHaveLength(1);
  });

  it('rejects activation from DRAFT', async () => {
    const rows = new Map<string, Row>([
      ['draft', { id: 'draft', organizationId: orgId, policyFamilyId: familyId, versionNumber: 1, status: PrivacyPolicyLifecycleStatus.DRAFT }],
    ]);
    const { activate } = buildService(rows);
    await expect(activate('draft')).rejects.toBeInstanceOf(PolicyNotActivatableException);
  });
});
