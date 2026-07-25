import {
  findDuplicateDamageCandidate,
  isDuplicateDamageCandidate,
} from './damage-dedup.util';
import {
  assertDamageMutable,
  isFinalDamageStatus,
} from './damage-status-transition.util';

describe('damage-dedup.util', () => {
  const existing = {
    id: 'd1',
    damageType: 'SCRATCH',
    severity: 'MODERATE',
    description: 'Front bumper',
    locationLabel: 'Front',
    status: 'OPEN',
  };

  it('detects duplicate by type and overlapping area', () => {
    expect(
      isDuplicateDamageCandidate(
        existing,
        { damageType: 'SCRATCH', severity: 'MINOR', description: 'other', locationLabel: 'Front' },
        ['Front'],
      ),
    ).toBe(true);
  });

  it('does not duplicate unrelated damage', () => {
    const dup = findDuplicateDamageCandidate(
      [existing],
      { damageType: 'DENT', severity: 'MAJOR', description: 'Rear door', locationLabel: 'Rear' },
      ['Rear'],
    );
    expect(dup).toBeNull();
  });
});

describe('damage-status-transition.util', () => {
  it('treats repaired and archived as final', () => {
    expect(isFinalDamageStatus('REPAIRED')).toBe(true);
    expect(isFinalDamageStatus('ARCHIVED')).toBe(true);
    expect(isFinalDamageStatus('OPEN')).toBe(false);
  });

  it('blocks mutation of final damage', () => {
    expect(() => assertDamageMutable('REPAIRED')).toThrow(/final/i);
  });
});
