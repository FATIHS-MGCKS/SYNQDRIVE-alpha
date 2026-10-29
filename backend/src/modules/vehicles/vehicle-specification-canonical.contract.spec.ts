import {
  deriveElectrificationLevelReadOnly,
  mapPowerKindToPowertrainType,
  normalizeCanonicalDrivetrain,
  normalizeElectrificationLevel,
  normalizeLvBatteryTypeInput,
  NON_PERSISTENT_VEHICLE_SPEC_INPUT_FIELDS,
  TOTAL_CANONICAL_CONTRACT_SURFACES,
} from './vehicle-specification-canonical.contract';

describe('vehicle-specification-canonical.contract', () => {
  it('tracks 65 audited contract surfaces', () => {
    expect(TOTAL_CANONICAL_CONTRACT_SURFACES).toBe(65);
    expect(NON_PERSISTENT_VEHICLE_SPEC_INPUT_FIELDS).toEqual([
      'electrificationLevel',
      'lvBatteryChemistry',
    ]);
  });

  it('normalizes drivetrain aliases to canonical enum', () => {
    expect(normalizeCanonicalDrivetrain('Allrad')).toBe('FOUR_WD');
    expect(normalizeCanonicalDrivetrain('4WD')).toBe('FOUR_WD');
    expect(normalizeCanonicalDrivetrain('AWD')).toBe('AWD');
    expect(normalizeCanonicalDrivetrain('not-a-drive')).toBeNull();
  });

  it('rejects invalid electrification levels', () => {
    expect(normalizeElectrificationLevel('BEV')).toBe('BEV');
    expect(normalizeElectrificationLevel('SUPER_HYBRID')).toBeNull();
  });

  it('normalizes LV battery type for AI/manual equivalence', () => {
    expect(normalizeLvBatteryTypeInput('AGM')).toBe('AGM');
    expect(normalizeLvBatteryTypeInput('efb')).toBe('EFB');
    expect(normalizeLvBatteryTypeInput('Lead-Acid')).toBe('LEAD_ACID');
    expect(normalizeLvBatteryTypeInput('LiFePO4')).toBe('LITHIUM');
    expect(normalizeLvBatteryTypeInput('mystery')).toBeNull();
  });

  it('derives electrification read-only from fuelType when unambiguous', () => {
    expect(deriveElectrificationLevelReadOnly({ fuelType: 'Electric' })).toBe('BEV');
    expect(deriveElectrificationLevelReadOnly({ fuelType: 'Plug-in Hybrid' })).toBe('PHEV');
    expect(deriveElectrificationLevelReadOnly({ fuelType: 'Gasoline' })).toBe('NONE');
    expect(
      deriveElectrificationLevelReadOnly({
        fuelType: 'Electric',
        powertrainType: 'COMBUSTION',
      }),
    ).toBeNull();
  });

  it('maps identity powerKind to powertrainType tokens', () => {
    expect(mapPowerKindToPowertrainType('COMBUSTION')).toBe('COMBUSTION');
    expect(mapPowerKindToPowertrainType('invalid')).toBeNull();
  });
});
