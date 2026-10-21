import {
  resolveSupersededRefuelSiblingIds,
  shouldSupersedeRefuelSibling,
  type RefuelEventWindow,
} from './refuel-sibling-reconciliation';
import {
  KS_MX_2024_AUG28_DETECTION,
  KS_MX_2024_AUG28_STALE_SIBLING,
} from '@modules/dimo/fixtures/ks-mx-2024-aug28-refuel.fixture';

function window(
  overrides: Partial<RefuelEventWindow> & Pick<RefuelEventWindow, 'id' | 'dimoSegmentId'>,
): RefuelEventWindow {
  return {
    startTime: new Date(KS_MX_2024_AUG28_DETECTION.startTime),
    endTime: new Date(KS_MX_2024_AUG28_DETECTION.endTime),
    durationSeconds: KS_MX_2024_AUG28_DETECTION.durationSeconds,
    fuelDeltaPercent: KS_MX_2024_AUG28_DETECTION.fuelDeltaPercent,
    fuelDeltaLiters: KS_MX_2024_AUG28_DETECTION.fuelDeltaLiters,
    ...overrides,
  };
}

describe('refuel sibling reconciliation', () => {
  it('supersedes KS MX 2024 stale partial segment under canonical envelope', () => {
    const canonical = window({
      id: 'canonical-id',
      dimoSegmentId: KS_MX_2024_AUG28_DETECTION.dimoSegmentId,
    });
    const sibling = window({
      id: 'stale-id',
      dimoSegmentId: KS_MX_2024_AUG28_STALE_SIBLING.dimoSegmentId,
      startTime: new Date(KS_MX_2024_AUG28_STALE_SIBLING.startTime),
      endTime: new Date(KS_MX_2024_AUG28_STALE_SIBLING.endTime),
      durationSeconds: KS_MX_2024_AUG28_STALE_SIBLING.durationSeconds,
      fuelDeltaLiters: KS_MX_2024_AUG28_STALE_SIBLING.fuelDeltaLiters,
      fuelDeltaPercent: KS_MX_2024_AUG28_STALE_SIBLING.fuelDeltaPercent,
    });

    expect(shouldSupersedeRefuelSibling(canonical, sibling)).toBe(true);
    expect(resolveSupersededRefuelSiblingIds([canonical], [sibling])).toEqual([
      'stale-id',
    ]);
  });

  it('does not merge two genuinely separate refuels', () => {
    const earlier = window({
      id: 'earlier',
      dimoSegmentId: 'dimo-refuel-187336-1000',
      startTime: new Date('2026-08-28T08:00:00.000Z'),
      endTime: new Date('2026-08-28T08:20:00.000Z'),
      durationSeconds: 1200,
      fuelDeltaPercent: 20,
      fuelDeltaLiters: 12,
    });
    const later = window({
      id: 'later',
      dimoSegmentId: 'dimo-refuel-187336-2000',
      startTime: new Date('2026-08-28T18:00:00.000Z'),
      endTime: new Date('2026-08-28T18:25:00.000Z'),
      durationSeconds: 1500,
      fuelDeltaPercent: 25,
      fuelDeltaLiters: 15,
    });

    expect(shouldSupersedeRefuelSibling(later, earlier)).toBe(false);
    expect(resolveSupersededRefuelSiblingIds([later], [earlier])).toEqual([]);
  });

  it('is idempotent when canonical is not longer than sibling', () => {
    const short = window({
      id: 'short',
      dimoSegmentId: 'dimo-refuel-187336-3000',
      durationSeconds: 600,
    });
    const long = window({
      id: 'long',
      dimoSegmentId: 'dimo-refuel-187336-4000',
      durationSeconds: 3600,
    });
    expect(shouldSupersedeRefuelSibling(short, long)).toBe(false);
  });
});
