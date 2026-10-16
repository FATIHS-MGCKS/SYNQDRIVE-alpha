import { buildDiV0HistoricalPositionQuery } from '../di-v0-position-query';
import { validateDiV0PositionWindow } from '../di-v0-position-window';
import { acquireDiV0HistoricalPositions } from '../di-v0-position-acquisition';
import { buildRequest, expectAcquired, expectFailed, row, staticTransport, throwingTransport } from './position-acquisition-test-helpers';

describe('EXP021 S3A position fetch contract (forensics)', () => {
  it('historical position GraphQL has no cursor/limit pagination fields', () => {
    const window = validateDiV0PositionWindow('2026-10-14T10:00:00Z', '2026-10-14T11:00:00Z');
    const q = buildDiV0HistoricalPositionQuery(42, window);
    expect(q).not.toMatch(/after|before|cursor|pageInfo|limit/i);
    expect(q).toContain('interval: "1s"');
    expect(q).toContain('currentLocationCoordinates');
  });

  it('transport failure fails acquisition (no silent ROW_ABSENT fill from error)', async () => {
    const failure = expectFailed(
      await acquireDiV0HistoricalPositions(
        buildRequest('2026-10-14T10:00:00Z', '2026-10-14T10:00:05Z'),
        throwingTransport(new Error('provider down')),
        {},
      ),
    );
    expect(failure.failureClass).not.toBe('INVALID_REQUEST');
    expect(failure.retryable).toBe(true);
  });

  it('sparse provider rows keep present buckets; only missing indices become ROW_ABSENT', async () => {
    const base = '2026-10-14T10:00:00Z';
    const transport = staticTransport({
      data: {
        signals: [row(base, 52.1, 13.1), row('2026-10-14T10:00:02Z', 52.2, 13.2)],
      },
    });
    const acquired = expectAcquired(
      await acquireDiV0HistoricalPositions(buildRequest(base, '2026-10-14T10:00:04Z'), transport, {}),
    );
    expect(acquired.result.rowAbsentCount).toBe(2);
    expect(acquired.result.presentCount).toBe(2);
    expect(acquired.presentCount).toBe(2);
    expect(acquired.rowAbsentCount).toBe(2);
    expect(acquired.providerRowCount).toBe(2);
  });
});
