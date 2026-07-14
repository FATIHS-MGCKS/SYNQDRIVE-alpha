export const ALLOWED_TAX_RATES = [0, 7, 19] as const;
export const SYSTEM_DEFAULT_VAT_RATE = 19;

export type OrgTaxSettings = {
  defaultVatRate?: number | null;
  isSmallBusiness?: boolean;
};

export type TaxComputationMeta = {
  usedLegacyGrossSplit: boolean;
  assumedTaxRatePercent: number;
  reason: string;
};

/** Org-scoped default VAT — 0 % for Kleinunternehmer, else configured or system default. */
export function resolveOrgDefaultTaxRate(org: OrgTaxSettings): number {
  if (org.isSmallBusiness) return 0;
  if (org.defaultVatRate != null && Number.isFinite(org.defaultVatRate)) {
    const rounded = Math.round(org.defaultVatRate);
    if (ALLOWED_TAX_RATES.includes(rounded as (typeof ALLOWED_TAX_RATES)[number])) {
      return rounded;
    }
  }
  return SYSTEM_DEFAULT_VAT_RATE;
}

export function normalizeTaxRate(
  rate: number | undefined | null,
  defaultRate: number = SYSTEM_DEFAULT_VAT_RATE,
): number {
  if (rate == null || !Number.isFinite(rate)) return defaultRate;
  const rounded = Math.round(rate);
  return ALLOWED_TAX_RATES.includes(rounded as (typeof ALLOWED_TAX_RATES)[number])
    ? rounded
    : defaultRate;
}

export function netCentsFromGrossCents(grossCents: number, taxRatePercent: number): number {
  const gross = Math.max(0, Math.round(grossCents));
  if (taxRatePercent <= 0) return gross;
  return Math.round(gross / (1 + taxRatePercent / 100));
}

export function taxCentsFromNetCents(netCents: number, taxRatePercent: number): number {
  const net = Math.max(0, Math.round(netCents));
  if (taxRatePercent <= 0) return 0;
  return Math.round((net * taxRatePercent) / 100);
}

export function grossCentsFromNetCents(netCents: number, taxRatePercent: number): number {
  const net = Math.max(0, Math.round(netCents));
  return net + taxCentsFromNetCents(net, taxRatePercent);
}

export function splitGrossCents(
  grossCents: number,
  taxRatePercent: number,
): { netCents: number; taxCents: number; grossCents: number } {
  const gross = Math.max(0, Math.round(grossCents));
  const netCents = netCentsFromGrossCents(gross, taxRatePercent);
  const taxCents = gross - netCents;
  return { netCents, taxCents, grossCents: gross };
}

export function legacyGrossSplitMeta(taxRatePercent: number, reason: string): TaxComputationMeta {
  return {
    usedLegacyGrossSplit: true,
    assumedTaxRatePercent: taxRatePercent,
    reason,
  };
}
