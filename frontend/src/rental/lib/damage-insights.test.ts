import { describe, expect, it } from 'vitest';
import { buildVehicleInsightCards, formatCostLabel } from './damage-insights';
import type { DamageVehicleInsights } from './damage.types';

const t = (key: string, vars?: Record<string, string | number>) => {
  if (key === 'vehicleDamages.insights.cost.estimated' && vars?.amount) {
    return `${vars.amount} (est.)`;
  }
  if (key === 'vehicleDamages.insights.cost.repair' && vars?.amount) {
    return `${vars.amount} (actual)`;
  }
  if (key === 'vehicleDamages.insights.cost.charged' && vars?.amount) {
    return `${vars.amount} (charged)`;
  }
  if (vars) {
    return `${key}:${JSON.stringify(vars)}`;
  }
  return key;
};

describe('damage-insights', () => {
  it('formatCostLabel distinguishes estimated vs repair vs charged', () => {
    expect(formatCostLabel(15000, 'estimated', 'en-GB', t)).toContain('(est.)');
    expect(formatCostLabel(12000, 'repair', 'en-GB', t)).toContain('(actual)');
    expect(formatCostLabel(5000, 'charged', 'en-GB', t)).toContain('(charged)');
    expect(formatCostLabel(null, 'repair', 'en-GB', t)).toBeNull();
  });

  it('buildVehicleInsightCards returns empty without data', () => {
    expect(buildVehicleInsightCards(null, 'en-GB', t)).toEqual([]);
    expect(buildVehicleInsightCards({ hasEnoughData: false } as DamageVehicleInsights, 'en-GB', t)).toEqual([]);
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
    }, 'en-GB', t);
    const labels = cards.map((c) => c.id);
    expect(labels).toContain('open-est');
    expect(labels).not.toContain('repair-total');
    expect(cards.find((c) => c.id === 'open-est')?.value).toContain('(est.)');
  });
});
