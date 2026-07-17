import { BrakeComponentInstallationType, BrakeReferenceSpecEvidenceCategory } from '@prisma/client';
import type {
  BrakeReferenceSpecComponent,
  BrakeReferenceSpecProvenanceInput,
  BrakeReferenceSpecRecord,
  BrakeReferenceSpecThicknessInput,
  LegacyRotorWidthAdaptation,
  ResolvedNominalThickness,
  SpecVehicleFitContext,
  SpecVehicleFitResult,
  ThicknessPlausibilityResult,
} from './brake-reference-spec.types';

export const BRAKE_REFERENCE_SPEC_SEMANTIC_MAPPING_VERSION = '2026-07-p10';

/** Higher index = lower priority when resolving conflicts. */
export const BRAKE_REFERENCE_SPEC_SOURCE_PRIORITY: readonly BrakeReferenceSpecEvidenceCategory[] = [
  BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED,
  BrakeReferenceSpecEvidenceCategory.USER_CONFIRMED,
  BrakeReferenceSpecEvidenceCategory.PART_CATALOG_CONFIRMED,
  BrakeReferenceSpecEvidenceCategory.DOCUMENTED,
  BrakeReferenceSpecEvidenceCategory.DEFAULT_ASSUMPTION,
  BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED,
  BrakeReferenceSpecEvidenceCategory.UNKNOWN,
  BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED,
] as const;

export const BRAKE_REFERENCE_SPEC_PLAUSIBILITY = {
  pad: { minMm: 2, maxMm: 25 },
  disc: { minMm: 15, maxMm: 40 },
  rotorWidth: { minMm: 8, maxMm: 50 },
  rotorDiameter: { minMm: 200, maxMm: 500 },
} as const;

const COMPONENT_TO_INSTALLATION: Record<
  BrakeReferenceSpecComponent,
  BrakeComponentInstallationType
> = {
  FRONT_PADS: BrakeComponentInstallationType.FRONT_PADS,
  REAR_PADS: BrakeComponentInstallationType.REAR_PADS,
  FRONT_DISCS: BrakeComponentInstallationType.FRONT_DISCS,
  REAR_DISCS: BrakeComponentInstallationType.REAR_DISCS,
};

const COMPONENT_NOMINAL_FIELD: Record<
  BrakeReferenceSpecComponent,
  keyof BrakeReferenceSpecThicknessInput
> = {
  FRONT_PADS: 'frontPadNominalThicknessMm',
  REAR_PADS: 'rearPadNominalThicknessMm',
  FRONT_DISCS: 'frontDiscNominalThicknessMm',
  REAR_DISCS: 'rearDiscNominalThicknessMm',
};

const COMPONENT_LEGACY_PAD_FIELD: Record<
  'FRONT_PADS' | 'REAR_PADS',
  keyof BrakeReferenceSpecThicknessInput
> = {
  FRONT_PADS: 'frontPadThickness',
  REAR_PADS: 'rearPadThickness',
};

const COMPONENT_LEGACY_ROTOR_WIDTH_FIELD: Record<
  'FRONT_DISCS' | 'REAR_DISCS',
  keyof BrakeReferenceSpecThicknessInput
> = {
  FRONT_DISCS: 'frontRotorWidth',
  REAR_DISCS: 'rearRotorWidth',
};

const COMPONENT_EVIDENCE_FIELD: Record<
  BrakeReferenceSpecComponent,
  keyof BrakeReferenceSpecThicknessInput
> = {
  FRONT_PADS: 'frontPadEvidenceCategory',
  REAR_PADS: 'rearPadEvidenceCategory',
  FRONT_DISCS: 'frontDiscEvidenceCategory',
  REAR_DISCS: 'rearDiscEvidenceCategory',
};

export function componentInstallationToReferenceSpec(
  component: BrakeComponentInstallationType,
): BrakeReferenceSpecComponent | null {
  switch (component) {
    case BrakeComponentInstallationType.FRONT_PADS:
      return 'FRONT_PADS';
    case BrakeComponentInstallationType.REAR_PADS:
      return 'REAR_PADS';
    case BrakeComponentInstallationType.FRONT_DISCS:
      return 'FRONT_DISCS';
    case BrakeComponentInstallationType.REAR_DISCS:
      return 'REAR_DISCS';
    default:
      return null;
  }
}

export function referenceSpecComponentKind(
  component: BrakeReferenceSpecComponent,
): 'pad' | 'disc' {
  return component.endsWith('PADS') ? 'pad' : 'disc';
}

export function compareEvidenceCategoryPriority(
  a: BrakeReferenceSpecEvidenceCategory,
  b: BrakeReferenceSpecEvidenceCategory,
): number {
  return (
    BRAKE_REFERENCE_SPEC_SOURCE_PRIORITY.indexOf(a) -
    BRAKE_REFERENCE_SPEC_SOURCE_PRIORITY.indexOf(b)
  );
}

export function isAnchorEligibleCategory(
  category: BrakeReferenceSpecEvidenceCategory | null | undefined,
): boolean {
  if (!category) return false;
  return (
    category !== BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED &&
    category !== BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED &&
    category !== BrakeReferenceSpecEvidenceCategory.UNKNOWN
  );
}

export function inferEvidenceCategoryFromSourceType(
  sourceType: string | null | undefined,
  options?: {
    userConfirmed?: boolean;
    isDefaultAssumption?: boolean;
  },
): BrakeReferenceSpecEvidenceCategory {
  if (options?.isDefaultAssumption) {
    return BrakeReferenceSpecEvidenceCategory.DEFAULT_ASSUMPTION;
  }
  if (options?.userConfirmed) {
    return BrakeReferenceSpecEvidenceCategory.USER_CONFIRMED;
  }

  const key = String(sourceType ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (!key) return BrakeReferenceSpecEvidenceCategory.UNKNOWN;
  if (key.includes('manufacturer') || key === 'oem' || key === 'manufacturer_confirmed') {
    return BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED;
  }
  if (key.includes('catalog') || key === 'part_catalog' || key === 'parts_catalog') {
    return BrakeReferenceSpecEvidenceCategory.PART_CATALOG_CONFIRMED;
  }
  if (key.includes('ai') || key === 'ai_estimated' || key === 'ai_vehicle_spec' || key === 'ai_document') {
    return BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED;
  }
  if (key.includes('default') || key === 'registration_default') {
    return BrakeReferenceSpecEvidenceCategory.DEFAULT_ASSUMPTION;
  }
  if (
    key.includes('document') ||
    key === 'workshop' ||
    key === 'workshop_document' ||
    key === 'documented'
  ) {
    return BrakeReferenceSpecEvidenceCategory.DOCUMENTED;
  }
  if (
    key.includes('user') ||
    key === 'manual' ||
    key === 'manual_registration' ||
    key === 'user_confirmed'
  ) {
    return BrakeReferenceSpecEvidenceCategory.USER_CONFIRMED;
  }
  if (key === 'legacy' || key === 'legacy_unverified' || key === 'legacy_rotor_width') {
    return BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED;
  }
  return BrakeReferenceSpecEvidenceCategory.UNKNOWN;
}

export function adaptLegacyRotorWidth(
  rotorWidthMm: number,
  axis: 'front' | 'rear',
): LegacyRotorWidthAdaptation {
  return {
    legacyRotorWidthMm: rotorWidthMm,
    axis,
    evidenceCategory: BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED,
    anchorEligible: false,
    warning:
      axis === 'front'
        ? 'frontRotorWidth is legacy rotor width and must not be used as disc nominal thickness without confirmation'
        : 'rearRotorWidth is legacy rotor width and must not be used as disc nominal thickness without confirmation',
  };
}

export function validateThicknessPlausibility(
  component: BrakeReferenceSpecComponent,
  thicknessMm: number,
): ThicknessPlausibilityResult {
  const errors: string[] = [];
  const kind = referenceSpecComponentKind(component);
  const bounds =
    kind === 'pad'
      ? BRAKE_REFERENCE_SPEC_PLAUSIBILITY.pad
      : BRAKE_REFERENCE_SPEC_PLAUSIBILITY.disc;

  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) {
    errors.push(`${component} thickness must be a positive number`);
    return { valid: false, errors };
  }

  if (thicknessMm < bounds.minMm || thicknessMm > bounds.maxMm) {
    errors.push(
      `${component} thickness ${thicknessMm} mm is outside plausible ${kind} range (${bounds.minMm}–${bounds.maxMm} mm)`,
    );
  }

  if (kind === 'pad' && thicknessMm >= BRAKE_REFERENCE_SPEC_PLAUSIBILITY.disc.minMm) {
    errors.push(`${component} value ${thicknessMm} mm looks like a disc thickness, not a pad`);
  }
  if (kind === 'disc' && thicknessMm <= BRAKE_REFERENCE_SPEC_PLAUSIBILITY.pad.maxMm) {
    errors.push(`${component} value ${thicknessMm} mm looks like a pad thickness, not a disc`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateLegacyRotorWidthPlausibility(
  axis: 'front' | 'rear',
  rotorWidthMm: number,
): ThicknessPlausibilityResult {
  const errors: string[] = [];
  const bounds = BRAKE_REFERENCE_SPEC_PLAUSIBILITY.rotorWidth;
  if (!Number.isFinite(rotorWidthMm) || rotorWidthMm <= 0) {
    errors.push(`${axis} rotor width must be a positive number`);
    return { valid: false, errors };
  }
  if (rotorWidthMm < bounds.minMm || rotorWidthMm > bounds.maxMm) {
    errors.push(
      `${axis} rotor width ${rotorWidthMm} mm is outside plausible range (${bounds.minMm}–${bounds.maxMm} mm)`,
    );
  }
  return { valid: errors.length === 0, errors };
}

export function validateSpecVehicleFit(
  spec: Pick<BrakeReferenceSpecRecord, 'sourcePartNumber' | 'sourceProvider'>,
  vehicle: SpecVehicleFitContext,
  component?: BrakeReferenceSpecComponent,
): SpecVehicleFitResult {
  const errors: string[] = [];
  const part = String(spec.sourcePartNumber ?? '').trim();
  if (!part) return { valid: true, errors };

  const makeToken = String(vehicle.make ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const modelToken = String(vehicle.model ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const partLower = part.toLowerCase();

  if (makeToken && partLower.includes('rear') && component?.startsWith('FRONT')) {
    errors.push('Part number indicates rear axle but spec targets front component');
  }
  if (makeToken && partLower.includes('front') && component?.startsWith('REAR')) {
    errors.push('Part number indicates front axle but spec targets rear component');
  }

  if (vehicle.modelYear != null && spec.sourceProvider) {
    const yearMatch = spec.sourceProvider.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const providerYear = Number(yearMatch[0]);
      if (Math.abs(providerYear - vehicle.modelYear) > 3) {
        errors.push(
          `Source provider year ${providerYear} does not match vehicle model year ${vehicle.modelYear}`,
        );
      }
    }
  }

  if (makeToken.length >= 3 && !partLower.includes(makeToken.slice(0, 3)) && modelToken) {
    const performanceMismatch =
      vehicle.performanceVariant === true &&
      !partLower.includes('performance') &&
      !partLower.includes('sport');
    if (performanceMismatch) {
      errors.push('Vehicle performance variant requires performance brake part confirmation');
    }
  }

  return { valid: errors.length === 0, errors };
}

function normalizePositive(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function readCategory(
  spec: BrakeReferenceSpecRecord,
  component: BrakeReferenceSpecComponent,
): BrakeReferenceSpecEvidenceCategory | null {
  const field = COMPONENT_EVIDENCE_FIELD[component];
  return (spec[field] as BrakeReferenceSpecEvidenceCategory | null | undefined) ?? null;
}

export function resolveNominalThickness(
  spec: BrakeReferenceSpecRecord | null | undefined,
  component: BrakeReferenceSpecComponent,
): ResolvedNominalThickness | null {
  if (!spec) return null;

  const nominalField = COMPONENT_NOMINAL_FIELD[component];
  const nominal = normalizePositive(spec[nominalField] as number | null | undefined);
  let category = readCategory(spec, component);
  let sourceField: ResolvedNominalThickness['sourceField'] = 'nominal';

  if (nominal != null) {
    if (!category) {
      category = inferEvidenceCategoryFromSourceType(spec.sourceType, {
        userConfirmed: spec.userConfirmedAt != null,
      });
    }
    return {
      thicknessMm: nominal,
      evidenceCategory: category,
      anchorEligible: isAnchorEligibleCategory(category),
      sourceField,
      semanticMappingVersion:
        spec.semanticMappingVersion ?? BRAKE_REFERENCE_SPEC_SEMANTIC_MAPPING_VERSION,
    };
  }

  if (component === 'FRONT_PADS' || component === 'REAR_PADS') {
    const legacyField = COMPONENT_LEGACY_PAD_FIELD[component];
    const legacyPad = normalizePositive(spec[legacyField] as number | null | undefined);
    if (legacyPad != null) {
      category =
        readCategory(spec, component) ??
        inferEvidenceCategoryFromSourceType(spec.sourceType, {
          userConfirmed: spec.userConfirmedAt != null,
        });
      return {
        thicknessMm: legacyPad,
        evidenceCategory: category,
        anchorEligible: isAnchorEligibleCategory(category),
        sourceField: 'legacy_pad',
        semanticMappingVersion:
          spec.semanticMappingVersion ?? BRAKE_REFERENCE_SPEC_SEMANTIC_MAPPING_VERSION,
      };
    }
  }

  if (component === 'FRONT_DISCS' || component === 'REAR_DISCS') {
    const legacyField = COMPONENT_LEGACY_ROTOR_WIDTH_FIELD[component];
    const legacyWidth = normalizePositive(spec[legacyField] as number | null | undefined);
    if (legacyWidth != null) {
      category =
        readCategory(spec, component) ?? BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED;
      return {
        thicknessMm: legacyWidth,
        evidenceCategory: category,
        anchorEligible: false,
        sourceField: 'legacy_rotor_width_rejected',
        semanticMappingVersion:
          spec.semanticMappingVersion ?? BRAKE_REFERENCE_SPEC_SEMANTIC_MAPPING_VERSION,
      };
    }
  }

  return null;
}

export function resolveAnchorEligibleThicknessMm(
  spec: BrakeReferenceSpecRecord | null | undefined,
  component: BrakeReferenceSpecComponent,
): number | null {
  const resolved = resolveNominalThickness(spec, component);
  if (!resolved?.anchorEligible) return null;
  return resolved.thicknessMm;
}

export function resolveAnchorEligibleThicknessForInstallation(
  spec: BrakeReferenceSpecRecord | null | undefined,
  component: BrakeComponentInstallationType,
): number | null {
  const mapped = componentInstallationToReferenceSpec(component);
  if (!mapped) return null;
  return resolveAnchorEligibleThicknessMm(spec, mapped);
}

export function normalizeReferenceSpecWriteInput(
  input: BrakeReferenceSpecThicknessInput & BrakeReferenceSpecProvenanceInput,
): {
  data: Record<string, unknown>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const data: Record<string, unknown> = {};
  const userConfirmed = input.userConfirmedAt != null;
  const inferredCategory = inferEvidenceCategoryFromSourceType(input.sourceType, {
    userConfirmed,
  });

  const assignPad = (
    nominalKey: 'frontPadNominalThicknessMm' | 'rearPadNominalThicknessMm',
    legacyKey: 'frontPadThickness' | 'rearPadThickness',
    categoryKey: 'frontPadEvidenceCategory' | 'rearPadEvidenceCategory',
    component: 'FRONT_PADS' | 'REAR_PADS',
  ) => {
    const nominal =
      normalizePositive(input[nominalKey]) ?? normalizePositive(input[legacyKey]);
    if (nominal == null) return;
    const category =
      (input[categoryKey] as BrakeReferenceSpecEvidenceCategory | null | undefined) ??
      inferredCategory;
    const plausibility = validateThicknessPlausibility(component, nominal);
    if (!plausibility.valid) {
      throw new Error(plausibility.errors.join('; '));
    }
    data[nominalKey] = nominal;
    data[legacyKey] = nominal;
    data[categoryKey] = category;
  };

  const assignDisc = (
    nominalKey: 'frontDiscNominalThicknessMm' | 'rearDiscNominalThicknessMm',
    legacyWidthKey: 'frontRotorWidth' | 'rearRotorWidth',
    categoryKey: 'frontDiscEvidenceCategory' | 'rearDiscEvidenceCategory',
    component: 'FRONT_DISCS' | 'REAR_DISCS',
    axis: 'front' | 'rear',
  ) => {
    const nominal = normalizePositive(input[nominalKey]);
    if (nominal != null) {
      const category =
        (input[categoryKey] as BrakeReferenceSpecEvidenceCategory | null | undefined) ??
        inferredCategory;
      if (category === BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED && !userConfirmed) {
        throw new Error(`${component} AI-estimated disc nominal thickness cannot be auto-confirmed`);
      }
      const plausibility = validateThicknessPlausibility(component, nominal);
      if (!plausibility.valid) {
        throw new Error(plausibility.errors.join('; '));
      }
      data[nominalKey] = nominal;
      data[categoryKey] = category;
      return;
    }

    const legacyWidth = normalizePositive(input[legacyWidthKey]);
    if (legacyWidth != null) {
      const adaptation = adaptLegacyRotorWidth(legacyWidth, axis);
      warnings.push(adaptation.warning);
      data[legacyWidthKey] = legacyWidth;
      data[categoryKey] = BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED;
    }
  };

  assignPad(
    'frontPadNominalThicknessMm',
    'frontPadThickness',
    'frontPadEvidenceCategory',
    'FRONT_PADS',
  );
  assignPad(
    'rearPadNominalThicknessMm',
    'rearPadThickness',
    'rearPadEvidenceCategory',
    'REAR_PADS',
  );
  assignDisc(
    'frontDiscNominalThicknessMm',
    'frontRotorWidth',
    'frontDiscEvidenceCategory',
    'FRONT_DISCS',
    'front',
  );
  assignDisc(
    'rearDiscNominalThicknessMm',
    'rearRotorWidth',
    'rearDiscEvidenceCategory',
    'REAR_DISCS',
    'rear',
  );

  if (input.sourceType != null) data.sourceType = input.sourceType;
  if (input.sourceUrl != null) data.sourceUrl = input.sourceUrl;
  if (input.sourcePartNumber != null) data.sourcePartNumber = input.sourcePartNumber;
  if (input.sourceProvider != null) data.sourceProvider = input.sourceProvider;
  if (input.sourceRetrievedAt != null) {
    data.sourceRetrievedAt =
      input.sourceRetrievedAt instanceof Date
        ? input.sourceRetrievedAt
        : new Date(input.sourceRetrievedAt);
  }
  if (input.sourceConfidence != null) data.sourceConfidence = input.sourceConfidence;
  if (input.userConfirmedAt != null) {
    data.userConfirmedAt =
      input.userConfirmedAt instanceof Date
        ? input.userConfirmedAt
        : new Date(input.userConfirmedAt);
  }
  if (input.userConfirmedBy != null) data.userConfirmedBy = input.userConfirmedBy;
  data.semanticMappingVersion = BRAKE_REFERENCE_SPEC_SEMANTIC_MAPPING_VERSION;

  return { data, warnings };
}

export function pickPreferredReferenceSpec<T extends BrakeReferenceSpecRecord>(
  specs: T[],
): T | null {
  if (specs.length === 0) return null;
  if (specs.length === 1) return specs[0]!;

  const scored = specs.map((spec) => {
    const categories = (
      [
        spec.frontPadEvidenceCategory,
        spec.rearPadEvidenceCategory,
        spec.frontDiscEvidenceCategory,
        spec.rearDiscEvidenceCategory,
      ] as Array<BrakeReferenceSpecEvidenceCategory | null | undefined>
    ).filter(Boolean) as BrakeReferenceSpecEvidenceCategory[];

    const bestCategory =
      categories.length > 0
        ? categories.reduce((best, current) =>
            compareEvidenceCategoryPriority(current, best) < 0 ? current : best,
          )
        : inferEvidenceCategoryFromSourceType(spec.sourceType, {
            userConfirmed: spec.userConfirmedAt != null,
          });

    const createdAt = spec.createdAt ? new Date(spec.createdAt).getTime() : 0;
    return { spec, bestCategory, createdAt };
  });

  scored.sort((a, b) => {
    const priorityDiff = compareEvidenceCategoryPriority(a.bestCategory, b.bestCategory);
    if (priorityDiff !== 0) return priorityDiff;
    return b.createdAt - a.createdAt;
  });

  return scored[0]!.spec;
}

export function detectReferenceSpecConflict(
  left: BrakeReferenceSpecRecord,
  right: BrakeReferenceSpecRecord,
  component: BrakeReferenceSpecComponent,
): boolean {
  const a = resolveNominalThickness(left, component);
  const b = resolveNominalThickness(right, component);
  if (!a || !b) return false;
  if (!a.anchorEligible || !b.anchorEligible) return false;
  return Math.abs(a.thicknessMm - b.thicknessMm) > 0.05;
}
