import { HttpException } from '@nestjs/common';
import { BillingDomainEventType } from '../domain/billing-domain.events';
import { BillingStripeSyncListenerService } from './billing-stripe-sync.listener.service';

describe('BillingStripeSyncListenerService', () => {
  const orchestrator = {
    syncOrganizationSubscription: jest.fn(),
  };
  const publisher = {
    registerListener: jest.fn(),
  };
  const configService = {
    get: jest.fn(() => true),
  };

  let service: BillingStripeSyncListenerService;
  let listener: (event: any) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    publisher.registerListener.mockImplementation((fn: (event: any) => Promise<void>) => {
      listener = fn;
      return () => undefined;
    });
    service = new BillingStripeSyncListenerService(
      publisher as never,
      orchestrator as never,
      configService as never,
    );
    service.onModuleInit();
  });

  it('registers lifecycle stripe sync listener on module init', () => {
    expect(publisher.registerListener).toHaveBeenCalled();
  });

  it('syncs Stripe subscription after activation event', async () => {
    orchestrator.syncOrganizationSubscription.mockResolvedValue({ subscriptionId: 'sub-1' });

    await listener({
      type: BillingDomainEventType.SUBSCRIPTION_ACTIVATED,
      organizationId: 'org-1',
      occurredAt: new Date(),
      payload: { subscriptionId: 'sub-1', actorUserId: 'admin-1' },
      correlationId: 'sub-1',
    });

    expect(orchestrator.syncOrganizationSubscription).toHaveBeenCalledWith({
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      actorUserId: 'admin-1',
    });
  });

  it('ignores non-lifecycle events', async () => {
    await listener({
      type: BillingDomainEventType.INVOICE_MIRRORED,
      organizationId: 'org-1',
      occurredAt: new Date(),
      payload: {},
    });

    expect(orchestrator.syncOrganizationSubscription).not.toHaveBeenCalled();
  });

  it('skips sync when Stripe is not configured', async () => {
    orchestrator.syncOrganizationSubscription.mockRejectedValue(
      new HttpException({ status: 'NOT_CONFIGURED' }, 501),
    );

    await expect(
      listener({
        type: BillingDomainEventType.SUBSCRIPTION_CHANGED,
        organizationId: 'org-1',
        occurredAt: new Date(),
        payload: { subscriptionId: 'sub-1' },
      }),
    ).resolves.toBeUndefined();
  });
});
