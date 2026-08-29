import type { DamageLocationView, DamageVehicleInsights } from './damage.types';
import {
  formatDamageEuroCents,
  resolveDamageLocationViewLabel,
  resolveDamageOneDayLabel,
  type VehicleDamagesTranslate,
} from './rental-vehicle-damages-i18n';

export function formatEvidenceCompletion(rate: number | null): string | null {
  if (rate == null) return null;
  return `${Math.round(rate * 100)}%`;
}

export function formatRepairDurationDays(
  days: number | null,
  sampleSize: number,
  t: VehicleDamagesTranslate,
): string | null {
  if (days == null || sampleSize <= 0) return null;
  if (days < 1) return t('vehicleDamages.insights.repairDuration.lessThanDay');
  if (days === 1) return resolveDamageOneDayLabel(t);
  return t('vehicleDamages.insights.repairDuration.days', { count: days });
}

export function formatCostLabel(
  cents: number | null,
  kind: 'estimated' | 'repair' | 'charged',
  locale: string,
  t: VehicleDamagesTranslate,
): string | null {
  if (cents == null) return null;
  const formatted = formatDamageEuroCents(locale, cents);
  if (!formatted) return null;
  if (kind === 'estimated') {
    return t('vehicleDamages.insights.cost.estimated', { amount: formatted });
  }
  if (kind === 'repair') {
    return t('vehicleDamages.insights.cost.repair', { amount: formatted });
  }
  return t('vehicleDamages.insights.cost.charged', { amount: formatted });
}

export interface DamageInsightCard {
  id: string;
  label: string;
  value: string;
  hint?: string;
}

export function buildVehicleInsightCards(
  insights: DamageVehicleInsights | null | undefined,
  locale: string,
  t: VehicleDamagesTranslate,
): DamageInsightCard[] {
  if (!insights?.hasEnoughData) return [];

  const cards: DamageInsightCard[] = [];

  if (insights.mostAffectedView && insights.mostAffectedViewCount > 0) {
    cards.push({
      id: 'most-view',
      label: t('vehicleDamages.insights.card.mostView'),
      value:
        resolveDamageLocationViewLabel(t, insights.mostAffectedView) ?? insights.mostAffectedView,
      hint: t('vehicleDamages.insights.card.mostViewHint', {
        count: insights.mostAffectedViewCount,
      }),
    });
  }

  if (insights.totalEstimatedOpenCostCents > 0) {
    cards.push({
      id: 'open-est',
      label: t('vehicleDamages.insights.card.openEst'),
      value:
        formatCostLabel(insights.totalEstimatedOpenCostCents, 'estimated', locale, t) ?? '—',
      hint: t('vehicleDamages.insights.card.openEstHint'),
    });
  }

  const repairLabel = formatCostLabel(insights.totalRepairCostCents, 'repair', locale, t);
  if (repairLabel) {
    cards.push({
      id: 'repair-total',
      label: t('vehicleDamages.insights.card.repairTotal'),
      value: repairLabel,
      hint: t('vehicleDamages.insights.card.repairTotalHint'),
    });
  }

  const chargedLabel = formatCostLabel(insights.totalChargedToCustomerCents, 'charged', locale, t);
  if (chargedLabel) {
    cards.push({
      id: 'charged',
      label: t('vehicleDamages.insights.card.charged'),
      value: chargedLabel,
      hint: t('vehicleDamages.insights.card.chargedHint'),
    });
  }

  const avgRepair = formatRepairDurationDays(
    insights.avgRepairDurationDays,
    insights.avgRepairDurationSampleSize,
    t,
  );
  if (avgRepair) {
    cards.push({
      id: 'avg-repair',
      label: t('vehicleDamages.insights.card.avgRepair'),
      value: avgRepair,
      hint: t('vehicleDamages.insights.card.avgRepairHint', {
        count: insights.avgRepairDurationSampleSize,
      }),
    });
  }

  const evidence = formatEvidenceCompletion(insights.evidenceCompletionRate);
  if (evidence) {
    cards.push({
      id: 'evidence',
      label: t('vehicleDamages.insights.card.evidence'),
      value: evidence,
      hint: t('vehicleDamages.insights.card.evidenceHint'),
    });
  }

  if (insights.openedLast30Days > 0 || insights.repairedLast30Days > 0) {
    cards.push({
      id: 'trend',
      label: t('vehicleDamages.insights.card.trend'),
      value: t('vehicleDamages.insights.card.trendValue', {
        opened: insights.openedLast30Days,
        repaired: insights.repairedLast30Days,
      }),
      hint: t('vehicleDamages.insights.card.trendHint'),
    });
  }

  if (insights.repeatLocationClusters.length > 0) {
    const top = insights.repeatLocationClusters[0];
    cards.push({
      id: 'repeat',
      label: t('vehicleDamages.insights.card.repeat'),
      value: `${resolveDamageLocationViewLabel(t, top.locationView)} (${top.damageCount})`,
      hint: top.label ?? t('vehicleDamages.insights.card.repeatHint'),
    });
  }

  return cards;
}

export function formatDamageViewLabel(
  view: DamageLocationView | null,
  t: VehicleDamagesTranslate,
): string | null {
  if (!view) return null;
  return resolveDamageLocationViewLabel(t, view);
}
