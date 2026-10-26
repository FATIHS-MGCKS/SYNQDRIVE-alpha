import {
  buildHvMasterSpecPatchFromForm,
  mergeHvMasterSpecification,
  parseVehicleHvMasterSpecification,
  VEHICLE_HV_MASTER_SPEC_VERSION,
} from './vehicle-hv-master-specification.domain';

describe('vehicle-hv-master-specification.domain', () => {
  it('parses v1 ESTIMATED spec', () => {
    const parsed = parseVehicleHvMasterSpecification({
      version: VEHICLE_HV_MASTER_SPEC_VERSION,
      provenance: 'ESTIMATED',
      chemistry: 'LFP',
      grossCapacityKwh: 60,
    });
    expect(parsed?.chemistry).toBe('LFP');
    expect(parsed?.provenance).toBe('ESTIMATED');
  });

  it('rejects unknown version', () => {
    expect(parseVehicleHvMasterSpecification({ version: 2, provenance: 'ESTIMATED' })).toBeNull();
  });

  it('merge preserves existing fields', () => {
    const merged = mergeHvMasterSpecification(
      {
        version: 1,
        provenance: 'ESTIMATED',
        chemistry: 'LFP',
        grossCapacityKwh: 60,
      },
      { nominalVoltageV: 340 },
    );
    expect(merged.chemistry).toBe('LFP');
    expect(merged.nominalVoltageV).toBe(340);
  });

  it('buildHvMasterSpecPatchFromForm detects chemistry change only', () => {
    const base = {
      hvBatteryGrossCapacityKwh: '',
      hvBatteryNominalVoltage: '',
      hvBatteryChemistry: '',
      hvBatteryCellFormat: '',
      hvBatteryArchitecture: '',
      hvBatteryThermalManagement: '',
      acOnboardChargerKw: '',
      dcFastChargeMaxKw: '',
      hvBatteryWarrantyYears: '',
      hvBatteryWarrantyKm: '',
    };
    const patch = buildHvMasterSpecPatchFromForm(
      { ...base, hvBatteryChemistry: 'LFP' },
      base,
    );
    expect(patch).toEqual({ chemistry: 'LFP' });
  });
});
