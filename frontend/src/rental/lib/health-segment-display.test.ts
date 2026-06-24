import { describe, expect, it } from 'vitest';
import { segmentFromHealthState } from './health-segment-display';

describe('health segment display mapping', () => {
  it('maps known states to presentation-only segment levels', () => {
    expect(segmentFromHealthState('GOOD')).toMatchObject({ level: 3, tone: 'good' });
    expect(segmentFromHealthState('WARNING')).toMatchObject({ level: 2, tone: 'warning' });
    expect(segmentFromHealthState('WATCH')).toMatchObject({ level: 2, tone: 'warning' });
    expect(segmentFromHealthState('CRITICAL')).toMatchObject({ level: 1, tone: 'critical' });
    expect(segmentFromHealthState('UNKNOWN')).toMatchObject({ level: 0, tone: 'neutral' });
  });

  it('uses percent only when no state is available', () => {
    expect(segmentFromHealthState(undefined, 80)).toMatchObject({ level: 3, tone: 'good' });
    expect(segmentFromHealthState(undefined, 50)).toMatchObject({ level: 2, tone: 'warning' });
    expect(segmentFromHealthState(undefined, 10)).toMatchObject({ level: 1, tone: 'critical' });
    expect(segmentFromHealthState(undefined, null)).toMatchObject({ level: 0, tone: 'neutral' });
  });

  it('keeps explicit unknown muted even with a percent fallback', () => {
    expect(segmentFromHealthState('UNKNOWN', 80)).toMatchObject({ level: 0, tone: 'neutral' });
  });
});

