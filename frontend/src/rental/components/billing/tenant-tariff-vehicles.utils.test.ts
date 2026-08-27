import { describe, expect, it } from 'vitest';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import type {
  TenantSubscriptionTariffPricingDto,
  TenantVehicleBillingChangeDto,
} from '../../types/billing.types';
import {
  buildTariffPricingBreakdownRows,
  formatTierRangeDisplay,
  resolvePlanKindDisplayLabel,
  resolveVehicleChangeTypeLabel,
} from '../../lib/rental-tenant-billing-i18n';
import { changeTypeTone } from './tenant-tariff-vehicles.utils';

const money = (cents: number, formatted: string) => ({
  cents,
  currency: 'EUR',
  formatted,
});

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

const tDe = translate(de);
const tEn = translate(en);

function buildPricing(
  partial: Partial<TenantSubscriptionTariffPricingDto>,
): TenantSubscriptionTariffPricingDto {
  return {
    calculatedAt: '2026-07-15T12:00:00.000Z',
    billableVehicleCount: 5,
    connectedVehicleCount: 6,
    pricingModel: 'VOLUME',
    appliedTier: {
      label: '1–10 Fahrzeuge',
      minVehicles: 1,
      maxVehicles: 10,
      unitPrice: money(1500, '15,00 €'),
    },
    priceTiers: [],
    tierBreakdown: [],
    baseAmount: money(7500, '75,00 €'),
    discounts: [],
    netAmount: money(7500, '75,00 €'),
    taxAmount: money(1425, '14,25 €'),
    grossAmount: money(8925, '89,25 €'),
    currency: 'EUR',
    taxConfigured: true,
    ...partial,
  };
}

describe('tenant tariff vehicles utils', () => {
  it('labels rental and fleet plans via adapter', () => {
    expect(resolvePlanKindDisplayLabel('RENTAL', tDe)).toBe('SynqDrive Rental');
    expect(resolvePlanKindDisplayLabel('FLEET', tEn)).toBe('SynqDrive Fleet');
  });

  it('builds volume pricing breakdown rows with reused keys', () => {
    const rows = buildTariffPricingBreakdownRows(buildPricing({ pricingModel: 'VOLUME' }), tDe, 'de');
    expect(rows.some((row) => row.label === tDe('tenantBilling.tariff.breakdown.unitPriceRow'))).toBe(
      true,
    );
    expect(rows.some((row) => row.label === tDe('invoiceLineItem.summary.gross') && row.value === '89,25 €')).toBe(
      true,
    );
    expect(
      rows.some(
        (row) =>
          row.label === tDe('tenantBilling.tariff.breakdown.pricingModelRow') &&
          row.value === tDe('tenantBilling.pricingModel.volume'),
      ),
    ).toBe(true);
  });

  it('builds graduated pricing breakdown with tier lines excluded from rows', () => {
    const rows = buildTariffPricingBreakdownRows(
      buildPricing({
        pricingModel: 'GRADUATED',
        tierBreakdown: [
          {
            tierLabel: '1–5 Fahrzeuge',
            quantity: 3,
            unitPrice: money(1000, '10,00 €'),
            subtotal: money(3000, '30,00 €'),
          },
        ],
      }),
      tDe,
      'de',
    );

    expect(
      rows.some(
        (row) =>
          row.label === tDe('tenantBilling.tariff.breakdown.pricingModelRow') &&
          row.value === tDe('tenantBilling.pricingModel.graduated'),
      ),
    ).toBe(true);
    expect(rows.some((row) => row.label.includes('1–5 Fahrzeuge'))).toBe(false);
  });

  it('includes discount rows in pricing breakdown with raw labels', () => {
    const rows = buildTariffPricingBreakdownRows(
      buildPricing({
        discounts: [{ label: 'Provider Discount X7', amount: money(500, '5,00 €') }],
        netAmount: money(7000, '70,00 €'),
      }),
      tDe,
      'de',
    );
    expect(rows.some((row) => row.label === 'Provider Discount X7' && row.value === '−5,00 €')).toBe(
      true,
    );
  });

  it('labels vehicle change types for history', () => {
    const added: TenantVehicleBillingChangeDto = {
      id: '1',
      licensePlate: 'KS-FS-7777',
      vehicleLabel: 'Mietwagen Sonderfall X7',
      changeType: 'ADDED',
      eventTypeLabel: 'Provider Event X7',
      effectiveAt: '2026-07-16T00:00:00.000Z',
      prorationAmount: money(1500, '15,00 €'),
      reason: 'Provider Reason X7',
    };
    const removed: TenantVehicleBillingChangeDto = { ...added, changeType: 'REMOVED' };

    expect(resolveVehicleChangeTypeLabel(added.changeType, tDe)).toBe('Hinzugefügt');
    expect(resolveVehicleChangeTypeLabel(removed.changeType, tEn)).toBe('Removed');
    expect(changeTypeTone(added.changeType)).toBe('sq-tone-success');
  });

  it('formats tier ranges without changing thresholds', () => {
    expect(formatTierRangeDisplay(1, 10, tDe)).toBe('1–10 Fahrzeuge');
    expect(formatTierRangeDisplay(20, null, tEn)).toBe('20+ vehicles');
    expect(formatTierRangeDisplay(1, 1, tDe)).toBe('1 Fahrzeug');
  });

  it('handles empty pricing state for no vehicles', () => {
    expect(buildTariffPricingBreakdownRows(null, tDe, 'de')).toEqual([]);
    const rows = buildTariffPricingBreakdownRows(
      buildPricing({ billableVehicleCount: 0, baseAmount: money(0, '0,00 €') }),
      tDe,
      'de',
    );
    expect(rows[0]).toEqual({
      label: tDe('tenantBilling.overview.billableVehicles'),
      value: '0',
    });
  });
});
