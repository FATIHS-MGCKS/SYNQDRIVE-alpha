import { describe, expect, it } from 'vitest';
import { buildVehicleInsightCards, formatCostLabel } from './damage-insights';
import type { DamageVehicleInsights } from './damage.types';

describe('damage-insights', () => {
  it('formatCostLabel distinguishes estimated vs repair vs charged', () => {
    expect(formatCostLabel(15000, 'estimated')).toContain('(est.)');
    expect(formatCostLabel(12000, 'repair')).toContain('(actual)');
    expect(formatCostLabel(5000, 'charged')).toContain('(charged)');
    expect(formatCostLabel(null, 'repair')).toBeNull();
  });

  it('buildVehicleInsightCards returns empty without data', () => {
    expect(buildVehicleInsightCards(null)).toEqual([]);
    expect(buildVehicleInsightCards({ hasEnoughData: false } as DamageVehicleInsights)).toEqual([]);
  });

  it('buildVehicleInsightCards never mixes estimated as repair cost', () => {
    const cards = buildVehicleInsightCards({
      hasEnoughData: true,
      totalDamages: 2,
      mostAffectedView: 'FRONT',
      mostAffectedViewCount: 2,
      totalRepairCostCents: null,
      totalEstimatedOpenCostCents: 9900,
      totalChargedToCustomerCents: null,
      avgRepairDurationDays: null,
      avgRepairDurationSampleSize: 0,
      evidenceCompletionRate: null,
      openedLast30Days: 1,
      repairedLast30Days: 0,
      repeatLocationClusters: [],
      heatmapByView: {},
    });
    const labels = cards.map((c) => c.id);
    expect(labels).toContain('open-est');
    expect(labels).not.toContain('repair-total');
    expect(cards.find((c) => c.id === 'open-est')?.value).toContain('(est.)');
  });
});
