import { BatteryStartProxyExtractHandler } from './battery-start-proxy-extract.handler';
import { BatteryV2ProviderError } from '../battery-v2-job.errors';

describe('BatteryStartProxyExtractHandler', () => {
  const extract = {
    extractAndPersist: jest.fn(),
  };

  let handler: BatteryStartProxyExtractHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new BatteryStartProxyExtractHandler(extract as any);
  });

  const payload = {
    organizationId: 'clorg1234567890123456789012',
    vehicleId: 'clveh1234567890123456789012',
    tripId: 'cltrip123456789012345678901',
    tripStartedAt: '2026-07-16T12:00:00.000Z',
    idempotencyKey: 'battery-start-proxy:cltrip123456789012345678901:1.0.0',
    requestedAt: '2026-07-16T12:00:00.000Z',
    modelVersion: '1.0.0' as const,
    correlationId: 'corr-1',
    attemptContext: {
      attemptNumber: 1,
      maxAttempts: 3,
      enqueuedAt: '2026-07-16T12:00:00.000Z',
    },
  };

  it('retries when extract reports retryable provider failure', async () => {
    extract.extractAndPersist.mockResolvedValue({
      ok: false,
      retryable: true,
      reason: 'provider_timeout',
    });

    await expect(handler.handle(payload)).rejects.toBeInstanceOf(
      BatteryV2ProviderError,
    );
  });

  it('completes when extract persists measurements', async () => {
    extract.extractAndPersist.mockResolvedValue({
      ok: true,
      skipped: false,
      measurementIds: ['meas-1', 'meas-2'],
    });

    await expect(handler.handle(payload)).resolves.toBeUndefined();
  });
});
