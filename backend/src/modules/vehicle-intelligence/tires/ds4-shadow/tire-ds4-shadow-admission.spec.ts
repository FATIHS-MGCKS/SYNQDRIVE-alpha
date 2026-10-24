import { classifyDs4EventQuality, durationSecondsFromUtcLabels } from './tire-ds4-shadow-admission';

describe('tire-ds4-shadow-admission', () => {
  it('classifies artefact suspect ahead of quality label', () => {
    expect(classifyDs4EventQuality('OK', true)).toBe('ARTEFACT_SUSPECT');
    expect(classifyDs4EventQuality('OK', false)).toBe('OK');
    expect(classifyDs4EventQuality('DEGRADED', false)).toBe('DEGRADED');
    expect(classifyDs4EventQuality('LIMITED', false)).toBe('LIMITED');
  });

  it('derives duration from UTC labels', () => {
    expect(
      durationSecondsFromUtcLabels('2026-01-01T10:00:00.000Z', '2026-01-01T10:00:03.000Z'),
    ).toBe(3);
    expect(durationSecondsFromUtcLabels('bad', '2026-01-01T10:00:03.000Z')).toBeNull();
  });
});
