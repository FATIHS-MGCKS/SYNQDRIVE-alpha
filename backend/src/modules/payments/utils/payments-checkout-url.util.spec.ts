import { ConfigService } from '@nestjs/config';
import { resolveAllowedCheckoutRedirectUrl } from './payments-checkout-url.util';

describe('payments-checkout-url.util', () => {
  const configService = {
    get: jest.fn((key: string) => {
      const map: Record<string, unknown> = {
        'stripe.checkoutSuccessUrl': 'https://app.synqdrive.eu/rental/bookings?checkout=success',
        'stripe.checkoutCancelUrl': 'https://app.synqdrive.eu/rental/bookings?checkout=cancel',
        'stripe.portalReturnUrl': 'https://app.synqdrive.eu/rental/settings',
        'app.corsOrigins': ['https://app.synqdrive.eu'],
      };
      return map[key];
    }),
  } as unknown as ConfigService;

  it('returns configured success URL when client omits override', () => {
    expect(
      resolveAllowedCheckoutRedirectUrl(configService, undefined, 'stripe.checkoutSuccessUrl'),
    ).toBe('https://app.synqdrive.eu/rental/bookings?checkout=success');
  });

  it('accepts allowlisted origin override', () => {
    expect(
      resolveAllowedCheckoutRedirectUrl(
        configService,
        'https://app.synqdrive.eu/rental/bookings/abc?paid=0',
        'stripe.checkoutSuccessUrl',
      ),
    ).toBe('https://app.synqdrive.eu/rental/bookings/abc?paid=0');
  });
});
