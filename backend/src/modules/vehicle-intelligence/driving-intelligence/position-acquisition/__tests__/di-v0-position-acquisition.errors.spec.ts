import {
  DimoProviderBudgetError,
  DimoRateLimitedError,
  DimoRetryableHttpError,
} from '../../../../dimo/provider-budget/dimo-http-error.util';
import { acquireDiV0HistoricalPositions } from '../di-v0-position-acquisition';
import {
  classifyDiV0PositionTransportError,
  DiV0VehicleJwtUnavailableError,
  redactProviderMessage,
} from '../di-v0-position-errors';
import {
  axiosLikeError,
  buildRequest,
  expectFailed,
  FIXED_NOW,
  labelAt,
  row,
  staticTransport,
  throwingTransport,
} from './position-acquisition-test-helpers';

const BASE = '2026-09-26T10:00:00Z';
const TO = labelAt(BASE, 10);
const opts = { now: () => FIXED_NOW };
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXRlc3Q';

describe('S3A request validation (INVALID_REQUEST, no provider call)', () => {
  const invalid: { name: string; request: ReturnType<typeof buildRequest> }[] = [
    { name: 'millisecond from', request: buildRequest('2026-09-26T10:00:00.500Z', TO) },
    { name: 'millisecond to', request: buildRequest(BASE, '2026-09-26T10:00:10.001Z') },
    { name: 'offset instead of Z', request: buildRequest('2026-09-26T12:00:00+02:00', TO) },
    { name: 'local time (no zone)', request: buildRequest('2026-09-26T10:00:00', TO) },
    { name: 'from == to', request: buildRequest(BASE, BASE) },
    { name: 'from > to', request: buildRequest(TO, BASE) },
    { name: 'invalid calendar date', request: buildRequest('2026-02-30T10:00:00Z', '2026-03-01T10:00:00Z') },
    { name: 'missing organizationId', request: buildRequest(BASE, TO, { organizationId: '' }) },
    { name: 'missing vehicleId', request: buildRequest(BASE, TO, { vehicleId: ' ' }) },
    { name: 'non-integer token', request: buildRequest(BASE, TO, { dimoTokenId: 1.5 }) },
    { name: 'zero token', request: buildRequest(BASE, TO, { dimoTokenId: 0 }) },
    { name: 'window exceeds structural bound', request: buildRequest(BASE, labelAt(BASE, 43201)) },
  ];

  it.each(invalid)('$name', async ({ request }) => {
    const transport = staticTransport({ data: { signals: [] } });
    const failure = expectFailed(await acquireDiV0HistoricalPositions(request, transport, opts));
    expect(failure.failureClass).toBe('INVALID_REQUEST');
    expect(failure.retryable).toBe(false);
    expect(transport.calls).toHaveLength(0);
  });

  it('explicit zero fraction is accepted as whole-second', async () => {
    const transport = staticTransport({ data: { signals: [] } });
    const outcome = await acquireDiV0HistoricalPositions(
      buildRequest('2026-09-26T10:00:00.000Z', TO),
      transport,
      opts,
    );
    expect(outcome.status).toBe('ACQUIRED');
  });

  it('maxWindowSeconds is an explicit override', async () => {
    const transport = staticTransport({ data: { signals: [] } });
    const failure = expectFailed(
      await acquireDiV0HistoricalPositions(buildRequest(BASE, TO), transport, { ...opts, maxWindowSeconds: 5 }),
    );
    expect(failure.failureClass).toBe('INVALID_REQUEST');
  });
});

describe('S3A transport error model', () => {
  const cases: { name: string; error: unknown; failureClass: string; retryable: boolean; httpStatus: number | null }[] = [
    { name: '401', error: axiosLikeError(401), failureClass: 'AUTHENTICATION', retryable: false, httpStatus: 401 },
    { name: '403', error: axiosLikeError(403), failureClass: 'AUTHORIZATION', retryable: false, httpStatus: 403 },
    { name: '400', error: axiosLikeError(400), failureClass: 'INVALID_REQUEST', retryable: false, httpStatus: 400 },
    { name: '404', error: axiosLikeError(404), failureClass: 'INVALID_REQUEST', retryable: false, httpStatus: 404 },
    { name: '408', error: axiosLikeError(408), failureClass: 'TIMEOUT', retryable: true, httpStatus: 408 },
    { name: '429 axios', error: axiosLikeError(429), failureClass: 'RATE_LIMITED', retryable: true, httpStatus: 429 },
    { name: '500', error: axiosLikeError(500), failureClass: 'PROVIDER_HTTP_ERROR', retryable: true, httpStatus: 500 },
    { name: '503', error: axiosLikeError(503), failureClass: 'PROVIDER_HTTP_ERROR', retryable: true, httpStatus: 503 },
    {
      name: 'DimoRateLimitedError',
      error: new DimoRateLimitedError('rate limited', 1000),
      failureClass: 'RATE_LIMITED',
      retryable: true,
      httpStatus: 429,
    },
    {
      name: 'DimoProviderBudgetError',
      error: new DimoProviderBudgetError('budget', 'ACQUIRE_TIMEOUT'),
      failureClass: 'PROVIDER_BUDGET_UNAVAILABLE',
      retryable: true,
      httpStatus: null,
    },
    {
      name: 'DimoRetryableHttpError 502',
      error: new DimoRetryableHttpError('bad gateway', 502),
      failureClass: 'PROVIDER_HTTP_ERROR',
      retryable: true,
      httpStatus: 502,
    },
    {
      name: 'axios timeout',
      error: Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }),
      failureClass: 'TIMEOUT',
      retryable: true,
      httpStatus: null,
    },
    {
      name: 'network reset',
      error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      failureClass: 'NETWORK',
      retryable: true,
      httpStatus: null,
    },
    {
      name: 'thrown GraphQL error',
      error: new Error('DIMO GraphQL error: interval must be positive'),
      failureClass: 'GRAPHQL_ERROR',
      retryable: false,
      httpStatus: null,
    },
    {
      name: 'vehicle JWT unavailable',
      error: new DiV0VehicleJwtUnavailableError(),
      failureClass: 'AUTHENTICATION',
      retryable: false,
      httpStatus: null,
    },
    { name: 'unknown', error: new Error('something odd'), failureClass: 'UNKNOWN', retryable: false, httpStatus: null },
  ];

  it.each(cases)('$name → $failureClass', async ({ error, failureClass, retryable, httpStatus }) => {
    const transport = throwingTransport(error);
    const failure = expectFailed(await acquireDiV0HistoricalPositions(buildRequest(BASE, TO), transport, opts));
    expect(failure).toMatchObject({ failureClass, retryable, httpStatus });
    expect(transport.calls).toHaveLength(1);
  });

  it('403 fails explicitly: no partial result, no retry, no empty-success disguise', async () => {
    const transport = throwingTransport(axiosLikeError(403));
    const outcome = await acquireDiV0HistoricalPositions(buildRequest(BASE, TO), transport, opts);
    expect(outcome.status).toBe('FAILED');
    expect(outcome).not.toHaveProperty('result');
    expect(transport.calls).toHaveLength(1);
  });

  it('S3A never retries itself, even for retryable classes', async () => {
    const transport = throwingTransport(axiosLikeError(503));
    await acquireDiV0HistoricalPositions(buildRequest(BASE, TO), transport, opts);
    expect(transport.calls).toHaveLength(1);
  });
});

describe('S3A response-shape failures', () => {
  it('GraphQL errors with partial data fail closed', async () => {
    const transport = staticTransport({
      data: { signals: [row(BASE, 51, 9)] },
      errors: [{ message: 'partial failure' }],
    });
    const failure = expectFailed(await acquireDiV0HistoricalPositions(buildRequest(BASE, TO), transport, opts));
    expect(failure.failureClass).toBe('GRAPHQL_ERROR');
    expect(failure.safeMessage).toContain('partial failure');
  });

  it.each([
    ['non-object body', 'oops'],
    ['missing data', {}],
    ['missing signals', { data: {} }],
    ['signals not an array', { data: { signals: { a: 1 } } }],
  ])('%s → MALFORMED_RESPONSE', async (_name, body) => {
    const failure = expectFailed(
      await acquireDiV0HistoricalPositions(buildRequest(BASE, TO), staticTransport(body), opts),
    );
    expect(failure.failureClass).toBe('MALFORMED_RESPONSE');
    expect(failure.retryable).toBe(false);
  });
});

describe('S3A secret redaction', () => {
  it('redacts bearer tokens, JWTs and authorization values', () => {
    const message = redactProviderMessage(
      `Authorization: Bearer ${FAKE_JWT} failed; token=${FAKE_JWT}; {"authorization":"Bearer abc.def"}`,
    );
    expect(message).not.toContain(FAKE_JWT);
    expect(message).not.toContain('abc.def');
    expect(message).toContain('[REDACTED');
  });

  it('bounds message length', () => {
    expect(redactProviderMessage('x'.repeat(5000)).length).toBeLessThanOrEqual(300);
  });

  it('GraphQL error text echoing a token is redacted in the failure', async () => {
    const transport = staticTransport({ data: null, errors: [{ message: `invalid token Bearer ${FAKE_JWT}` }] });
    const failure = expectFailed(await acquireDiV0HistoricalPositions(buildRequest(BASE, TO), transport, opts));
    expect(failure.safeMessage).not.toContain(FAKE_JWT);
  });

  it('HTTP failures never propagate provider message bodies', () => {
    const failure = classifyDiV0PositionTransportError(axiosLikeError(403, `denied for Bearer ${FAKE_JWT}`));
    expect(failure.safeMessage).toBe('AUTHORIZATION (HTTP 403)');
  });
});
