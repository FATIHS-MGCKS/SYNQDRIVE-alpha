import { PricingModel } from './domain';
import { tenantBillingTariffInternals } from './tenant-billing-tariff.service';
import { tenantVehicleBillingChangesInternals } from './tenant-vehicle-billing-changes.service';
import {
  resolveBillableVehicleExclusionLabel,
  resolveBillableVehicleReasonLabel,
  resolveVehicleLicenseChangeType,
} from './tenant-billing.mapper';
import { tenantBillableVehiclesListInternals } from './tenant-billable-vehicles-list.service';

describe('tenant billing tariff mapper', () => {
  it('formats tier labels for volume and graduated breakdown', () => {
    expect(tenantBillingTariffInternals.formatTierLabel(1, 10)).toBe('1–10 Fahrzeuge');
    expect(tenantBillingTariffInternals.formatTierLabel(11, null)).toBe('11+ Fahrzeuge');
  });

  it('maps graduated tier breakdown lines without internal ids', () => {
    const lines = tenantBillingTariffInternals.mapTierBreakdown(
      [
        {
          tierId: 'tier-1',
          minVehicles: 1,
          maxVehicles: 5,
          quantity: 3,
          unitPriceCents: 1000,
          subtotalCents: 3000,
          sortOrder: 0,
        },
        {
          tierId: 'tier-2',
          minVehicles: 6,
          maxVehicles: 10,
          quantity: 2,
          unitPriceCents: 800,
          subtotalCents: 1600,
          sortOrder: 1,
        },
      ],
      'EUR',
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual(
      expect.objectContaining({
        tierLabel: '1–5 Fahrzeuge',
        quantity: 3,
        unitPrice: expect.objectContaining({ formatted: expect.stringMatching(/10,00/) }),
        subtotal: expect.objectContaining({ cents: 3000 }),
      }),
    );
    expect(JSON.stringify(lines)).not.toContain('tier-1');
  });

  it('builds user-friendly price version labels', () => {
    expect(
      tenantBillingTariffInternals.buildPriceVersionLabel({
        priceVersion: { id: 'ver-1', versionNumber: 3, versionLabel: 'Sommer 2026', status: 'ACTIVE' },
      } as never),
    ).toBe('Sommer 2026');
    expect(
      tenantBillingTariffInternals.buildPriceVersionLabel({
        priceVersion: { id: 'ver-1', versionNumber: 2, versionLabel: null, status: 'ACTIVE' },
      } as never),
    ).toBe('Version 2');
  });
});

describe('tenant billing vehicle labels', () => {
  it('maps demo assignment exclusion to German copy', () => {
    expect(resolveBillableVehicleExclusionLabel('DEMO_ASSIGNMENT')).toBe('Demo-Zuordnung');
    expect(
      resolveBillableVehicleReasonLabel({
        billingStatus: 'EXCLUDED',
        exclusionReason: 'DEMO_ASSIGNMENT',
      }),
    ).toBe('Demo-Zuordnung');
  });

  it('does not expose telemetry wording for billing reasons', () => {
    const label = resolveBillableVehicleReasonLabel({
      billingStatus: 'EXCLUDED',
      exclusionReason: 'NO_ASSIGNMENT',
    });
    expect(label).not.toMatch(/telemetri|dimo|provider/i);
    expect(label).toBe('Keine Abrechnungszuordnung');
  });

  it('resolves vehicle change direction for history', () => {
    expect(resolveVehicleLicenseChangeType('VEHICLE_CONNECTED', 1)).toBe('ADDED');
    expect(resolveVehicleLicenseChangeType('VEHICLE_EXCLUDED', -1)).toBe('REMOVED');
  });
});

describe('tenant vehicle billing proration', () => {
  const periodStart = new Date('2026-07-01T00:00:00.000Z');
  const periodEnd = new Date('2026-08-01T00:00:00.000Z');

  it('estimates proration for mid-period vehicle addition', () => {
    const amount = tenantVehicleBillingChangesInternals.estimateChangeProrationCents(
      'ADDED',
      new Date('2026-07-16T00:00:00.000Z'),
      periodStart,
      periodEnd,
      3000,
    );
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(3000);
  });

  it('estimates proration for removed vehicle', () => {
    const amount = tenantVehicleBillingChangesInternals.estimateChangeProrationCents(
      'REMOVED',
      new Date('2026-07-16T00:00:00.000Z'),
      periodStart,
      periodEnd,
      3000,
    );
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(3000);
  });
});

describe('tenant billable vehicles list helpers', () => {
  it('prefers current station over home station', () => {
    expect(
      tenantBillableVehiclesListInternals.resolveStationName({
        id: 'v1',
        licensePlate: 'B-AB 1',
        make: 'VW',
        model: 'Golf',
        homeStation: { name: 'Hauptstandort' },
        currentStation: { name: 'Nebenstandort' },
      }),
    ).toBe('Nebenstandort');
  });
});

describe('pricing model coverage', () => {
  it('supports volume and graduated pricing models', () => {
    expect(PricingModel.VOLUME).toBe('VOLUME');
    expect(PricingModel.GRADUATED).toBe('GRADUATED');
  });
});
