import type { DamageLocationView, DamageVehicleInsights } from './damage.types';
import { formatEuroCents } from './damage.types';

const VIEW_LABELS: Record<DamageLocationView, string> = {
  FRONT: 'Front',
  LEFT: 'Left',
  RIGHT: 'Right',
  REAR: 'Rear',
  ROOF: 'Roof',
  UNKNOWN: 'Unknown',
};

export function formatDamageViewLabel(view: DamageLocationView | null): string | null {
  if (!view) return null;
  return VIEW_LABELS[view] ?? view;
}

export function formatEvidenceCompletion(rate: number | null): string | null {
  if (rate == null) return null;
  return `${Math.round(rate * 100)}%`;
}

export function formatRepairDurationDays(days: number | null, sampleSize: number): string | null {
  if (days == null || sampleSize <= 0) return null;
  if (days < 1) return '<1 day';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function formatCostLabel(
  cents: number | null,
  kind: 'estimated' | 'repair' | 'charged',
): string | null {
  if (cents == null) return null;
  const formatted = formatEuroCents(cents);
  if (!formatted) return null;
  if (kind === 'estimated') return `${formatted} (est.)`;
  if (kind === 'repair') return `${formatted} (actual)`;
  return `${formatted} (charged)`;
}

export interface DamageInsightCard {
  id: string;
  label: string;
  value: string;
  hint?: string;
}

export function buildVehicleInsightCards(
  insights: DamageVehicleInsights | null | undefined,
): DamageInsightCard[] {
  if (!insights?.hasEnoughData) return [];

  const cards: DamageInsightCard[] = [];

  if (insights.mostAffectedView && insights.mostAffectedViewCount > 0) {
    cards.push({
      id: 'most-view',
      label: 'Most damages',
      value: formatDamageViewLabel(insights.mostAffectedView) ?? insights.mostAffectedView,
      hint: `${insights.mostAffectedViewCount} recorded`,
    });
  }

  if (insights.totalEstimatedOpenCostCents > 0) {
    cards.push({
      id: 'open-est',
      label: 'Open estimated cost',
      value: formatCostLabel(insights.totalEstimatedOpenCostCents, 'estimated') ?? '—',
      hint: 'Active damages only — not final repair cost',
    });
  }

  const repairLabel = formatCostLabel(insights.totalRepairCostCents, 'repair');
  if (repairLabel) {
    cards.push({
      id: 'repair-total',
      label: 'Total repair cost',
      value: repairLabel,
      hint: 'Recorded actual repair costs',
    });
  }

  const chargedLabel = formatCostLabel(insights.totalChargedToCustomerCents, 'charged');
  if (chargedLabel) {
    cards.push({
      id: 'charged',
      label: 'Charged to customer',
      value: chargedLabel,
      hint: 'Recorded charges — not invoiced automatically',
    });
  }

  const avgRepair = formatRepairDurationDays(
    insights.avgRepairDurationDays,
    insights.avgRepairDurationSampleSize,
  );
  if (avgRepair) {
    cards.push({
      id: 'avg-repair',
      label: 'Avg repair time',
      value: avgRepair,
      hint: `Based on ${insights.avgRepairDurationSampleSize} repaired case(s)`,
    });
  }

  const evidence = formatEvidenceCompletion(insights.evidenceCompletionRate);
  if (evidence) {
    cards.push({
      id: 'evidence',
      label: 'Evidence completion',
      value: evidence,
      hint: 'Active damages with at least partial photos',
    });
  }

  if (insights.openedLast30Days > 0 || insights.repairedLast30Days > 0) {
    cards.push({
      id: 'trend',
      label: 'Last 30 days',
      value: `${insights.openedLast30Days} opened · ${insights.repairedLast30Days} repaired`,
      hint: 'Recent activity on this vehicle',
    });
  }

  if (insights.repeatLocationClusters.length > 0) {
    const top = insights.repeatLocationClusters[0];
    cards.push({
      id: 'repeat',
      label: 'Repeat area',
      value: `${formatDamageViewLabel(top.locationView)} (${top.damageCount})`,
      hint: top.label ?? 'Clustered map positions',
    });
  }

  return cards;
}
