import type { VoicePlanCatalogEntry, VoicePlanCode } from '../../../lib/api';
import { formatMoneyCents } from '../../../lib/money';

/** Default recommended tier — marketing only; prices always come from API catalog. */
export const RECOMMENDED_VOICE_PLAN: VoicePlanCode = 'PRO';

export type VoicePlanComparisonRow = {
  key: string;
  labelKey: string;
  values: Record<VoicePlanCode, string>;
};

export function formatBranchLimit(
  plan: VoicePlanCatalogEntry,
  unlimitedLabel: string,
): string {
  return plan.entitlements.maxBranches == null
    ? unlimitedLabel
    : String(plan.entitlements.maxBranches);
}

export function formatPlanMoney(
  cents: number,
  currency: string,
  locale: string,
): string {
  return formatMoneyCents(cents, currency, locale);
}

export function formatOverageRate(
  centsPerMinute: number,
  currency: string,
  locale: string,
): string {
  return formatMoneyCents(centsPerMinute, currency, locale);
}

export function isPlanChangeSelection(
  activePlan: VoicePlanCode | null,
  candidate: VoicePlanCode,
): boolean {
  return Boolean(activePlan && activePlan !== candidate);
}

export function buildPlanComparisonRows(
  plans: VoicePlanCatalogEntry[],
  labels: {
    unlimited: string;
    includedMinutes: string;
    overage: string;
    numbers: string;
    locations: string;
    parallel: string;
    setupFee: string;
    languages: string;
  },
  locale: string,
): VoicePlanComparisonRow[] {
  const byCode = Object.fromEntries(plans.map(p => [p.code, p])) as Record<
    VoicePlanCode,
    VoicePlanCatalogEntry
  >;

  const row = (
    key: string,
    labelKey: string,
    map: (plan: VoicePlanCatalogEntry) => string,
  ): VoicePlanComparisonRow => ({
    key,
    labelKey,
    values: {
      START: map(byCode.START),
      PRO: map(byCode.PRO),
      BUSINESS: map(byCode.BUSINESS),
    },
  });

  return [
    row('includedMinutes', labels.includedMinutes, p =>
      String(p.entitlements.includedMinutesPerMonth),
    ),
    row('overage', labels.overage, p =>
      formatOverageRate(p.entitlements.overageCentsPerMinute, p.currency, locale),
    ),
    row('numbers', labels.numbers, p => String(p.entitlements.localPhoneNumbers)),
    row('locations', labels.locations, p => formatBranchLimit(p, labels.unlimited)),
    row('parallel', labels.parallel, p => String(p.entitlements.maxConcurrentCalls)),
    row('languages', labels.languages, p =>
      p.entitlements.supportedLanguages.map(l => l.toUpperCase()).join(', '),
    ),
    row('setupFee', labels.setupFee, p =>
      formatPlanMoney(p.setupFeeCents, p.currency, locale),
    ),
  ];
}

export function maxAdditionalLanguages(plan: VoicePlanCatalogEntry | null): number {
  if (!plan) return 0;
  return Math.max(0, plan.entitlements.supportedLanguages.length - 1);
}

export function isLanguageAllowedByPlan(
  plan: VoicePlanCatalogEntry | null,
  languageCode: string,
): boolean {
  if (!plan || !languageCode) return true;
  return plan.entitlements.supportedLanguages.includes(languageCode);
}
