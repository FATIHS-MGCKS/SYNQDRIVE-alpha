import { MembershipRole } from '@prisma/client';
import { ChatExecutionContextResolver } from './chat-execution-context.resolver';
import { FLEET_AI_ORG_ID, FLEET_AI_OTHER_ORG_ID, FLEET_AI_USER_ID } from '../__fixtures__/fleet-ai-test.fixtures';

describe('ChatExecutionContextResolver — security contract', () => {
  function makePrisma(membership: Record<string, unknown> | null) {
    return {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue(membership),
      },
    };
  }

  it('returns null when no membership and not MASTER_ADMIN', async () => {
    const prisma = makePrisma(null);
    const resolver = new ChatExecutionContextResolver(prisma as never);

    const context = await resolver.resolve(FLEET_AI_ORG_ID, {
      userId: FLEET_AI_USER_ID,
      platformRole: null,
      locale: 'de',
    });

    expect(context).toBeNull();
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: FLEET_AI_USER_ID,
          organizationId: FLEET_AI_ORG_ID,
        }),
      }),
    );
  });

  it('builds execution context for active membership', async () => {
    const prisma = makePrisma({
      id: 'mem-1',
      role: MembershipRole.WORKER,
      status: 'ACTIVE',
      permissions: { fleet: { read: true, write: false } },
      stationScope: null,
      stationIds: [],
      fieldAgentAccess: false,
    });
    const resolver = new ChatExecutionContextResolver(prisma as never);

    const context = await resolver.resolve(FLEET_AI_ORG_ID, {
      userId: FLEET_AI_USER_ID,
      platformRole: null,
      locale: 'de',
    });

    expect(context).not.toBeNull();
    expect(context?.organizationId).toBe(FLEET_AI_ORG_ID);
    expect(context?.userId).toBe(FLEET_AI_USER_ID);
    expect(context?.channel).toBe('fleet_chat');
    expect(context?.correlationId).toBeTruthy();
  });

  it('allows MASTER_ADMIN without membership', async () => {
    const prisma = makePrisma(null);
    const resolver = new ChatExecutionContextResolver(prisma as never);

    const context = await resolver.resolve(FLEET_AI_OTHER_ORG_ID, {
      userId: FLEET_AI_USER_ID,
      platformRole: 'MASTER_ADMIN',
      locale: 'en',
    });

    expect(context).not.toBeNull();
    expect(context?.role).toBe('MASTER_ADMIN');
  });

  it('scopes context to requested organizationId only', async () => {
    const prisma = makePrisma({
      id: 'mem-1',
      role: MembershipRole.ORG_ADMIN,
      status: 'ACTIVE',
      permissions: {},
      stationScope: null,
      stationIds: null,
      fieldAgentAccess: true,
    });
    const resolver = new ChatExecutionContextResolver(prisma as never);

    const context = await resolver.resolve(FLEET_AI_ORG_ID, {
      userId: FLEET_AI_USER_ID,
      platformRole: null,
      locale: 'de',
    });

    expect(context?.organizationId).toBe(FLEET_AI_ORG_ID);
    expect(context?.organizationId).not.toBe(FLEET_AI_OTHER_ORG_ID);
  });
});
