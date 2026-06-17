import {
  dtcBandToHealthState,
  getSeverityDisplay,
  isSafetyCriticalDtcBand,
  normalizeDtcSeverityBand,
} from './dtc-severity.util';

describe('dtc-severity.util', () => {
  it.each([
    ['critical', 'high'],
    ['CRITICAL', 'high'],
    ['high', 'high'],
    ['severe', 'high'],
    ['safety_critical', 'high'],
    ['warning', 'medium'],
    ['medium', 'medium'],
    ['info', 'low'],
    ['low', 'low'],
  ])('getSeverityDisplay(%s) => %s', (input, expected) => {
    expect(getSeverityDisplay(input)).toBe(expected);
  });

  it('critical severity band maps to critical health state', () => {
    const band = normalizeDtcSeverityBand('critical');
    expect(isSafetyCriticalDtcBand(band)).toBe(true);
    expect(dtcBandToHealthState(band)).toBe('critical');
  });

  it('missing severity is warning not good', () => {
    expect(dtcBandToHealthState(normalizeDtcSeverityBand(null))).toBe('warning');
  });
});
