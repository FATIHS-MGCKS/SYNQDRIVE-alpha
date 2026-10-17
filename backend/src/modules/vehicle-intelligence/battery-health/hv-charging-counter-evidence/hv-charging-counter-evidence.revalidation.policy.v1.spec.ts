import { decideHvChargingCounterProviderQueryV1 } from './hv-charging-counter-evidence.revalidation.policy.v1';

describe('decideHvChargingCounterProviderQueryV1', () => {
  const sessionBase = {
    startAt: new Date('2026-10-16T13:15:02.931Z'),
    endAt: new Date('2026-10-16T19:52:53.932Z'),
    providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
    updatedAt: new Date('2026-10-16T20:00:00.000Z'),
  };

  const anchorBase = {
    segmentStartAt: sessionBase.startAt,
    segmentEndAt: sessionBase.endAt,
    providerObservedAt: sessionBase.providerObservedAt,
    lastDurableBatchCreatedAt: new Date('2026-10-16T10:00:00.000Z'),
    lastProviderQueryAt: null as Date | null,
  };

  it('queries when no prior anchor exists', () => {
    expect(
      decideHvChargingCounterProviderQueryV1({
        anchor: null,
        session: sessionBase,
        evaluatedAt: new Date('2026-10-17T00:00:00.000Z'),
      }),
    ).toEqual({ queryProvider: true, reason: 'no_prior_batch' });
  });

  it('skips within revalidation window when identity unchanged and session not re-ingested', () => {
    const decision = decideHvChargingCounterProviderQueryV1({
      anchor: {
        ...anchorBase,
        lastDurableBatchCreatedAt: new Date('2026-10-16T21:00:00.000Z'),
      },
      session: {
        ...sessionBase,
        updatedAt: new Date('2026-10-16T20:30:00.000Z'),
      },
      persistResult: { changed: false, changeKind: 'no_op' },
      evaluatedAt: new Date('2026-10-16T22:00:00.000Z'),
    });
    expect(decision).toEqual({
      queryProvider: false,
      reason: 'unchanged_within_revalidation_window',
    });
  });

  it('queries when revalidation interval elapsed from durable batch only', () => {
    const decision = decideHvChargingCounterProviderQueryV1({
      anchor: {
        ...anchorBase,
        lastProviderQueryAt: null,
      },
      session: {
        ...sessionBase,
        updatedAt: new Date('2026-10-16T09:00:00.000Z'),
      },
      persistResult: { changed: false, changeKind: 'no_op' },
      evaluatedAt: new Date('2026-10-17T10:00:00.000Z'),
    });
    expect(decision.queryProvider).toBe(true);
    expect(decision).toMatchObject({ reason: 'revalidation_interval_elapsed' });
  });

  it('does not re-query within interval when lastProviderQueryAt was updated at duplicate revalidation', () => {
    const t0 = new Date('2026-10-16T10:00:00.000Z');
    const t0Plus6h = new Date('2026-10-16T16:00:00.000Z');
    const t0Plus6h5m = new Date('2026-10-16T16:05:00.000Z');

    const at6h = decideHvChargingCounterProviderQueryV1({
      anchor: {
        ...anchorBase,
        lastDurableBatchCreatedAt: t0,
        lastProviderQueryAt: null,
      },
      session: { ...sessionBase, updatedAt: new Date('2026-10-16T09:00:00.000Z') },
      evaluatedAt: t0Plus6h,
    });
    expect(at6h).toMatchObject({ queryProvider: true, reason: 'revalidation_interval_elapsed' });

    const at6h5m = decideHvChargingCounterProviderQueryV1({
      anchor: {
        ...anchorBase,
        lastDurableBatchCreatedAt: t0,
        lastProviderQueryAt: t0Plus6h,
      },
      session: { ...sessionBase, updatedAt: new Date('2026-10-16T09:00:00.000Z') },
      evaluatedAt: t0Plus6h5m,
    });
    expect(at6h5m).toEqual({
      queryProvider: false,
      reason: 'unchanged_within_revalidation_window',
    });
  });

  it('queries when persist result changed (provider refresh path)', () => {
    const decision = decideHvChargingCounterProviderQueryV1({
      anchor: {
        ...anchorBase,
        lastDurableBatchCreatedAt: new Date('2026-10-16T21:00:00.000Z'),
      },
      session: sessionBase,
      persistResult: { changed: true, changeKind: 'provider_refresh' },
      evaluatedAt: new Date('2026-10-16T21:30:00.000Z'),
    });
    expect(decision).toEqual({ queryProvider: true, reason: 'persist_result_changed' });
  });
});
