import { buildContextWindow } from './event-context-window';

describe('buildContextWindow', () => {
  const anchor = new Date('2026-06-26T12:00:00.000Z');

  it('uses a symmetric T-30s..T+30s window for native behavior events', () => {
    const { windowStart, windowEnd } = buildContextWindow('DIMO_NATIVE_BEHAVIOR_EVENT', anchor);
    expect(windowStart.toISOString()).toBe('2026-06-26T11:59:30.000Z');
    expect(windowEnd.toISOString()).toBe('2026-06-26T12:00:30.000Z');
  });

  it('uses a T-30s..T+90s window by default for RPM webhook candidates', () => {
    const { windowStart, windowEnd } = buildContextWindow('RPM_WEBHOOK_CANDIDATE', anchor);
    expect(windowStart.toISOString()).toBe('2026-06-26T11:59:30.000Z');
    expect(windowEnd.toISOString()).toBe('2026-06-26T12:01:30.000Z');
  });

  it('allows a configurable RPM candidate post tail (e.g. 60s)', () => {
    const { windowStart, windowEnd } = buildContextWindow('RPM_WEBHOOK_CANDIDATE', anchor, {
      rpmCandidatePostSeconds: 60,
    });
    expect(windowStart.toISOString()).toBe('2026-06-26T11:59:30.000Z');
    expect(windowEnd.toISOString()).toBe('2026-06-26T12:01:00.000Z');
  });
});
