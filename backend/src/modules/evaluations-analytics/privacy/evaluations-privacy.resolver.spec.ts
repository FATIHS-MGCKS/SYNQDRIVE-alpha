import { EvaluationsPrivacyResolver } from './evaluations-privacy.resolver';

/**
 * Exercises the REAL resolver + REAL permission.util + REAL policy (only Prisma is
 * mocked to return a membership row). No policy mocking, so the resolver logic —
 * including the E5.2.1 DRIVER hard deny — is genuinely tested.
 */
function buildResolver(membership: { role: string; permissions: unknown } | null) {
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn().mockResolvedValue(membership),
    },
  };
  return { resolver: new EvaluationsPrivacyResolver(prisma as never), prisma };
}

const actor = { id: 'user-1', organizationId: 'org-a', platformRole: null };

describe('EvaluationsPrivacyResolver — E5.2.1 DRIVER hard deny (real resolver + policy)', () => {
  it('DRIVER + evaluations.read → none', async () => {
    const { resolver } = buildResolver({
      role: 'DRIVER',
      permissions: { evaluations: { read: true, write: false } },
    });
    await expect(resolver.resolvePiiTier(actor, 'org-a')).resolves.toBe('none');
  });

  it('DRIVER + customers.read → none', async () => {
    const { resolver } = buildResolver({
      role: 'DRIVER',
      permissions: { customers: { read: true, write: false } },
    });
    await expect(resolver.resolvePiiTier(actor, 'org-a')).resolves.toBe('none');
  });

  it('DRIVER + evaluations.read + customers.read → none', async () => {
    const { resolver } = buildResolver({
      role: 'DRIVER',
      permissions: {
        evaluations: { read: true, write: false },
        customers: { read: true, write: false },
      },
    });
    await expect(resolver.resolvePiiTier(actor, 'org-a')).resolves.toBe('none');
  });

  it('WORKER + evaluations.read → pseudonymous (non-DRIVER path preserved)', async () => {
    const { resolver } = buildResolver({
      role: 'WORKER',
      permissions: { evaluations: { read: true, write: false } },
    });
    await expect(resolver.resolvePiiTier(actor, 'org-a')).resolves.toBe('pseudonymous');
  });

  it('SUB_ADMIN + customers.read → full (non-DRIVER path preserved)', async () => {
    const { resolver } = buildResolver({
      role: 'SUB_ADMIN',
      permissions: { customers: { read: true, write: false } },
    });
    await expect(resolver.resolvePiiTier(actor, 'org-a')).resolves.toBe('full');
  });

  it('no membership → none (fail closed)', async () => {
    const { resolver } = buildResolver(null);
    await expect(resolver.resolvePiiTier(actor, 'org-a')).resolves.toBe('none');
  });

  it('platform MASTER_ADMIN → full without any membership lookup', async () => {
    const { resolver, prisma } = buildResolver(null);
    await expect(
      resolver.resolvePiiTier({ ...actor, platformRole: 'MASTER_ADMIN' }, 'org-a'),
    ).resolves.toBe('full');
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});
