import {
  buildDimoVerificationResponse,
  inferObdPlugStateFromWebhookContext,
  isBlockedEngineWebhookSignal,
  isDimoVerificationRequest,
  normalizeDimoWebhookPayload,
  parseTokenIdFromAssetDid,
} from './dimo-webhook-payload.util';

describe('isDimoVerificationRequest', () => {
  it('detects DIMO URL verification probe', () => {
    expect(isDimoVerificationRequest({ verification: 'test' })).toBe(true);
    expect(isDimoVerificationRequest({ verification: 'other' })).toBe(false);
    expect(isDimoVerificationRequest({ type: 'dimo.trigger' })).toBe(false);
  });
});

describe('parseTokenIdFromAssetDid', () => {
  it('extracts token id from erc721 DID', () => {
    expect(
      parseTokenIdFromAssetDid(
        'did:erc721:137:0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF:12345',
      ),
    ).toBe(12345);
  });
});

describe('normalizeDimoWebhookPayload', () => {
  it('normalizes dimo.trigger CloudEvent with nested signal', () => {
    const normalized = normalizeDimoWebhookPayload({
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF:4242',
      time: '2026-06-28T12:00:00.000Z',
      data: {
        service: 'signals',
        metricName: 'obdIsPluggedIn',
        webhookName: 'OBD device unplugged',
        assetDID: 'did:erc721:137:0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF:4242',
        signal: {
          name: 'obdIsPluggedIn',
          timestamp: '2026-06-28T11:59:58.000Z',
          value: false,
        },
      },
    });

    expect(normalized.tokenId).toBe(4242);
    expect(normalized.signalName).toBe('obdIsPluggedIn');
    expect(normalized.value).toBe(false);
    expect(normalized.timestamp).toBe('2026-06-28T11:59:58.000Z');
    expect(normalized.webhookName).toBe('OBD device unplugged');
  });

  it('normalizes legacy flat payload', () => {
    const normalized = normalizeDimoWebhookPayload({
      tokenId: 99,
      signal: 'obdDTCList',
      value: 'P0420',
      timestamp: '2026-06-28T10:00:00.000Z',
    });
    expect(normalized.tokenId).toBe(99);
    expect(normalized.signalName).toBe('obdDTCList');
    expect(normalized.value).toBe('P0420');
  });
});

describe('inferObdPlugStateFromWebhookContext', () => {
  it('infers unplug from webhook name', () => {
    expect(
      inferObdPlugStateFromWebhookContext({
        tokenId: 1,
        signalName: 'obdIsPluggedIn',
        value: null,
        timestamp: null,
        cloudEventType: 'dimo.trigger',
        webhookName: 'OBD device unplugged',
        metricName: 'obdIsPluggedIn',
        assetDid: null,
      }),
    ).toBe(false);
  });
});

describe('isBlockedEngineWebhookSignal', () => {
  it('blocks RPM/throttle/engine load signals', () => {
    expect(isBlockedEngineWebhookSignal('powertrainCombustionEngineSpeed')).toBe(true);
    expect(isBlockedEngineWebhookSignal('obdIsPluggedIn')).toBe(false);
  });
});

describe('buildDimoVerificationResponse', () => {
  it('returns the token as plain text', () => {
    expect(buildDimoVerificationResponse('secret-token')).toBe('secret-token');
  });
});
