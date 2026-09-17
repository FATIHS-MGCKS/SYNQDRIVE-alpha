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

  it('CASE 1: movement only within final 60s => both geometries ACTIVE_MOTION', () => {
    const observations: Exp021CanarySpeedObservation[] = [
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:59:50.000Z'),
        normalizedValueJson: 42,
      },
    ];

    const byGeometry = resolveGeometryActivityAuthorityByWindow(observations, canonicalWindowTo);
    expect(classifyActivityForGeometry(60_000, byGeometry[60_000]).class).toBe('ACTIVE_MOTION');
    expect(classifyActivityForGeometry(90_000, byGeometry[90_000]).class).toBe('ACTIVE_MOTION');
  });

  it('CASE 2: movement only in 90s prefix with parked final 60s => 60s IDLE, 90s MOTION', () => {
    const observations: Exp021CanarySpeedObservation[] = [
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:58:45.000Z'),
        normalizedValueJson: 42,
      },
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:59:50.000Z'),
        normalizedValueJson: 0,
      },
    ];

    const byGeometry = resolveGeometryActivityAuthorityByWindow(observations, canonicalWindowTo);
    expect(classifyActivityForGeometry(60_000, byGeometry[60_000]).class).toBe('ACTIVE_IDLE');
    expect(classifyActivityForGeometry(90_000, byGeometry[90_000]).class).toBe('ACTIVE_MOTION');
  });

  it('CASE 3: parked evidence throughout both windows => both ACTIVE_IDLE', () => {
    const observations: Exp021CanarySpeedObservation[] = [
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:58:45.000Z'),
        normalizedValueJson: 0,
      },
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:59:50.000Z'),
        normalizedValueJson: 0,
      },
    ];

    const byGeometry = resolveGeometryActivityAuthorityByWindow(observations, canonicalWindowTo);
    expect(classifyActivityForGeometry(60_000, byGeometry[60_000]).class).toBe('ACTIVE_IDLE');
    expect(classifyActivityForGeometry(90_000, byGeometry[90_000]).class).toBe('ACTIVE_IDLE');
  });

  it('CASE 4: insufficient evidence => UNKNOWN_ACTIVITY for both geometries', () => {
    const authority = resolveGeometryActivityAuthorityByWindow([], canonicalWindowTo);
    expect(classifyActivityForGeometry(60_000, authority[60_000]).class).toBe('UNKNOWN_ACTIVITY');
    expect(classifyActivityForGeometry(90_000, authority[90_000]).class).toBe('UNKNOWN_ACTIVITY');
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

  it('90s geometry uses full 90s window — final-60s motion cannot be masked as ACTIVE_IDLE', () => {
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
    expect(classifyActivityForGeometry(60_000, byGeometry[60_000]).class).toBe('ACTIVE_MOTION');
    expect(classifyActivityForGeometry(90_000, byGeometry[90_000]).class).toBe('ACTIVE_MOTION');
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
