import type { PriceTariffVersion, TariffRate } from './pricingTypes';
import {
  formatDepositCents,
  formatNetAsGross,
  grossFromNetCents,
} from './pricingUtils';

export type TariffCompareFieldKey =
  | 'dailyRate'
  | 'weeklyRate'
  | 'monthlyRate'
  | 'includedKmPerDay'
  | 'extraKmPrice'
  | 'deposit'
  | 'insuranceCount'
  | 'extraCount'
  | 'mileagePackageCount';

export interface TariffCompareField {
  key: TariffCompareFieldKey;
  labelKey: string;
  liveLabel: string;
  draftLabel: string;
  changed: boolean;
}

function formatNetRate(
  cents: number,
  taxRate: number,
  currency: string | null,
): string {
  if (!currency || cents <= 0) return '—';
  return formatNetAsGross(cents, taxRate, currency);
}

export function buildLiveDraftComparison(params: {
  liveVersion: PriceTariffVersion | null;
  draftRate: TariffRate;
  draftPackagesCount: number;
  draftInsurancesCount: number;
  draftExtrasCount: number;
  taxRate: number;
  currency: string | null;
}): TariffCompareField[] {
  const liveRate = params.liveVersion?.rate;
  const draftRate = params.draftRate;
  const ccy = params.currency;

  const fields: Array<{
    key: TariffCompareFieldKey;
    labelKey: string;
    live: string;
    draft: string;
    changed: boolean;
  }> = [
    {
      key: 'dailyRate',
      labelKey: 'priceTariffs.editor.compare.dailyRate',
      live: formatNetRate(liveRate?.dailyRateCents ?? 0, params.taxRate, ccy),
      draft: formatNetRate(draftRate.dailyRateCents, params.taxRate, ccy),
      changed: (liveRate?.dailyRateCents ?? 0) !== draftRate.dailyRateCents,
    },
    {
      key: 'deposit',
      labelKey: 'priceTariffs.editor.compare.deposit',
      live: liveRate && ccy ? formatDepositCents(liveRate.depositAmountCents, ccy) : '—',
      draft: ccy ? formatDepositCents(draftRate.depositAmountCents, ccy) : '—',
      changed: (liveRate?.depositAmountCents ?? -1) !== draftRate.depositAmountCents,
    },
    {
      key: 'includedKmPerDay',
      labelKey: 'priceTariffs.editor.compare.includedKm',
      live: liveRate ? String(liveRate.includedKmPerDay) : '—',
      draft: String(draftRate.includedKmPerDay),
      changed: (liveRate?.includedKmPerDay ?? -1) !== draftRate.includedKmPerDay,
    },
    {
      key: 'extraKmPrice',
      labelKey: 'priceTariffs.editor.compare.extraKm',
      live: formatNetRate(liveRate?.extraKmPriceCents ?? 0, params.taxRate, ccy),
      draft: formatNetRate(draftRate.extraKmPriceCents, params.taxRate, ccy),
      changed: (liveRate?.extraKmPriceCents ?? -1) !== draftRate.extraKmPriceCents,
    },
    {
      key: 'weeklyRate',
      labelKey: 'priceTariffs.editor.compare.weeklyRate',
      live: formatNetRate(liveRate?.weeklyRateCents ?? 0, params.taxRate, ccy),
      draft: formatNetRate(draftRate.weeklyRateCents, params.taxRate, ccy),
      changed: (liveRate?.weeklyRateCents ?? 0) !== draftRate.weeklyRateCents,
    },
    {
      key: 'monthlyRate',
      labelKey: 'priceTariffs.editor.compare.monthlyRate',
      live: formatNetRate(liveRate?.monthlyRateCents ?? 0, params.taxRate, ccy),
      draft: formatNetRate(draftRate.monthlyRateCents, params.taxRate, ccy),
      changed: (liveRate?.monthlyRateCents ?? 0) !== draftRate.monthlyRateCents,
    },
    {
      key: 'mileagePackageCount',
      labelKey: 'priceTariffs.editor.compare.mileagePackages',
      live: String(params.liveVersion?.mileagePackages.filter((p) => p.isActive).length ?? 0),
      draft: String(params.draftPackagesCount),
      changed:
        (params.liveVersion?.mileagePackages.filter((p) => p.isActive).length ?? 0) !==
        params.draftPackagesCount,
    },
    {
      key: 'insuranceCount',
      labelKey: 'priceTariffs.editor.compare.insurance',
      live: String(params.liveVersion?.insuranceOptions.filter((o) => o.isActive).length ?? 0),
      draft: String(params.draftInsurancesCount),
      changed:
        (params.liveVersion?.insuranceOptions.filter((o) => o.isActive).length ?? 0) !==
        params.draftInsurancesCount,
    },
    {
      key: 'extraCount',
      labelKey: 'priceTariffs.editor.compare.extras',
      live: String(params.liveVersion?.extraOptions.filter((o) => o.isActive).length ?? 0),
      draft: String(params.draftExtrasCount),
      changed:
        (params.liveVersion?.extraOptions.filter((o) => o.isActive).length ?? 0) !==
        params.draftExtrasCount,
    },
  ];

  return fields.map((f) => ({
    key: f.key,
    labelKey: f.labelKey,
    liveLabel: f.live,
    draftLabel: f.draft,
    changed: f.changed,
  }));
}

export function grossPreviewFromNet(
  netCents: number,
  taxRate: number,
  currency: string | null,
): string {
  if (!currency || netCents <= 0) return '—';
  return formatNetAsGross(netCents, taxRate, currency);
}

export function netPreviewFromGrossInput(grossMajor: number, taxRate: number): number {
  if (!Number.isFinite(grossMajor) || grossMajor <= 0) return 0;
  const grossCents = Math.round(grossMajor * 100);
  return Math.round(grossCents / (1 + taxRate / 100));
}

export function grossMajorFromNetCents(netCents: number, taxRate: number): number {
  return grossFromNetCents(netCents, taxRate) / 100;
}
