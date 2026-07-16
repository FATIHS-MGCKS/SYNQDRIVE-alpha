import {
  ClickHouseQueryTimeoutError,
  withQueryTimeout,
} from './clickhouse-query-guard';

describe('withQueryTimeout', () => {
  it('resolves when operation completes in time', async () => {
    await expect(
      withQueryTimeout(async () => 'ok', 50),
    ).resolves.toBe('ok');
  });

  it('rejects with ClickHouseQueryTimeoutError on slow operation', async () => {
    await expect(
      withQueryTimeout(
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 40)),
        10,
      ),
    ).rejects.toBeInstanceOf(ClickHouseQueryTimeoutError);
  });
});
