import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('booking pricing context consumption', () => {
  it('NewBookingView does not resolve tariff from catalog directly', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/NewBookingView.tsx'),
      'utf8',
    );
    expect(source).not.toContain('getVehicleTariffFromCatalog');
    expect(source).not.toContain('catalogCurrency');
    expect(source).toContain('pricingContext');
    expect(source).toContain('vehicleHasAssignedTariff');
  });

  it('PricingSimulatorTab does not resolve tariff from catalog', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/PricingSimulatorTab.tsx'),
      'utf8',
    );
    expect(source).not.toContain('getVehicleTariffFromCatalog');
    expect(source).not.toContain('catalogCurrency');
    expect(source).toContain('pricingContext');
  });
});
