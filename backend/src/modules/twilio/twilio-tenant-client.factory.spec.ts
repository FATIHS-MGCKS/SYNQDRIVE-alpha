import { TwilioRegionMismatchError, TwilioResourceNotFoundError } from './errors/twilio-provider.errors';
import { TwilioTenantClientFactory } from './twilio-tenant-client.factory';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

jest.mock('@config/index', () => ({
  TWILIO_DEFAULT_REGION: 'ie1',
  TWILIO_DEFAULT_EDGE: 'dublin',
  createTwilioClient: jest.fn(() => ({ incomingPhoneNumbers: { list: jest.fn() } })),
}));

describe('TwilioTenantClientFactory', () => {
  const prisma = {
    voiceProviderAccount: {
      findFirst: jest.fn(),
    },
  };
  const secretResolver = {
    resolveTwilioSubaccountCredentials: jest.fn(),
  };
  let factory: TwilioTenantClientFactory;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    factory = new TwilioTenantClientFactory(prisma as never, secretResolver as never);
    warnSpy = jest.spyOn((factory as any).logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    factory.resetCacheForTests();
    warnSpy.mockRestore();
  });

  it('creates tenant client for matching organization subaccount', async () => {
    prisma.voiceProviderAccount.findFirst.mockResolvedValue({
      id: 'acct-1',
      organizationId: ORG_A,
      region: 'ie1',
      edge: 'dublin',
      secretRef: 'env-json://VOICE_TWILIO_SUBACCOUNT_ORG_A',
    });
    secretResolver.resolveTwilioSubaccountCredentials.mockResolvedValue({
      accountSid: 'ACtenant',
      apiKeySid: 'SKtenant',
      apiKeySecret: 'secret',
    });

    const client = await factory.getClientForOrganization(ORG_A);
    expect(client).toBeTruthy();
    expect(prisma.voiceProviderAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      }),
    );
  });

  it('denies foreign organization without subaccount', async () => {
    prisma.voiceProviderAccount.findFirst.mockResolvedValue(null);
    await expect(factory.getClientForOrganization(ORG_B)).rejects.toBeInstanceOf(
      TwilioResourceNotFoundError,
    );
  });

  it('rejects region mismatch', async () => {
    prisma.voiceProviderAccount.findFirst.mockResolvedValue({
      id: 'acct-1',
      organizationId: ORG_A,
      region: 'us1',
      edge: 'dublin',
      secretRef: 'env-json://VOICE_TWILIO_SUBACCOUNT_ORG_A',
    });

    await expect(factory.getClientForOrganization(ORG_A)).rejects.toBeInstanceOf(
      TwilioRegionMismatchError,
    );
  });

  it('invalidates cache on credential rotation', async () => {
    prisma.voiceProviderAccount.findFirst.mockResolvedValue({
      id: 'acct-1',
      organizationId: ORG_A,
      region: 'ie1',
      edge: 'dublin',
      secretRef: 'env-json://VOICE_TWILIO_SUBACCOUNT_ORG_A',
    });
    secretResolver.resolveTwilioSubaccountCredentials.mockResolvedValue({
      accountSid: 'ACtenant',
      apiKeySid: 'SKtenant',
      apiKeySecret: 'secret',
    });

    await factory.getClientForOrganization(ORG_A);
    factory.invalidateOrganization(ORG_A);
    await factory.getClientForOrganization(ORG_A);

    expect(secretResolver.resolveTwilioSubaccountCredentials).toHaveBeenCalledTimes(2);
  });

  it('does not log secret values on provider failure', () => {
    factory.logProviderFailure(ORG_A, 'listPhoneNumbers', new Error('apiKeySecret=super-secret'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('apiKeySecret=[REDACTED]'));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('super-secret'));
  });
});
