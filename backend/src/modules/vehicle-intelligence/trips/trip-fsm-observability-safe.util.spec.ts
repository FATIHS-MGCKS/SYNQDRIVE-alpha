import { runTripObservabilitySafely } from './trip-fsm-observability-safe.util';

describe('runTripObservabilitySafely', () => {
  it('runs fn without throwing when observability succeeds', () => {
    const logger = { warn: jest.fn() };
    const fn = jest.fn();
    expect(() => runTripObservabilitySafely(logger, 'test', fn)).not.toThrow();
    expect(fn).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('swallows observability failures and warns once', () => {
    const logger = { warn: jest.fn() };
    runTripObservabilitySafely(logger, 'metric_emit', () => {
      throw new Error('prometheus down');
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Trip observability metric_emit failed: prometheus down'),
    );
  });

  it('does not rethrow when logger.warn itself throws', () => {
    const logger = {
      warn: jest.fn().mockImplementation(() => {
        throw new Error('logger broken');
      }),
    };
    expect(() =>
      runTripObservabilitySafely(logger, 'timeline', () => {
        throw new Error('timeline failed');
      }),
    ).not.toThrow();
  });
});
