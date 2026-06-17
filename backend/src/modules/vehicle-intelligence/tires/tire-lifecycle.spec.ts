import {
  resolveReplacementPositions,
  normalizeWheelPosition,
  normalizeMeasurementSource,
  TireLifecycleService,
} from './tire-lifecycle.service';

// ═══════════════════════════════════════════════════════════════════════════════
//  WHEEL POSITION NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeWheelPosition', () => {
  it('accepts short codes', () => {
    expect(normalizeWheelPosition('FL')).toBe('FL');
    expect(normalizeWheelPosition('fr')).toBe('FR');
    expect(normalizeWheelPosition(' rl ')).toBe('RL');
  });

  it('accepts long forms', () => {
    expect(normalizeWheelPosition('FRONT_LEFT')).toBe('FL');
    expect(normalizeWheelPosition('REAR_RIGHT')).toBe('RR');
    expect(normalizeWheelPosition('BACK_LEFT')).toBe('RL');
  });

  it('rejects garbage', () => {
    expect(normalizeWheelPosition('spare')).toBeNull();
    expect(normalizeWheelPosition(null)).toBeNull();
  });
});

describe('normalizeMeasurementSource', () => {
  it('defaults unknown sources to manual', () => {
    expect(normalizeMeasurementSource(undefined)).toBe('manual');
    expect(normalizeMeasurementSource('totally-made-up')).toBe('manual');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REPLACEMENT SCOPE → AFFECTED POSITIONS
//  (single = exactly one wheel, axle = exactly two on one axle, full = all four)
// ═══════════════════════════════════════════════════════════════════════════════

describe('resolveReplacementPositions', () => {
  it('full_set replaces all four wheels', () => {
    expect(resolveReplacementPositions('full_set')).toEqual(['FL', 'FR', 'RL', 'RR']);
  });

  it('single replaces only the one given wheel', () => {
    expect(resolveReplacementPositions('single', ['RR'])).toEqual(['RR']);
    expect(resolveReplacementPositions('single', ['FRONT_LEFT'])).toEqual(['FL']);
  });

  it('single rejects zero or multiple positions', () => {
    expect(() => resolveReplacementPositions('single', [])).toThrow();
    expect(() => resolveReplacementPositions('single', ['FL', 'FR'])).toThrow();
  });

  it('axle replaces exactly the two wheels on one axle', () => {
    expect(resolveReplacementPositions('axle', ['FRONT_AXLE'])).toEqual(['FL', 'FR']);
    expect(resolveReplacementPositions('axle', ['REAR'])).toEqual(['RL', 'RR']);
    expect(resolveReplacementPositions('axle', ['FL', 'FR'])).toEqual(['FL', 'FR']);
    expect(resolveReplacementPositions('axle', ['RL', 'RR'])).toEqual(['RL', 'RR']);
  });

  it('axle rejects a mixed-axle pair', () => {
    expect(() => resolveReplacementPositions('axle', ['FL', 'RR'])).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ROTATION MOVE MAPS — rotation must move tire identities between positions,
//  it is never a no-op note. Each map must be a permutation of all four wheels.
// ═══════════════════════════════════════════════════════════════════════════════

describe('rotation move maps', () => {
  // getRotationMoves is private but pure — exercise it via an instance with no DB use.
  const svc = new TireLifecycleService({} as any, {} as any, {} as any, {} as any);
  const moves = (template: string): Record<string, string> =>
    (svc as any).getRotationMoves(template);

  const ALL = ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT'];

  it.each(['front_to_rear', 'cross', 'side_swap', 'full_rotation'])(
    '%s is a real permutation that changes every position',
    (template) => {
      const map = moves(template);
      const sources = Object.keys(map).sort();
      const targets = Object.values(map).sort();
      // Covers all four wheels …
      expect(sources).toEqual([...ALL].sort());
      // … and is a bijection (no two tires land on the same wheel) …
      expect(new Set(targets).size).toBe(4);
      expect(targets).toEqual([...ALL].sort());
      // … and actually moves every tire (no identity mapping).
      for (const [from, to] of Object.entries(map)) {
        expect(from).not.toBe(to);
      }
    },
  );

  it('front_to_rear swaps the axles', () => {
    expect(moves('front_to_rear')).toMatchObject({
      FRONT_LEFT: 'REAR_LEFT',
      REAR_LEFT: 'FRONT_LEFT',
    });
  });

  it('unknown template yields no moves (caller rejects it)', () => {
    expect(moves('does_not_exist')).toEqual({});
  });
});
