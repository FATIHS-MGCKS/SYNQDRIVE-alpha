import { classifyActivityForGeometry } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';
import {
  parseStrictCanaryTokenId,
  resolveGeometryActivityAuthorityByWindow,
  resolveGeometryActivityAuthorityFromSpeedObservations,
  type Exp021CanarySpeedObservation,
} from './reference-capture-exp021-maturation-shadow-canary-activity.lib';

describe('reference-capture-exp021-maturation-shadow-canary-activity.lib', () => {
  const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');

  it('strict token parsing accepts canonical decimal integers only', () => {
    expect(parseStrictCanaryTokenId('187336')).toBe(187336);
    expect(() => parseStrictCanaryTokenId('187336abc')).toThrow('strict decimal integer');
    expect(() => parseStrictCanaryTokenId('187336.5')).toThrow('strict decimal integer');
    expect(() => parseStrictCanaryTokenId('+187336')).toThrow('strict decimal integer');
    expect(() => parseStrictCanaryTokenId('')).toThrow('strict decimal integer');
  });

  it('derives geometry-specific activity from independent speed observations', () => {
    const observations: Exp021CanarySpeedObservation[] = [
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:58:45.000Z'),
        normalizedValueJson: 0,
      },
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:59:50.000Z'),
        normalizedValueJson: 42,
      },
    ];

    const byGeometry = resolveGeometryActivityAuthorityByWindow(observations, canonicalWindowTo);
    const motion60 = classifyActivityForGeometry(60_000, byGeometry[60_000]);
    const idle90 = classifyActivityForGeometry(90_000, byGeometry[90_000]);

    expect(motion60.class).toBe('ACTIVE_MOTION');
    expect(idle90.class).toBe('ACTIVE_IDLE');
    expect(byGeometry[60_000]).not.toEqual(byGeometry[90_000]);
  });

  it('does not duplicate one latest speed sample to both geometries', () => {
    const observations: Exp021CanarySpeedObservation[] = [
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:58:45.000Z'),
        normalizedValueJson: 0,
      },
    ];

    const only60 = resolveGeometryActivityAuthorityFromSpeedObservations(
      observations,
      canonicalWindowTo,
      60_000,
    );
    const only90 = resolveGeometryActivityAuthorityFromSpeedObservations(
      observations,
      canonicalWindowTo,
      90_000,
    );

    expect(only60).toEqual({});
    expect(only90.speedKmh).toBe(0);
  });

  it('returns UNKNOWN_ACTIVITY when geometry window has no speed evidence', () => {
    const authority = resolveGeometryActivityAuthorityByWindow([], canonicalWindowTo);
    expect(classifyActivityForGeometry(60_000, authority[60_000]).class).toBe('UNKNOWN_ACTIVITY');
    expect(classifyActivityForGeometry(90_000, authority[90_000]).class).toBe('UNKNOWN_ACTIVITY');
  });

  it('same geometry classification is lane-independent', () => {
    const authority = {
      60_000: { speedKmh: 40, speedSignalFresh: true },
      90_000: { speedKmh: 0, speedSignalFresh: true, vehicleTelemetryFresh: true },
    };
    const hf60 = classifyActivityForGeometry(60_000, authority[60_000]);
    const settlement60 = classifyActivityForGeometry(60_000, authority[60_000]);
    expect(hf60).toEqual(settlement60);
  });
});
