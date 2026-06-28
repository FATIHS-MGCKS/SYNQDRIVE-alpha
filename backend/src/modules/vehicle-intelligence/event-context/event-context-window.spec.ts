import { buildContextWindow } from './event-context-window';

describe('buildContextWindow', () => {
  const anchor = new Date('2026-06-26T12:00:00.000Z');

  it('uses a symmetric T-30s..T+30s window for native behavior events', () => {
    const { windowStart, windowEnd } = buildContextWindow('DIMO_NATIVE_BEHAVIOR_EVENT', anchor);
    expect(windowStart.toISOString()).toBe('2026-06-26T11:59:30.000Z');
    expect(windowEnd.toISOString()).toBe('2026-06-26T12:00:30.000Z');
  });
});
