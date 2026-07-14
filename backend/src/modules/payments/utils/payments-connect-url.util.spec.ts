import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAllowedConnectRedirectUrl } from './payments-connect-url.util';

describe('resolveAllowedConnectRedirectUrl', () => {
  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    (configService.get as jest.Mock).mockImplementation((key: string, defaultValue?: unknown) => {
      const map: Record<string, unknown> = {
        'stripe.connectReturnUrl': 'https://app.synqdrive.eu/rental/settings/payments',
        'stripe.connectRefreshUrl': 'https://app.synqdrive.eu/rental/settings/payments/refresh',
        'stripe.portalReturnUrl': 'https://app.synqdrive.eu/rental/settings',
        'app.corsOrigins': ['https://app.synqdrive.eu', 'http://localhost:5173'],
      };
      return map[key] ?? defaultValue;
    });
  });

  it('returns configured fallback when no URL is requested', () => {
    expect(
      resolveAllowedConnectRedirectUrl(configService, undefined, 'stripe.connectReturnUrl'),
    ).toBe('https://app.synqdrive.eu/rental/settings/payments');
  });

  it('accepts URL when origin matches CORS allowlist', () => {
    expect(
      resolveAllowedConnectRedirectUrl(
        configService,
        'https://app.synqdrive.eu/rental/onboarding/done',
        'stripe.connectReturnUrl',
      ),
    ).toBe('https://app.synqdrive.eu/rental/onboarding/done');
  });

  it('accepts localhost origin from CORS allowlist', () => {
    expect(
      resolveAllowedConnectRedirectUrl(
        configService,
        'http://localhost:5173/rental/settings/payments',
        'stripe.connectReturnUrl',
      ),
    ).toBe('http://localhost:5173/rental/settings/payments');
  });

  it('rejects arbitrary client return URL origin', () => {
    expect(() =>
      resolveAllowedConnectRedirectUrl(
        configService,
        'https://evil.example/steal',
        'stripe.connectReturnUrl',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects malformed redirect URL', () => {
    expect(() =>
      resolveAllowedConnectRedirectUrl(configService, 'not-a-url', 'stripe.connectReturnUrl'),
    ).toThrow(BadRequestException);
  });
});
