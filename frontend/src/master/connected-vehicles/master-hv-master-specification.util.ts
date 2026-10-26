import type { RegisteredVehicle } from '../data/platform-data';

export type HvMasterSpecFormFields = {
  hvBatteryGrossCapacityKwh: string;
  hvBatteryNominalVoltage: string;
  hvBatteryChemistry: string;
  hvBatteryCellFormat: string;
  hvBatteryArchitecture: string;
  hvBatteryThermalManagement: string;
  acOnboardChargerKw: string;
  dcFastChargeMaxKw: string;
  hvBatteryWarrantyYears: string;
  hvBatteryWarrantyKm: string;
};

export function extractHvMasterSpecFormFields(rv: RegisteredVehicle): HvMasterSpecFormFields {
  return {
    hvBatteryGrossCapacityKwh: rv.hvBatteryGrossCapacityKwh ?? '',
    hvBatteryNominalVoltage: rv.hvBatteryNominalVoltage ?? '',
    hvBatteryChemistry: rv.hvBatteryChemistry ?? '',
    hvBatteryCellFormat: rv.hvBatteryCellFormat ?? '',
    hvBatteryArchitecture: rv.hvBatteryArchitecture ?? '',
    hvBatteryThermalManagement: rv.hvBatteryThermalManagement ?? '',
    acOnboardChargerKw: rv.acOnboardChargerKw ?? '',
    dcFastChargeMaxKw: rv.dcFastChargeMaxKw ?? '',
    hvBatteryWarrantyYears: rv.hvBatteryWarrantyYears ?? '',
    hvBatteryWarrantyKm: rv.hvBatteryWarrantyKm ?? '',
  };
}

/** Mirrors backend buildHvMasterSpecPatchFromForm for Master spec edit save. */
export function buildHvMasterSpecPatchFromRegisteredVehicle(
  current: RegisteredVehicle,
  baseline: RegisteredVehicle,
): Record<string, unknown> | null {
  const cur = extractHvMasterSpecFormFields(current);
  const base = extractHvMasterSpecFormFields(baseline);

  const parseFloatField = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const parseIntField = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t.replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const patch: Record<string, unknown> = {};
  let changed = false;

  const assignStr = (key: string, c: string, b: string) => {
    if (c.trim() === b.trim()) return;
    patch[key] = c.trim() || null;
    changed = true;
  };

  const assignNum = (key: string, c: string, b: string, parser: (s: string) => number | null) => {
    const a = parser(c);
    const bVal = parser(b);
    if (a === bVal) return;
    patch[key] = a;
    changed = true;
  };

  assignNum('grossCapacityKwh', cur.hvBatteryGrossCapacityKwh, base.hvBatteryGrossCapacityKwh, parseFloatField);
  assignNum('nominalVoltageV', cur.hvBatteryNominalVoltage, base.hvBatteryNominalVoltage, parseFloatField);
  assignStr('chemistry', cur.hvBatteryChemistry, base.hvBatteryChemistry);
  assignStr('cellFormat', cur.hvBatteryCellFormat, base.hvBatteryCellFormat);
  assignStr('architecture', cur.hvBatteryArchitecture, base.hvBatteryArchitecture);
  assignStr('thermalManagement', cur.hvBatteryThermalManagement, base.hvBatteryThermalManagement);
  assignNum('acOnboardChargerKw', cur.acOnboardChargerKw, base.acOnboardChargerKw, parseFloatField);
  assignNum('dcFastChargeMaxKw', cur.dcFastChargeMaxKw, base.dcFastChargeMaxKw, parseFloatField);
  assignNum('warrantyYears', cur.hvBatteryWarrantyYears, base.hvBatteryWarrantyYears, parseIntField);
  assignNum('warrantyKm', cur.hvBatteryWarrantyKm, base.hvBatteryWarrantyKm, parseIntField);

  if (!changed) return null;
  if (!patch.provenance) {
    patch.provenance = 'ESTIMATED';
  }
  return patch;
}
