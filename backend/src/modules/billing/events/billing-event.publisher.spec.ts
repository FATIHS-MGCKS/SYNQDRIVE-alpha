import { BillingDomainEventType } from '../domain/billing-domain.events';
import { BillingEventPublisher } from './billing-event.publisher';

describe('BillingEventPublisher', () => {
  const audit = { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  let publisher: BillingEventPublisher;

  beforeEach(() => {
    jest.clearAllMocks();
    publisher = new BillingEventPublisher(audit as never);
  });

  it('persists domain events via audit log without email side effects', async () => {
    const listener = jest.fn();
    publisher.registerListener(listener);

    await publisher.publishSubscriptionSynced('org-1', {
      stripeSubscriptionId: 'sub_1',
    });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        action: BillingDomainEventType.SUBSCRIPTION_SYNCED,
        entityType: 'BillingDomainEvent',
      }),
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BillingDomainEventType.SUBSCRIPTION_SYNCED,
        organizationId: 'org-1',
      }),
    );
  });
});
