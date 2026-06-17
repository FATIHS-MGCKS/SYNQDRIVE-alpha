import {
  computeOverallState,
  type HealthState,
  type ModuleHealth,
} from './rental-health.types';
import {
  dtcBandToHealthState,
  isSafetyCriticalDtcBand,
  maxDtcSeverityBand,
  normalizeDtcSeverityBand,
} from '../vehicle-intelligence/dtc/dtc-severity.util';

describe('computeOverallState', () => {
  const mod = (state: HealthState): Pick<ModuleHealth, 'state'> => ({ state });

  it('unknown is never promoted to good', () => {
    expect(computeOverallState([mod('good'), mod('unknown')])).toBe('unknown');
  });

  it('all good => good', () => {
    expect(computeOverallState([mod('good'), mod('good')])).toBe('good');
  });

  it('n_a modules are excluded from aggregate', () => {
    expect(computeOverallState([mod('good'), mod('n_a')])).toBe('good');
    expect(computeOverallState([mod('n_a')])).toBe('unknown');
  });
});

describe('normalizeDtcSeverityBand', () => {
  it.each([
    ['critical', 'critical'],
    ['CRITICAL', 'critical'],
    ['high', 'critical'],
    ['severe', 'critical'],
    ['safety_critical', 'critical'],
    ['warning', 'warning'],
    ['medium', 'warning'],
    ['moderate', 'warning'],
    ['info', 'info'],
    ['low', 'info'],
    ['minor', 'info'],
    ['', 'unknown'],
    [null, 'unknown'],
  ])('%s => %s', (input, expected) => {
    expect(normalizeDtcSeverityBand(input)).toBe(expected);
  });

  it('critical DTC with critical severity band blocks safety', () => {
    const band = normalizeDtcSeverityBand('critical');
    expect(isSafetyCriticalDtcBand(band)).toBe(true);
    expect(dtcBandToHealthState(band)).toBe('critical');
  });

  it('max severity across mixed faults', () => {
    expect(
      maxDtcSeverityBand([
        normalizeDtcSeverityBand('info'),
        normalizeDtcSeverityBand('critical'),
        normalizeDtcSeverityBand('medium'),
      ]),
    ).toBe('critical');
  });
});
