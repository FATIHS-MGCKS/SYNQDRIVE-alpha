import {
  getHmObservationInFlightCount,
  HM_OBSERVATION_TIMEOUT_MS,
  resetHmObservationConcurrencyForTests,
  runHmObservationEvaluation,
} from './hm-only-canonical-observation-concurrency';

describe('hm-only-canonical-observation-concurrency', () => {
  beforeEach(() => {
    resetHmObservationConcurrencyForTests();
    jest.useRealTimers();
  });

  it('releases slot exactly once after evaluation settles', async () => {
    const result = await runHmObservationEvaluation(async () => 'ok');
    expect(result).toEqual({ status: 'OK', value: 'ok' });
    expect(getHmObservationInFlightCount()).toBe(0);
  });

  it('retains slot during timeout until underlying work completes', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = runHmObservationEvaluation(
      async () => {
        await gate;
        return 'late';
      },
      { timeoutMs: 50 },
    );

    await jest.advanceTimersByTimeAsync(60);
    const timed = await pending;
    expect(timed).toEqual({ status: 'TIMEOUT' });
    expect(getHmObservationInFlightCount()).toBe(1);

    expect(getHmObservationInFlightCount()).toBe(1);

    release();
    await jest.runAllTimersAsync();
    await Promise.resolve();
    expect(getHmObservationInFlightCount()).toBe(0);
  });

  it('absorbs late rejection after timeout without unhandled rejection', async () => {
    jest.useFakeTimers();
    let reject!: (e: Error) => void;
    const work = new Promise<void>((_, rej) => {
      reject = rej;
    });

    const pending = runHmObservationEvaluation(
      async () => {
        await work;
        return 'never';
      },
      { timeoutMs: 30 },
    );

    await jest.advanceTimersByTimeAsync(40);
    expect(await pending).toEqual({ status: 'TIMEOUT' });

    reject(new Error('late failure'));
    await jest.runAllTimersAsync();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
    expect(getHmObservationInFlightCount()).toBe(0);
  });

  it('returns OVERLOAD when all slots are held', async () => {
    const holders: Array<() => void> = [];
    const promises: Array<Promise<unknown>> = [];

    for (let i = 0; i < 32; i++) {
      promises.push(
        runHmObservationEvaluation(
          () =>
            new Promise<string>((resolve) => {
              holders.push(() => resolve(`slot-${i}`));
            }),
          { timeoutMs: HM_OBSERVATION_TIMEOUT_MS },
        ),
      );
    }

    await Promise.resolve();
    expect(getHmObservationInFlightCount()).toBe(32);

    const blocked = await runHmObservationEvaluation(async () => 'blocked');
    expect(blocked).toEqual({ status: 'OVERLOAD' });

    holders.forEach((release) => release());
    await Promise.all(promises);
    expect(getHmObservationInFlightCount()).toBe(0);
  });
});