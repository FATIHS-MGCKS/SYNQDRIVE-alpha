import { TwilioWebhookController } from './twilio-webhook.controller';
import { TwilioWebhookService } from './twilio-webhook.service';

describe('TwilioWebhookController characterization', () => {
  const webhookService = {
    handleInboundVoice: jest.fn(),
    handleStatusCallback: jest.fn(),
  };

  let controller: TwilioWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    webhookService.handleInboundVoice.mockResolvedValue('<Response/>');
    webhookService.handleStatusCallback.mockResolvedValue(undefined);
    controller = new TwilioWebhookController(webhookService as unknown as TwilioWebhookService);
  });

  it('reconstructs public HTTPS URL from x-forwarded-proto behind reverse proxy', async () => {
    const send = jest.fn();
    const res = {
      status: jest.fn().mockReturnThis(),
      send,
      type: jest.fn().mockReturnThis(),
    };

    await controller.inboundVoice(
      {
        headers: { 'x-forwarded-proto': 'https' },
        protocol: 'http',
        get: (header: string) => (header === 'host' ? 'app.synqdrive.eu' : undefined),
        originalUrl: '/api/v1/webhooks/twilio/voice',
      } as never,
      { CallSid: 'CA-proxy-1' },
      res as never,
    );

    expect(webhookService.handleInboundVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        requestUrl: 'https://app.synqdrive.eu/api/v1/webhooks/twilio/voice',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith('<Response/>');
  });

  it('falls back to req.protocol when x-forwarded-proto is absent', async () => {
    const send = jest.fn();
    const res = {
      status: jest.fn().mockReturnThis(),
      send,
      type: jest.fn().mockReturnThis(),
    };

    await controller.inboundVoice(
      {
        headers: {},
        protocol: 'http',
        get: (header: string) => (header === 'host' ? 'localhost:3000' : undefined),
        originalUrl: '/api/v1/webhooks/twilio/voice',
      } as never,
      {},
      res as never,
    );

    expect(webhookService.handleInboundVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        requestUrl: 'http://localhost:3000/api/v1/webhooks/twilio/voice',
      }),
    );
  });

  it('passes reconstructed URL to status callback handler', async () => {
    await controller.statusCallback(
      {
        headers: { 'x-forwarded-proto': 'https' },
        protocol: 'http',
        get: (header: string) => (header === 'host' ? 'app.synqdrive.eu' : undefined),
        originalUrl: '/api/v1/webhooks/twilio/status',
      } as never,
      { CallSid: 'CA-status-1', CallStatus: 'completed' },
    );

    expect(webhookService.handleStatusCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        requestUrl: 'https://app.synqdrive.eu/api/v1/webhooks/twilio/status',
      }),
    );
  });

  it('returns TwiML error response on inbound handler rejection (current behavior)', async () => {
    webhookService.handleInboundVoice.mockRejectedValue(new Error('signature invalid'));
    const send = jest.fn();
    const type = jest.fn().mockReturnThis();
    const res = {
      status: jest.fn().mockReturnThis(),
      send,
      type,
    };

    await controller.inboundVoice(
      {
        headers: {},
        protocol: 'https',
        get: () => 'app.synqdrive.eu',
        originalUrl: '/api/v1/webhooks/twilio/voice',
      } as never,
      {},
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(type).toHaveBeenCalledWith('text/xml');
    expect(send).toHaveBeenCalledWith(expect.stringContaining('Service unavailable'));
  });
});
