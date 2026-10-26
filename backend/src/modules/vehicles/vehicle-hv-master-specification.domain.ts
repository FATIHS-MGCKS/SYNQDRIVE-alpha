export const VEHICLE_HV_MASTER_SPEC_VERSION = 1;

export const HV_CATALOG_VARIANT_KEY_TESLA_MODEL3_RWD_LFP_CATL6L =
  'TESLA_MODEL3_RWD_LFP_CATL6L';

export const KNOWN_HV_CATALOG_VARIANT_KEYS = [
  HV_CATALOG_VARIANT_KEY_TESLA_MODEL3_RWD_LFP_CATL6L,
] as const;

export type HvMasterSpecProvenance = 'ESTIMATED' | 'CONFIRMED';

export type HvMasterFieldChangeClassification =
  | 'CATALOG_ESTIMATED_FIELD_UPDATE'
  | 'OPERATOR_FIELD_UPDATE';

export interface VehicleHvMasterSpecificationV1 {
  version: typeof VEHICLE_HV_MASTER_SPEC_VERSION;
  provenance: HvMasterSpecProvenance;
  fieldChangeClassification?: HvMasterFieldChangeClassification | null;
  variantLabel?: string | null;
  evidenceNote?: string | null;
  grossCapacityKwh?: number | null;
  nominalVoltageV?: number | null;
  chemistry?: string | null;
  cellFormat?: string | null;
  architecture?: string | null;
  thermalManagement?: string | null;
  acOnboardChargerKw?: number | null;
  dcFastChargeMaxKw?: number | null;
  warrantyYears?: number | null;
  warrantyKm?: number | null;
  catalogReferences?: string[] | null;
  catalogVariantKey?: string | null;
  updatedAt?: string | null;
}

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

function parseOptionalPositiveNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseOptionalNonNegativeInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function trimOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export function parseVehicleHvMasterSpecification(
  raw: unknown,
): VehicleHvMasterSpecificationV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== VEHICLE_HV_MASTER_SPEC_VERSION) return null;
  const provenance = o.provenance;
  if (provenance !== 'ESTIMATED' && provenance !== 'CONFIRMED') return null;

  const catalogReferences = Array.isArray(o.catalogReferences)
    ? o.catalogReferences
        .map((r) => (typeof r === 'string' ? r.trim() : ''))
        .filter((r) => r.length > 0)
    : null;

  return {
    version: VEHICLE_HV_MASTER_SPEC_VERSION,
    provenance,
    variantLabel: trimOrNull(o.variantLabel),
    evidenceNote: trimOrNull(o.evidenceNote),
    grossCapacityKwh: parseOptionalPositiveNumber(o.grossCapacityKwh),
    nominalVoltageV: parseOptionalPositiveNumber(o.nominalVoltageV),
    chemistry: trimOrNull(o.chemistry),
    cellFormat: trimOrNull(o.cellFormat),
    architecture: trimOrNull(o.architecture),
    thermalManagement: trimOrNull(o.thermalManagement),
    acOnboardChargerKw: parseOptionalPositiveNumber(o.acOnboardChargerKw),
    dcFastChargeMaxKw: parseOptionalPositiveNumber(o.dcFastChargeMaxKw),
    warrantyYears: parseOptionalNonNegativeInt(o.warrantyYears),
    warrantyKm: parseOptionalNonNegativeInt(o.warrantyKm),
    catalogReferences: catalogReferences && catalogReferences.length > 0 ? catalogReferences : null,
    catalogVariantKey: trimOrNull(o.catalogVariantKey),
    fieldChangeClassification:
      o.fieldChangeClassification === 'CATALOG_ESTIMATED_FIELD_UPDATE' ||
      o.fieldChangeClassification === 'OPERATOR_FIELD_UPDATE'
        ? o.fieldChangeClassification
        : null,
    updatedAt: trimOrNull(o.updatedAt),
  };
}

export type UpsertHvMasterSpecInput = {
  provenance?: HvMasterSpecProvenance;
  variantLabel?: string | null;
  evidenceNote?: string | null;
  grossCapacityKwh?: number | null;
  nominalVoltageV?: number | null;
  chemistry?: string | null;
  cellFormat?: string | null;
  architecture?: string | null;
  thermalManagement?: string | null;
  acOnboardChargerKw?: number | null;
  dcFastChargeMaxKw?: number | null;
  warrantyYears?: number | null;
  warrantyKm?: number | null;
  catalogReferences?: string[] | null;
  catalogVariantKey?: string | null;
};

const CATALOG_FIELD_KEYS: (keyof UpsertHvMasterSpecInput)[] = [
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
];

export function patchTouchesCatalogFields(patch: UpsertHvMasterSpecInput): boolean {
  return CATALOG_FIELD_KEYS.some((key) => patch[key] !== undefined);
}

export function resolveMergedProvenance(
  existing: VehicleHvMasterSpecificationV1 | null,
  patch: UpsertHvMasterSpecInput,
): HvMasterSpecProvenance {
  if (patch.provenance !== undefined) {
    return patch.provenance;
  }
  if (existing?.provenance) {
    return existing.provenance;
  }
  return 'ESTIMATED';
}

export function resolveFieldChangeClassification(
  existing: VehicleHvMasterSpecificationV1 | null,
  patch: UpsertHvMasterSpecInput,
  mergedProvenance: HvMasterSpecProvenance,
): HvMasterFieldChangeClassification | null {
  if (!patchTouchesCatalogFields(patch)) {
    return existing?.fieldChangeClassification ?? null;
  }
  if (mergedProvenance === 'CONFIRMED') {
    return 'OPERATOR_FIELD_UPDATE';
  }
  return 'CATALOG_ESTIMATED_FIELD_UPDATE';
}

export function hvMasterSpecToFormFields(
  spec: VehicleHvMasterSpecificationV1 | null,
): Partial<HvMasterSpecFormFields> {
  if (!spec) return {};
  const str = (n: number | null | undefined) =>
    n != null && Number.isFinite(n) ? String(n) : '';
  return {
    hvBatteryGrossCapacityKwh: str(spec.grossCapacityKwh),
    hvBatteryNominalVoltage: str(spec.nominalVoltageV),
    hvBatteryChemistry: spec.chemistry ?? '',
    hvBatteryCellFormat: spec.cellFormat ?? '',
    hvBatteryArchitecture: spec.architecture ?? '',
    hvBatteryThermalManagement: spec.thermalManagement ?? '',
    acOnboardChargerKw: str(spec.acOnboardChargerKw),
    dcFastChargeMaxKw: str(spec.dcFastChargeMaxKw),
    hvBatteryWarrantyYears: str(spec.warrantyYears),
    hvBatteryWarrantyKm: str(spec.warrantyKm),
  };
}

export function mergeHvMasterSpecification(
  existing: VehicleHvMasterSpecificationV1 | null,
  patch: UpsertHvMasterSpecInput,
): VehicleHvMasterSpecificationV1 {
  const provenance = resolveMergedProvenance(existing, patch);
  const fieldChangeClassification = resolveFieldChangeClassification(
    existing,
    patch,
    provenance,
  );
  return {
    version: VEHICLE_HV_MASTER_SPEC_VERSION,
    provenance,
    fieldChangeClassification,
    variantLabel: patch.variantLabel !== undefined ? patch.variantLabel : existing?.variantLabel ?? null,
    evidenceNote: patch.evidenceNote !== undefined ? patch.evidenceNote : existing?.evidenceNote ?? null,
    grossCapacityKwh:
      patch.grossCapacityKwh !== undefined ? patch.grossCapacityKwh : existing?.grossCapacityKwh ?? null,
    nominalVoltageV:
      patch.nominalVoltageV !== undefined ? patch.nominalVoltageV : existing?.nominalVoltageV ?? null,
    chemistry: patch.chemistry !== undefined ? patch.chemistry : existing?.chemistry ?? null,
    cellFormat: patch.cellFormat !== undefined ? patch.cellFormat : existing?.cellFormat ?? null,
    architecture: patch.architecture !== undefined ? patch.architecture : existing?.architecture ?? null,
    thermalManagement:
      patch.thermalManagement !== undefined
        ? patch.thermalManagement
        : existing?.thermalManagement ?? null,
    acOnboardChargerKw:
      patch.acOnboardChargerKw !== undefined ? patch.acOnboardChargerKw : existing?.acOnboardChargerKw ?? null,
    dcFastChargeMaxKw:
      patch.dcFastChargeMaxKw !== undefined ? patch.dcFastChargeMaxKw : existing?.dcFastChargeMaxKw ?? null,
    warrantyYears:
      patch.warrantyYears !== undefined ? patch.warrantyYears : existing?.warrantyYears ?? null,
    warrantyKm: patch.warrantyKm !== undefined ? patch.warrantyKm : existing?.warrantyKm ?? null,
    catalogReferences:
      patch.catalogReferences !== undefined
        ? patch.catalogReferences
        : existing?.catalogReferences ?? null,
    catalogVariantKey:
      patch.catalogVariantKey !== undefined
        ? patch.catalogVariantKey
        : existing?.catalogVariantKey ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function buildHvMasterSpecPatchFromForm(
  current: HvMasterSpecFormFields,
  baseline: HvMasterSpecFormFields,
): UpsertHvMasterSpecInput | null {
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

  const patch: UpsertHvMasterSpecInput = {};
  let changed = false;

  const assignStr = (key: keyof UpsertHvMasterSpecInput, cur: string, base: string) => {
    if (cur.trim() === base.trim()) return;
    (patch as Record<string, unknown>)[key] = cur.trim() || null;
    changed = true;
  };

  const assignNum = (
    key: keyof UpsertHvMasterSpecInput,
    cur: string,
    base: string,
    parser: (s: string) => number | null,
  ) => {
    const a = parser(cur);
    const b = parser(base);
    if (a === b) return;
    (patch as Record<string, unknown>)[key] = a;
    changed = true;
  };

  assignNum('grossCapacityKwh', current.hvBatteryGrossCapacityKwh, baseline.hvBatteryGrossCapacityKwh, parseFloatField);
  assignNum('nominalVoltageV', current.hvBatteryNominalVoltage, baseline.hvBatteryNominalVoltage, parseFloatField);
  assignStr('chemistry', current.hvBatteryChemistry, baseline.hvBatteryChemistry);
  assignStr('cellFormat', current.hvBatteryCellFormat, baseline.hvBatteryCellFormat);
  assignStr('architecture', current.hvBatteryArchitecture, baseline.hvBatteryArchitecture);
  assignStr('thermalManagement', current.hvBatteryThermalManagement, baseline.hvBatteryThermalManagement);
  assignNum('acOnboardChargerKw', current.acOnboardChargerKw, baseline.acOnboardChargerKw, parseFloatField);
  assignNum('dcFastChargeMaxKw', current.dcFastChargeMaxKw, baseline.dcFastChargeMaxKw, parseFloatField);
  assignNum('warrantyYears', current.hvBatteryWarrantyYears, baseline.hvBatteryWarrantyYears, parseIntField);
  assignNum('warrantyKm', current.hvBatteryWarrantyKm, baseline.hvBatteryWarrantyKm, parseIntField);

  return changed ? patch : null;
}
