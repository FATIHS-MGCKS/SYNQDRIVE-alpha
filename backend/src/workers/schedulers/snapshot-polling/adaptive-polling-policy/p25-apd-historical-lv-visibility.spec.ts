import {
  type ApdHistoricalLvVisibilityClient,
  findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs,
  P25_APD_RC_LV_FALLBACK_QUERY_BOUNDED_BY_POLL_COMPLETION,
} from './p25-apd-historical-lv-visibility';

describe('historical LIVE_VOLTAGE visibility bound', () => {
  const vehicleId = 'veh-1';
  const pollCompletionMs = 5_000_000;

  const rows = [
    {
      providerTimestamp: new Date(4_000_000),
      observedAt: new Date(4_100_000),
    },
    {
      providerTimestamp: new Date(4_500_000),
      observedAt: new Date(pollCompletionMs),
    },
    {
      providerTimestamp: new Date(6_000_000),
      observedAt: new Date(pollCompletionMs + 1),
    },
  ];

  const prisma = {
    batteryMeasurement: {
      findFirst: jest.fn(async (args: {
        where: { observedAt?: { lte?: Date } };
        orderBy: { providerTimestamp: 'desc' };
      }) => {
        const bound = args.where.observedAt?.lte?.getTime() ?? Infinity;
        const visible = rows.filter((r) => r.observedAt.getTime() <= bound);
        visible.sort((a, b) => b.providerTimestamp.getTime() - a.providerTimestamp.getTime());
        const top = visible[0];
        return top ? { providerTimestamp: top.providerTimestamp } : null;
      }),
    },
  } as unknown as ApdHistoricalLvVisibilityClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('A: observedAt < pollCompletion => visible', async () => {
    const pt = await findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
      prisma,
      vehicleId,
      pollCompletionMs - 1,
    );
    expect(pt).toBe(4_000_000);
  });

  it('B: observedAt == pollCompletion => visible', async () => {
    const pt = await findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
      prisma,
      vehicleId,
      pollCompletionMs,
    );
    expect(pt).toBe(4_500_000);
  });

  it('C: observedAt > pollCompletion => invisible', async () => {
    const pt = await findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
      prisma,
      vehicleId,
      pollCompletionMs - 1,
    );
    expect(pt).not.toBe(6_000_000);
  });

  it('D: newer providerTimestamp but unknowable observedAt loses to older visible row', async () => {
    const pt = await findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
      prisma,
      vehicleId,
      pollCompletionMs,
    );
    expect(pt).toBe(4_500_000);
  });

  it('E: selected value is providerTimestamp ms, not observedAt', async () => {
    const pt = await findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
      prisma,
      vehicleId,
      pollCompletionMs,
    );
    expect(pt).toBe(4_500_000);
    expect(pt).not.toBe(pollCompletionMs);
  });

  it('F: RC fallback query is poll-completion bounded (certification marker)', () => {
    expect(P25_APD_RC_LV_FALLBACK_QUERY_BOUNDED_BY_POLL_COMPLETION).toBe(true);
  });

  it('passes observedAt lte bound to prisma', async () => {
    await findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
      prisma,
      vehicleId,
      pollCompletionMs,
    );
    expect(prisma.batteryMeasurement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          observedAt: { lte: new Date(pollCompletionMs) },
        }),
        orderBy: { providerTimestamp: 'desc' },
      }),
    );
  });
});
