import { RegistryBillingPermanentIntegrityError } from '../registry-lifecycle/registry-billing-permanent-integrity.error';
import { resolveBaseSubscriptionItemAsOf } from './billing-base-subscription-item-as-of';

const asOf = new Date('2026-07-01T10:00:00.000Z');
const orgId = 'org-1';

function mockDb(items: Array<Record<string, unknown>>) {
  return {
    billingSubscriptionItem: {
      findMany: jest.fn().mockResolvedValue(items),
    },
  };
}

describe('resolveBaseSubscriptionItemAsOf', () => {
  it('ignores base item created after asOf even when validFrom is backdated', async () => {
    const preItem = {
      id: 'item-pre',
      subscriptionId: 'sub-pre',
      organizationId: orgId,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      validFrom: new Date('2020-01-01'),
      validTo: null,
      subscription: {
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        startedAt: null,
        endedAt: null,
      },
    };
    const postItem = {
      id: 'item-post',
      subscriptionId: 'sub-pre',
      organizationId: orgId,
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      validFrom: new Date('2020-01-01'),
      validTo: null,
      subscription: {
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        startedAt: null,
        endedAt: null,
      },
    };
    const db = mockDb([preItem, postItem]);
    const resolved = await resolveBaseSubscriptionItemAsOf(db as any, orgId, asOf);
    expect(resolved?.id).toBe('item-pre');
  });

  it('ignores subscription created after asOf even when startedAt is backdated', async () => {
    const item = {
      id: 'item-1',
      subscriptionId: 'sub-post',
      organizationId: orgId,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      validFrom: new Date('2020-01-01'),
      validTo: null,
      subscription: {
        createdAt: new Date('2026-07-02T00:00:00.000Z'),
        startedAt: new Date('2020-01-01'),
        endedAt: null,
      },
    };
    const db = mockDb([item]);
    const resolved = await resolveBaseSubscriptionItemAsOf(db as any, orgId, asOf);
    expect(resolved).toBeNull();
  });

  it('does not treat post-event backdated overlap as multiple base items', async () => {
    const preItem = {
      id: 'item-pre',
      subscriptionId: 'sub-1',
      organizationId: orgId,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      validFrom: new Date('2020-01-01'),
      validTo: null,
      subscription: {
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        startedAt: null,
        endedAt: null,
      },
    };
    const postOverlap = {
      id: 'item-post',
      subscriptionId: 'sub-1',
      organizationId: orgId,
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      validFrom: new Date('2020-01-01'),
      validTo: null,
      subscription: {
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        startedAt: null,
        endedAt: null,
      },
    };
    const db = mockDb([preItem, postOverlap]);
    const resolved = await resolveBaseSubscriptionItemAsOf(db as any, orgId, asOf);
    expect(resolved?.id).toBe('item-pre');
  });

  it('fails closed when two pre-event items overlap at asOf', async () => {
    const itemA = {
      id: 'a',
      subscriptionId: 'sub',
      organizationId: orgId,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      validFrom: new Date('2020-01-01'),
      validTo: null,
      subscription: {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        startedAt: null,
        endedAt: null,
      },
    };
    const itemB = {
      id: 'b',
      subscriptionId: 'sub',
      organizationId: orgId,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      validFrom: new Date('2020-01-01'),
      validTo: null,
      subscription: {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        startedAt: null,
        endedAt: null,
      },
    };
    const db = mockDb([itemA, itemB]);
    await expect(resolveBaseSubscriptionItemAsOf(db as any, orgId, asOf)).rejects.toBeInstanceOf(
      RegistryBillingPermanentIntegrityError,
    );
  });

  it('selects historically valid item that is ENDED after asOf', async () => {
    const item = {
      id: 'ended-later',
      subscriptionId: 'sub',
      organizationId: orgId,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      validFrom: new Date('2020-01-01'),
      validTo: new Date('2026-07-01T12:00:00.000Z'),
      subscription: {
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        startedAt: null,
        endedAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    };
    const db = mockDb([item]);
    const resolved = await resolveBaseSubscriptionItemAsOf(db as any, orgId, asOf);
    expect(resolved?.id).toBe('ended-later');
  });
});
