import type { RegisteredVehicle } from '../data/platform-data';

export type HvMasterSpecProvenance = 'ESTIMATED' | 'CONFIRMED';

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

export const TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE = {
  variantLabel: 'Tesla Model 3 RWD LFP (CATL 6L catalog — not pack-verified)',
  evidenceNote:
    'Model/catalog reference values (EV-Database, Tesla warranty). CATL 6L battery pack not confirmed for this VIN.',
  catalogReferences: [
    'https://ev-database.org/de/pkw/1555/Tesla-Model-3-RWD',
    'https://www.tesla.com/support/vehicle-warranty',
  ],
} as const;

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

function catalogReferencesEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const left = (a ?? []).map((s) => s.trim()).filter(Boolean).sort();
  const right = (b ?? []).map((s) => s.trim()).filter(Boolean).sort();
  if (left.length !== right.length) return false;
  return left.every((v, i) => v === right[i]);
}

function diffEvidenceMetadata(
  current: RegisteredVehicle,
  baseline: RegisteredVehicle,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const curVariant = (current.hvMasterSpecificationVariantLabel ?? '').trim();
  const baseVariant = (baseline.hvMasterSpecificationVariantLabel ?? '').trim();
  if (curVariant !== baseVariant) {
    patch.variantLabel = curVariant || null;
  }

  const curNote = (current.hvMasterSpecificationEvidenceNote ?? '').trim();
  const baseNote = (baseline.hvMasterSpecificationEvidenceNote ?? '').trim();
  if (curNote !== baseNote) {
    patch.evidenceNote = curNote || null;
  }

  const curRefs = current.hvMasterSpecificationCatalogReferences ?? null;
  const baseRefs = baseline.hvMasterSpecificationCatalogReferences ?? null;
  if (!catalogReferencesEqual(curRefs, baseRefs)) {
    patch.catalogReferences = curRefs && curRefs.length > 0 ? curRefs : null;
  }

  return patch;
}

function isTeslaModel3Electric(rv: RegisteredVehicle): boolean {
  const make = String(rv.make ?? '').trim().toLowerCase();
  const model = String(rv.model ?? '').trim().toLowerCase();
  const fuel = String(rv.fuelType ?? '').trim().toLowerCase();
  const electrified =
    fuel.includes('electric') || fuel.includes('plugin') || fuel.includes('phev') || fuel.includes('hybrid');
  return electrified && make.includes('tesla') && model.includes('model 3');
}

function attachInitialEstimatedEvidenceIfNeeded(
  patch: Record<string, unknown>,
  baseline: RegisteredVehicle,
  current: RegisteredVehicle,
): void {
  const baselineHasProvenance = Boolean(baseline.hvMasterSpecificationProvenance);
  if (baselineHasProvenance) return;

  const hasCatalogFieldInPatch = [
    'grossCapacityKwh',
    'nominalVoltageV',
    'chemistry',
    'cellFormat',
    'architecture',
    'thermalManagement',
    'acOnboardChargerKw',
    'dcFastChargeMaxKw',
    'warrantyYears',
    'warrantyKm',
  ].some((key) => patch[key] !== undefined);

  if (!hasCatalogFieldInPatch) return;

  if (!baseline.hvMasterSpecificationVariantLabel && isTeslaModel3Electric(current)) {
    if (patch.variantLabel === undefined) {
      patch.variantLabel = TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.variantLabel;
    }
    if (patch.evidenceNote === undefined) {
      patch.evidenceNote = TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.evidenceNote;
    }
    if (patch.catalogReferences === undefined) {
      patch.catalogReferences = [...TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.catalogReferences];
    }
  }

  patch.provenance = 'ESTIMATED';
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

  const evidencePatch = diffEvidenceMetadata(current, baseline);
  const hasEvidenceChange = Object.keys(evidencePatch).length > 0;
  if (hasEvidenceChange) {
    Object.assign(patch, evidencePatch);
    changed = true;
  }

  if (!changed) return null;

  const baselineProvenance = baseline.hvMasterSpecificationProvenance ?? null;
  if (baselineProvenance === 'CONFIRMED' || baselineProvenance === 'ESTIMATED') {
    // Preserve server provenance — never downgrade CONFIRMED or re-tag ESTIMATED on edits.
  } else {
    attachInitialEstimatedEvidenceIfNeeded(patch, baseline, current);
  }

  return patch;
}

/** Apply Tesla Model 3 catalog evidence onto RV when extended HV fields are edited without stored evidence. */
export function applyTeslaModel3EstimatedEvidenceToVehicle(rv: RegisteredVehicle): RegisteredVehicle {
  if (rv.hvMasterSpecificationProvenance) return rv;
  if (!isTeslaModel3Electric(rv)) return rv;
  const fields = extractHvMasterSpecFormFields(rv);
  const hasAnyCatalogField = Object.values(fields).some((v) => String(v).trim() !== '');
  if (!hasAnyCatalogField) return rv;
  return {
    ...rv,
    hvMasterSpecificationVariantLabel: TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.variantLabel,
    hvMasterSpecificationEvidenceNote: TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.evidenceNote,
    hvMasterSpecificationCatalogReferences: [...TESLA_MODEL3_CATL6L_ESTIMATED_EVIDENCE.catalogReferences],
  };
}
