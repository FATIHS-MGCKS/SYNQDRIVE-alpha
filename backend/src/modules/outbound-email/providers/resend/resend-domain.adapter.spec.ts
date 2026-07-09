import { OrgEmailDomainStatus } from '@prisma/client';
import { ResendApiClient } from './resend-api.client';
import { ResendDomainAdapter } from './resend-domain.adapter';

describe('ResendDomainAdapter', () => {
  const client = {
    isConfigured: jest.fn().mockReturnValue(true),
    createDomain: jest.fn(),
    verifyDomain: jest.fn(),
    getDomain: jest.fn(),
  } as unknown as ResendApiClient;

  let adapter: ResendDomainAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new ResendDomainAdapter(client);
  });

  it('provisions domain with provider DNS records', async () => {
    (client.createDomain as jest.Mock).mockResolvedValue({
      id: 'dom-1',
      name: 'acme.test',
      status: 'not_started',
      records: [
        {
          record: 'SPF',
          name: 'send',
          type: 'TXT',
          value: 'v=spf1 include:amazonses.com ~all',
          status: 'not_started',
        },
        {
          record: 'DKIM',
          name: 'resend._domainkey',
          type: 'TXT',
          value: 'p=abc',
          status: 'not_started',
        },
      ],
    });

    const result = await adapter.provisionDomain('acme.test');
    expect(result.providerDomainId).toBe('dom-1');
    expect(result.status).toBe(OrgEmailDomainStatus.PENDING_DNS);
    expect(result.dnsRecords.length).toBeGreaterThan(0);
  });

  it('maps pending verification status from provider', async () => {
    (client.verifyDomain as jest.Mock).mockResolvedValue({ id: 'dom-1' });
    (client.getDomain as jest.Mock).mockResolvedValue({
      id: 'dom-1',
      name: 'acme.test',
      status: 'pending',
      records: [
        {
          record: 'SPF',
          name: 'send',
          type: 'TXT',
          value: 'v=spf1 include:amazonses.com ~all',
          status: 'pending',
        },
      ],
    });

    const result = await adapter.verifyDomain('acme.test', 'dom-1', []);
    expect(result.status).toBe(OrgEmailDomainStatus.VERIFYING);
  });

  it('maps verified status from provider', async () => {
    (client.verifyDomain as jest.Mock).mockResolvedValue({ id: 'dom-1' });
    (client.getDomain as jest.Mock).mockResolvedValue({
      id: 'dom-1',
      name: 'acme.test',
      status: 'verified',
      records: [
        {
          record: 'SPF',
          name: 'send',
          type: 'TXT',
          value: 'v=spf1 include:amazonses.com ~all',
          status: 'verified',
        },
      ],
    });

    const result = await adapter.verifyDomain('acme.test', 'dom-1', []);
    expect(result.status).toBe(OrgEmailDomainStatus.VERIFIED);
  });
});
