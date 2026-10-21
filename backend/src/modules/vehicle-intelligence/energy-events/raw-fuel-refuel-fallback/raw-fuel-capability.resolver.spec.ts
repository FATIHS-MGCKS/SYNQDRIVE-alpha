import { FuelType } from '@prisma/client';
import {
  ALL_FUEL_TYPE_ENUM_VALUES,
  resolveRawFuelCapability,
} from './raw-fuel-capability.resolver';

describe('RawFuelCapabilityResolver', () => {
  it('classifies all FuelType enum values exhaustively', () => {
    const expected: Record<FuelType, 'FUEL_CAPABLE' | 'NON_FUEL_CAPABLE' | 'UNKNOWN'> = {
      [FuelType.GASOLINE]: 'FUEL_CAPABLE',
      [FuelType.DIESEL]: 'FUEL_CAPABLE',
      [FuelType.HYBRID]: 'FUEL_CAPABLE',
      [FuelType.PLUGIN_HYBRID]: 'FUEL_CAPABLE',
      [FuelType.ELECTRIC]: 'NON_FUEL_CAPABLE',
      [FuelType.OTHER]: 'UNKNOWN',
    };

    for (const fuelType of ALL_FUEL_TYPE_ENUM_VALUES) {
      expect(resolveRawFuelCapability({ fuelType })).toBe(expected[fuelType]);
    }
  });

  it('missing fuelType fails closed to UNKNOWN', () => {
    expect(resolveRawFuelCapability({ fuelType: null })).toBe('UNKNOWN');
    expect(resolveRawFuelCapability({})).toBe('UNKNOWN');
  });

  it('BEV powertrain contradicting fuel-capable fuelType fails closed', () => {
    expect(
      resolveRawFuelCapability({
        fuelType: FuelType.GASOLINE,
        dimoPowertrainType: 'BEV',
      }),
    ).toBe('UNKNOWN');
  });

  it('fuel-capable dimo metadata contradicting ELECTRIC fails closed', () => {
    expect(
      resolveRawFuelCapability({
        fuelType: FuelType.ELECTRIC,
        dimoPowertrainType: 'ICE',
      }),
    ).toBe('UNKNOWN');
  });

  it('does not infer capability from sample-like hints (no shortcut inputs)', () => {
    expect(
      resolveRawFuelCapability({
        fuelType: FuelType.OTHER,
        dimoFuelType: 'unknown-token-without-authority',
      }),
    ).toBe('UNKNOWN');
  });

  it('consistent secondary dimo metadata preserves authoritative fuelType', () => {
    expect(
      resolveRawFuelCapability({
        fuelType: FuelType.DIESEL,
        dimoPowertrainType: 'ICE',
        dimoFuelType: 'DIESEL',
      }),
    ).toBe('FUEL_CAPABLE');
  });
});
