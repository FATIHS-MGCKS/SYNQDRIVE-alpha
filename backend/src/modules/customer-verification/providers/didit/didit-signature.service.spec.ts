import { createHmac, timingSafeEqual } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import {
  canonicalizeDiditWebhookBody,
  DiditSignatureService,
  shortenFloats,
  sortKeys,
} from './didit-signature.service';

describe('Didit signature canonicalization', () => {
  it('shortens whole-number floats recursively', () => {
    expect(shortenFloats(3.0)).toBe(3);
    expect(shortenFloats({ score: 10.0, nested: [2.0, 1.5] })).toEqual({
      score: 10,
      nested: [2, 1.5],
    });
    expect(
      shortenFloats({ deep: { values: [4.0, { inner: 5.0 }] } }),
    ).toEqual({ deep: { values: [4, { inner: 5 }] } });
  });

  it('sorts object keys lexicographically recursively', () => {
    expect(sortKeys({ b: 1, a: 2, c: { z: 1, y: 2 } })).toEqual({
      a: 2,
      b: 1,
      c: { y: 2, z: 1 },
    });
    expect(sortKeys([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }]);
  });

  it('produces stable canonical JSON for HMAC', () => {
    const body = {
      webhook_type: 'status.updated',
      session_id: 'sess-1',
      status: 'Approved',
      metadata: { organizationId: 'org-1', customerId: 'cust-1' },
    };
    const canonical = canonicalizeDiditWebhookBody(body);
    const digest = createHmac('sha256', 'test-secret')
      .update(canonical, 'utf8')
      .digest('hex');
    expect(canonical).toContain('"metadata"');
    expect(digest).toHaveLength(64);
  });
});

describe('DiditSignatureService', () => {
  const secret = 'webhook-test-secret';
  const configService = {
    get: jest.fn((key: string) =>
      key === 'didit.webhookSecret' ? secret : undefined,
    ),
  };

  let service: DiditSignatureService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiditSignatureService(configService as never);
  });

  function signBody(body: unknown, nowSeconds = 1_700_000_000): string {
    const canonical = canonicalizeDiditWebhookBody(body);
    return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  }

  it('accepts valid X-Signature-V2 with fresh timestamp', () => {
    const body = { session_id: 's1', status: 'Approved', webhook_type: 'status.updated' };
    const raw = Buffer.from(JSON.stringify(body));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signBody(body);

    const result = service.verifyWebhook(raw, signature, timestamp);
    expect(result.body).toEqual(body);
    expect(result.payloadHash).toHaveLength(64);
  });

  it('rejects invalid signature', () => {
    const body = { session_id: 's1', status: 'Approved' };
    const raw = Buffer.from(JSON.stringify(body));
    const timestamp = String(Math.floor(Date.now() / 1000));

    expect(() =>
      service.verifyWebhook(raw, 'deadbeef'.repeat(8), timestamp),
    ).toThrow(UnauthorizedException);
  });

  it('rejects missing timestamp', () => {
    const raw = Buffer.from('{}');
    expect(() => service.verifyWebhook(raw, signBody({}), undefined)).toThrow(
      UnauthorizedException,
    );
    expect(() => service.verifyWebhook(raw, signBody({}), '')).toThrow(
      'Missing x-timestamp header',
    );
  });

  it('rejects timestamp older than 300s', () => {
    const body = { session_id: 's1' };
    const raw = Buffer.from(JSON.stringify(body));
    const nowMs = 1_700_000_000_000;
    const staleTimestamp = String(Math.floor(nowMs / 1000) - 301);
    const signature = signBody(body);

    expect(() =>
      service.verifyWebhook(raw, signature, staleTimestamp),
    ).toThrow('Webhook timestamp outside allowed window');
  });

  it('rejects timestamp newer than 300s', () => {
    const body = { session_id: 's1' };
    const raw = Buffer.from(JSON.stringify(body));
    const nowMs = 1_700_000_000_000;
    const futureTimestamp = String(Math.floor(nowMs / 1000) + 301);
    const signature = signBody(body);

    jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    expect(() =>
      service.verifyWebhook(raw, signature, futureTimestamp),
    ).toThrow('Webhook timestamp outside allowed window');
    jest.restoreAllMocks();
  });

  it('uses timingSafeEqual for signature comparison', () => {
    const spy = jest.spyOn(
      require('crypto') as typeof import('crypto'),
      'timingSafeEqual',
    );
    const body = { ok: true };
    const raw = Buffer.from(JSON.stringify(body));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signBody(body);

    service.verifyWebhook(raw, signature, timestamp);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
