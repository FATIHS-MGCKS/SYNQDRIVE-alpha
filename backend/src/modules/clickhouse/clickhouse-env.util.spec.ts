import { isClickHouseTripAssistEnabled, isHfMirrorEnabled, resolveHfMirrorFlagStatus } from './clickhouse-env.util';

describe('clickhouse-env.util', () => {
  const ORIGINAL_HF = process.env.HF_MIRROR_ENABLED;
  const ORIGINAL_ASSIST = process.env.CLICKHOUSE_TRIP_ASSIST_ENABLED;

  afterEach(() => {
    if (ORIGINAL_HF === undefined) delete process.env.HF_MIRROR_ENABLED;
    else process.env.HF_MIRROR_ENABLED = ORIGINAL_HF;
    if (ORIGINAL_ASSIST === undefined) delete process.env.CLICKHOUSE_TRIP_ASSIST_ENABLED;
    else process.env.CLICKHOUSE_TRIP_ASSIST_ENABLED = ORIGINAL_ASSIST;
  });

  it('HF mirror defaults off', () => {
    delete process.env.HF_MIRROR_ENABLED;
    expect(isHfMirrorEnabled()).toBe(false);
    expect(resolveHfMirrorFlagStatus()).toBe('disabled');
  });

  it('trip assist defaults on unless explicitly false', () => {
    delete process.env.CLICKHOUSE_TRIP_ASSIST_ENABLED;
    expect(isClickHouseTripAssistEnabled()).toBe(true);
    process.env.CLICKHOUSE_TRIP_ASSIST_ENABLED = 'false';
    expect(isClickHouseTripAssistEnabled()).toBe(false);
  });
});
