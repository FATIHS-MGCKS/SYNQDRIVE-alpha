import { Test } from '@nestjs/testing';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { IntegrationOperationalNotificationService } from './integration-operational-notification.service';

describe('IntegrationOperationalNotificationService', () => {
  const ingestCandidate = jest.fn();

  let service: IntegrationOperationalNotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    ingestCandidate.mockResolvedValue({ enabled: true, operation: 'created' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegrationOperationalNotificationService,
        {
          provide: NotificationCoreService,
          useValue: {
            isEnabled: () => true,
            ingestCandidate,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(IntegrationOperationalNotificationService);
  });

  it('opens INTEGRATION_DISCONNECTED on ERROR with org-scoped entity', async () => {
    await service.syncOrganizationIntegration({
      organizationId: 'org-1',
      organizationIntegrationId: 'oi-1',
      integrationName: 'DIMO',
      integrationType: 'DIMO',
      status: 'ERROR',
      sourceEventId: 'integration:status:oi-1:ERROR',
    });

    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    const candidate = ingestCandidate.mock.calls[0][0];
    expect(candidate.eventType).toBe('INTEGRATION_DISCONNECTED');
    expect(candidate.entityType).toBe('ORGANIZATION');
    expect(candidate.entityId).toBe('org-1');
    expect(candidate.conditionCode).toContain('oi-1');
    expect(candidate.sourceEventId).toBe('integration:status:oi-1:ERROR');
    expect(candidate.templateParams.integrationName).toBe('DIMO');
    expect(JSON.stringify(candidate)).not.toMatch(/apiKey|secret|token/i);
  });

  it('resolves INTEGRATION_DISCONNECTED when status becomes ACTIVE', async () => {
    await service.syncOrganizationIntegration({
      organizationId: 'org-1',
      organizationIntegrationId: 'oi-1',
      integrationName: 'Stripe',
      integrationType: 'STRIPE',
      status: 'ACTIVE',
      sourceEventId: 'integration:connect:oi-1',
    });

    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    const candidate = ingestCandidate.mock.calls[0][0];
    expect(candidate.severity).toBe('SUCCESS');
    expect(candidate.sourceEventId).toBe('integration:connect:oi-1:recovered');
    expect(candidate.metadata.cleared).toBe(true);
  });

  it('uses stable sourceEventId for disconnect retries', async () => {
    const input = {
      organizationId: 'org-1',
      organizationIntegrationId: 'oi-2',
      integrationName: 'WooCommerce',
      integrationType: 'WOOCOMMERCE',
      status: 'INACTIVE' as const,
      sourceEventId: 'integration:disconnect:oi-2',
    };

    await service.syncOrganizationIntegration(input);
    await service.syncOrganizationIntegration(input);

    expect(ingestCandidate).toHaveBeenCalledTimes(2);
    expect(ingestCandidate.mock.calls[0][0].sourceEventId).toBe(
      ingestCandidate.mock.calls[1][0].sourceEventId,
    );
  });
});
