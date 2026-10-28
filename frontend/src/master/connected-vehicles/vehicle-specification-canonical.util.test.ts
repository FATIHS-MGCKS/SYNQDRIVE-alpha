import { describe, expect, it } from 'vitest';
import {
  deriveElectrificationLevelReadOnly,
  normalizeCanonicalDrivetrain,
  normalizeLvBatteryTypeInput,
  stripNonPersistentVehicleSpecFields,
} from './vehicle-specification-canonical.util';

describe('vehicle-specification-canonical.util', () => {
  it('normalizes drivetrain aliases consistently with backend contract', () => {
    expect(normalizeCanonicalDrivetrain('Allrad')).toBe('FOUR_WD');
    expect(normalizeCanonicalDrivetrain('AWD')).toBe('AWD');
  });

  it('normalizes LV battery type or returns null', () => {
    expect(normalizeLvBatteryTypeInput('AGM')).toBe('AGM');
    expect(normalizeLvBatteryTypeInput('unknown chemistry')).toBeNull();
  });

  it('strips non-persistent registration fields', () => {
    expect(
      stripNonPersistentVehicleSpecFields({
        fuelType: 'Gasoline',
        electrificationLevel: 'BEV',
        lvBatteryChemistry: 'Lead',
      }),
    ).toEqual({ fuelType: 'Gasoline' });
  });

  it('derives electrification read-only without persisting user guesses', () => {
    expect(deriveElectrificationLevelReadOnly({ fuelType: 'Diesel' })).toBe('NONE');
    expect(deriveElectrificationLevelReadOnly({ fuelType: 'Electric' })).toBe('BEV');
  });
});
