import { SecretRefResolver, resetSecretMemoryStoreForTests } from './secret-ref.resolver';
import { TwilioInvalidConfigurationError } from '../errors/twilio-provider.errors';

describe('SecretRefResolver', () => {
  const resolver = new SecretRefResolver();
  const envKey = 'VOICE_TWILIO_SUBACCOUNT_TEST';
  const saved = process.env[envKey];

  afterEach(() => {
    resetSecretMemoryStoreForTests();
    if (saved === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = saved;
    }
  });

  it('resolves in-memory registered secret references', async () => {
    const ref = resolver.registerMemoryJson(envKey, {
      accountSid: 'ACmemory123',
      apiKeySid: 'SKmemory123',
      apiKeySecret: 'memory-secret',
    });

    const credentials = await resolver.resolveTwilioSubaccountCredentials(ref);
    expect(credentials.accountSid).toBe('ACmemory123');
  });

  it('resolves env-json secret references', async () => {
    process.env[envKey] = JSON.stringify({
      accountSid: 'ACtest123',
      apiKeySid: 'SKtest123',
      apiKeySecret: 'secret-value',
    });

    const credentials = await resolver.resolveTwilioSubaccountCredentials(`env-json://${envKey}`);
    expect(credentials.accountSid).toBe('ACtest123');
    expect(credentials.apiKeySid).toBe('SKtest123');
    expect(credentials.apiKeySecret).toBe('secret-value');
  });

  it('rejects missing secret references', async () => {
    delete process.env[envKey];
    await expect(
      resolver.resolveTwilioSubaccountCredentials(`env-json://${envKey}`),
    ).rejects.toBeInstanceOf(TwilioInvalidConfigurationError);
  });

  it('rejects unsupported schemes without echoing secret values', async () => {
    await expect(resolver.resolveJson('plain-secret')).rejects.toMatchObject({
      message: expect.stringContaining('Unsupported secret reference scheme'),
    });
  });
});
