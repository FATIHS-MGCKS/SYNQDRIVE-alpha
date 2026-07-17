import { ConfigService } from '@nestjs/config';
import { TwilioControlPlaneClient } from './twilio-control-plane.client';
import { TwilioRegionMismatchError } from './errors/twilio-provider.errors';
import { TwilioTelephonyService } from './twilio-telephony.service';

jest.mock('@config/index', () => ({
  TWILIO_DEFAULT_REGION: 'ie1',
  TWILIO_DEFAULT_EDGE: 'dublin',
  createTwilioClient: jest.fn(() => ({ incomingPhoneNumbers: { list: jest.fn() } })),
}));

describe('Twilio control-plane isolation', () => {
  it('TwilioControlPlaneClient enforces ie1/dublin config', () => {
    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, unknown> = {
          'twilio.configured': true,
          'twilio.accountSid': 'ACparent',
          'twilio.apiKeySid': 'SKparent',
          'twilio.apiKeySecret': 'secret',
          'twilio.region': 'us1',
          'twilio.edge': 'dublin',
        };
        return map[key];
      }),
    } as unknown as ConfigService;

    const client = new TwilioControlPlaneClient(config);
    expect(() => client.getClient()).toThrow(TwilioRegionMismatchError);
  });

  it('TwilioTelephonyService is not constructible with TwilioControlPlaneClient', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', TwilioTelephonyService) ?? [];
    const names = paramTypes.map((type: { name?: string }) => type?.name);
    expect(names).not.toContain('TwilioControlPlaneClient');
  });
});
