import { describe, expect, it } from 'vitest';
import type {
  TenantSubscriptionTariffPricingDto,
  TenantVehicleBillingChangeDto,
} from '../../types/billing.types';
import {
  changeTypeLabel,
  planKindLabel,
  pricingBreakdownRows,
} from './tenant-tariff-vehicles.utils';

const money = (cents: number, formatted: string) => ({
  cents,
  currency: 'EUR',
  formatted,
});

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
  it('labels rental and fleet plans', () => {
    expect(planKindLabel('RENTAL')).toBe('SynqDrive Rental');
    expect(planKindLabel('FLEET')).toBe('SynqDrive Fleet');
  });

  it('builds volume pricing breakdown rows', () => {
    const rows = pricingBreakdownRows(buildPricing({ pricingModel: 'VOLUME' }));
    expect(rows.some((row) => row.label === 'Stückpreis')).toBe(true);
    expect(rows.some((row) => row.label === 'Brutto' && row.value === '89,25 €')).toBe(true);
    expect(rows.some((row) => row.label === 'Preismodell' && row.value === 'Mengenpreis')).toBe(true);
  });

  it('builds graduated pricing breakdown with tier lines', () => {
    const rows = pricingBreakdownRows(
      buildPricing({
        pricingModel: 'GRADUATED',
        tierBreakdown: [
          {
            tierLabel: '1–5 Fahrzeuge',
            quantity: 3,
            unitPrice: money(1000, '10,00 €'),
            subtotal: money(3000, '30,00 €'),
          },
          {
            tierLabel: '6–10 Fahrzeuge',
            quantity: 2,
            unitPrice: money(800, '8,00 €'),
            subtotal: money(1600, '16,00 €'),
          },
        ],
      }),
    );

    expect(rows.some((row) => row.label === 'Preismodell' && row.value === 'Gestaffelter Preis')).toBe(
      true,
    );
    expect(rows.some((row) => row.label.includes('1–5 Fahrzeuge'))).toBe(false);
  });

  it('includes discount rows in pricing breakdown', () => {
    const rows = pricingBreakdownRows(
      buildPricing({
        discounts: [{ label: 'Willkommensrabatt', amount: money(500, '5,00 €') }],
        netAmount: money(7000, '70,00 €'),
      }),
    );
    expect(rows.some((row) => row.label === 'Willkommensrabatt' && row.value === '−5,00 €')).toBe(
      true,
    );
  });

  it('labels vehicle change types for history', () => {
    const added: TenantVehicleBillingChangeDto = {
      id: '1',
      licensePlate: 'B-AB 1',
      vehicleLabel: 'VW Golf',
      changeType: 'ADDED',
      eventTypeLabel: 'Fahrzeug abrechenbar',
      effectiveAt: '2026-07-16T00:00:00.000Z',
      prorationAmount: money(1500, '15,00 €'),
      reason: null,
    };
    const removed: TenantVehicleBillingChangeDto = { ...added, changeType: 'REMOVED' };

    expect(changeTypeLabel(added)).toBe('Hinzugefügt');
    expect(changeTypeLabel(removed)).toBe('Entfernt');
  });

  it('handles empty pricing state for no vehicles', () => {
    expect(pricingBreakdownRows(null)).toEqual([]);
    const rows = pricingBreakdownRows(
      buildPricing({ billableVehicleCount: 0, baseAmount: money(0, '0,00 €') }),
    );
    expect(rows[0]).toEqual({ label: 'Abrechenbare Fahrzeuge', value: '0' });
  });
});
