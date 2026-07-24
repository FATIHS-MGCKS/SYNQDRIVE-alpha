import type { EvaluationsRecommendationMoney } from '@synq/evaluations-insights/evaluations-recommendations';

export function formatRecommendationMoney(
  value: EvaluationsRecommendationMoney | null | undefined,
  locale: string,
): string {
  if (!value) return '—';
  const major = value.amountMinor / 100;
  try {
    return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
      style: 'currency',
      currency: value.currency,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${major.toFixed(0)} ${value.currency}`;
  }
}

export function formatRecommendationDueDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
      dateStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
