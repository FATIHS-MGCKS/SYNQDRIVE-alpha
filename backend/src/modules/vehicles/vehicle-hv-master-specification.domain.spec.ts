import {
  buildHvMasterSpecPatchFromForm,
  mergeHvMasterSpecification,
  parseVehicleHvMasterSpecification,
  resolveFieldChangeClassification,
  resolveMergedProvenance,
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

  it('merge preserves existing fields on partial patch', () => {
    const merged = mergeHvMasterSpecification(
      {
        version: 1,
        provenance: 'ESTIMATED',
        chemistry: 'LFP',
        grossCapacityKwh: 60,
        cellFormat: 'Prismatic',
      },
      { nominalVoltageV: 340 },
    );
    expect(merged.chemistry).toBe('LFP');
    expect(merged.cellFormat).toBe('Prismatic');
    expect(merged.nominalVoltageV).toBe(340);
  });

  it('resolveMergedProvenance keeps CONFIRMED when patch omits provenance', () => {
    expect(
      resolveMergedProvenance(
        { version: 1, provenance: 'CONFIRMED', chemistry: 'LFP' },
        { chemistry: 'NMC' },
      ),
    ).toBe('CONFIRMED');
  });

  it('resolveMergedProvenance defaults new records to ESTIMATED', () => {
    expect(resolveMergedProvenance(null, { chemistry: 'LFP' })).toBe('ESTIMATED');
  });

  it('resolveMergedProvenance does not promote ESTIMATED to CONFIRMED implicitly', () => {
    expect(
      resolveMergedProvenance(
        { version: 1, provenance: 'ESTIMATED', chemistry: 'LFP' },
        { chemistry: 'NMC' },
      ),
    ).toBe('ESTIMATED');
  });

  it('classifies catalog field edits on ESTIMATED as CATALOG_ESTIMATED_FIELD_UPDATE', () => {
    expect(
      resolveFieldChangeClassification(
        { version: 1, provenance: 'ESTIMATED' },
        { chemistry: 'LFP' },
        'ESTIMATED',
      ),
    ).toBe('CATALOG_ESTIMATED_FIELD_UPDATE');
  });

  it('classifies catalog field edits on CONFIRMED as OPERATOR_FIELD_UPDATE', () => {
    expect(
      resolveFieldChangeClassification(
        { version: 1, provenance: 'CONFIRMED' },
        { chemistry: 'LFP' },
        'CONFIRMED',
      ),
    ).toBe('OPERATOR_FIELD_UPDATE');
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
