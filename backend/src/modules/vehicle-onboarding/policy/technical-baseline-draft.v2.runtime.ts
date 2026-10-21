import { BrakeReferenceSpecEvidenceCategory } from '@prisma/client';
import {
  BATTERY_REFERENCE_CAPACITY_ASSESSMENT_COMPATIBLE_TYPES,
  BATTERY_REFERENCE_CAPACITY_ALLOWED_SOURCES,
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import { assertExactObjectKeys } from './capture-strict-keys.util';
import type {
  VehicleOnboardingBrakeReferenceDraft,
  VehicleOnboardingHvBatteryReferenceDraft,
  VehicleOnboardingTireInstalledConfigDraft,
  VehicleOnboardingTireReferenceSpecDraft,
  VehicleTechnicalBaselineDraftV2,
} from '../contracts/vehicle-technical-baseline-draft.v2';

export type StrictSectionParse<T> =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'valid'; value: T };

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val != null && typeof val === 'object' && !Array.isArray(val);
}

function optionalString(val: unknown): string | null | undefined {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string') return undefined;
  return val;
}

function optionalFinitePositive(val: unknown): number | null | undefined {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) return undefined;
  return val;
}

function optionalFiniteNumber(val: unknown): number | null | undefined {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
  return val;
}

function parseEvidenceCategory(val: unknown): BrakeReferenceSpecEvidenceCategory | null | undefined {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string') return undefined;
  if (
    !(Object.values(BrakeReferenceSpecEvidenceCategory) as string[]).includes(val)
  ) {
    return undefined;
  }
  return val as BrakeReferenceSpecEvidenceCategory;
}

function parseIsoTimestamp(val: unknown): string | null | undefined {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string') return undefined;
  const t = Date.parse(val);
  if (Number.isNaN(t)) return undefined;
  return val;
}

export function strictParseTireReferenceSpec(
  raw: unknown,
): StrictSectionParse<VehicleOnboardingTireReferenceSpecDraft> {
  if (raw === undefined || raw === null) return { kind: 'absent' };
  if (!isPlainObject(raw)) return { kind: 'invalid' };
  try {
    assertExactObjectKeys(raw, [
      'frontDimension',
      'rearDimension',
      'loadIndexFront',
      'speedIndexFront',
      'loadIndexRear',
      'speedIndexRear',
      'recommendedPressureFrontBar',
      'recommendedPressureRearBar',
      'referenceProvenance',
    ], 'tireReferenceSpec');
  } catch {
    return { kind: 'invalid' };
  }

  const frontDimension = optionalString(raw.frontDimension);
  const rearDimension = optionalString(raw.rearDimension);
  const loadIndexFront = optionalString(raw.loadIndexFront);
  const speedIndexFront = optionalString(raw.speedIndexFront);
  const loadIndexRear = optionalString(raw.loadIndexRear);
  const speedIndexRear = optionalString(raw.speedIndexRear);
  const referenceProvenance = optionalString(raw.referenceProvenance);
  const recommendedPressureFrontBar = optionalFinitePositive(raw.recommendedPressureFrontBar);
  const recommendedPressureRearBar = optionalFinitePositive(raw.recommendedPressureRearBar);

  if (
    frontDimension === undefined ||
    rearDimension === undefined ||
    loadIndexFront === undefined ||
    speedIndexFront === undefined ||
    loadIndexRear === undefined ||
    speedIndexRear === undefined ||
    referenceProvenance === undefined ||
    recommendedPressureFrontBar === undefined ||
    recommendedPressureRearBar === undefined
  ) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'valid',
    value: {
      frontDimension,
      rearDimension,
      loadIndexFront,
      speedIndexFront,
      loadIndexRear,
      speedIndexRear,
      recommendedPressureFrontBar,
      recommendedPressureRearBar,
      referenceProvenance,
    },
  };
}

export function strictParseTireInstalledConfig(
  raw: unknown,
): StrictSectionParse<VehicleOnboardingTireInstalledConfigDraft> {
  if (raw === undefined || raw === null) return { kind: 'absent' };
  if (!isPlainObject(raw)) return { kind: 'invalid' };
  try {
    assertExactObjectKeys(raw, [
      'evidenceInstalled',
      'brandModelFront',
      'brandModelRear',
      'tireSeason',
      'installedAt',
      'frontDimension',
      'rearDimension',
    ], 'tireInstalledConfig');
  } catch {
    return { kind: 'invalid' };
  }
  if (raw.evidenceInstalled !== true) return { kind: 'invalid' };

  const brandModelFront = optionalString(raw.brandModelFront);
  const brandModelRear = optionalString(raw.brandModelRear);
  const tireSeason = optionalString(raw.tireSeason);
  const installedAt = parseIsoTimestamp(raw.installedAt);
  const frontDimension = optionalString(raw.frontDimension);
  const rearDimension = optionalString(raw.rearDimension);

  if (
    brandModelFront === undefined ||
    brandModelRear === undefined ||
    tireSeason === undefined ||
    installedAt === undefined ||
    frontDimension === undefined ||
    rearDimension === undefined
  ) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'valid',
    value: {
      evidenceInstalled: true,
      brandModelFront,
      brandModelRear,
      tireSeason,
      installedAt,
      frontDimension,
      rearDimension,
    },
  };
}

const BRAKE_REFERENCE_ALLOWED_KEYS = [
  'frontPadNominalThicknessMm',
  'rearPadNominalThicknessMm',
  'frontDiscNominalThicknessMm',
  'rearDiscNominalThicknessMm',
  'frontPadMinimumThicknessMm',
  'rearPadMinimumThicknessMm',
  'frontDiscMinimumThicknessMm',
  'rearDiscMinimumThicknessMm',
  'frontRotorDiameter',
  'rearRotorDiameter',
  'frontRotorWidth',
  'rearRotorWidth',
  'sourceConfidence',
  'thresholdConfidence',
  'frontPadThickness',
  'rearPadThickness',
  'sourceType',
  'sourceUrl',
  'sourcePartNumber',
  'sourceProvider',
  'userConfirmedBy',
  'frontPadEvidenceCategory',
  'rearPadEvidenceCategory',
  'frontDiscEvidenceCategory',
  'rearDiscEvidenceCategory',
  'sourceRetrievedAt',
  'userConfirmedAt',
  'thresholdConfirmedAt',
] as const;

export function strictParseBrakeReference(
  raw: unknown,
): StrictSectionParse<VehicleOnboardingBrakeReferenceDraft> {
  if (raw === undefined || raw === null) return { kind: 'absent' };
  if (!isPlainObject(raw)) return { kind: 'invalid' };
  try {
    assertExactObjectKeys(raw, BRAKE_REFERENCE_ALLOWED_KEYS, 'brakeReference');
  } catch {
    return { kind: 'invalid' };
  }

  const value: Record<string, unknown> = {};

  const numericFields = [
    'frontPadNominalThicknessMm',
    'rearPadNominalThicknessMm',
    'frontDiscNominalThicknessMm',
    'rearDiscNominalThicknessMm',
    'frontPadMinimumThicknessMm',
    'rearPadMinimumThicknessMm',
    'frontDiscMinimumThicknessMm',
    'rearDiscMinimumThicknessMm',
    'frontRotorDiameter',
    'rearRotorDiameter',
    'frontRotorWidth',
    'rearRotorWidth',
    'sourceConfidence',
    'thresholdConfidence',
    'frontPadThickness',
    'rearPadThickness',
  ] as const;

  for (const key of numericFields) {
    if (!(key in raw)) continue;
    const v = optionalFiniteNumber(raw[key]);
    if (v === undefined) return { kind: 'invalid' };
    value[key] = v;
  }

  const provenanceStrings = [
    'sourceType',
    'sourceUrl',
    'sourcePartNumber',
    'sourceProvider',
    'userConfirmedBy',
  ] as const;
  for (const key of provenanceStrings) {
    if (!(key in raw)) continue;
    const v = optionalString(raw[key]);
    if (v === undefined) return { kind: 'invalid' };
    value[key] = v;
  }

  const evidenceFields = [
    'frontPadEvidenceCategory',
    'rearPadEvidenceCategory',
    'frontDiscEvidenceCategory',
    'rearDiscEvidenceCategory',
  ] as const;
  for (const key of evidenceFields) {
    if (!(key in raw)) continue;
    const v = parseEvidenceCategory(raw[key]);
    if (v === undefined) return { kind: 'invalid' };
    value[key] = v;
  }

  if ('sourceRetrievedAt' in raw && raw.sourceRetrievedAt != null) {
    const v = parseIsoTimestamp(raw.sourceRetrievedAt);
    if (v === undefined) return { kind: 'invalid' };
    value.sourceRetrievedAt = v;
  }
  if ('userConfirmedAt' in raw && raw.userConfirmedAt != null) {
    const v = parseIsoTimestamp(raw.userConfirmedAt);
    if (v === undefined) return { kind: 'invalid' };
    value.userConfirmedAt = v;
  }
  if ('thresholdConfirmedAt' in raw && raw.thresholdConfirmedAt != null) {
    const v = parseIsoTimestamp(raw.thresholdConfirmedAt);
    if (v === undefined) return { kind: 'invalid' };
    value.thresholdConfirmedAt = v;
  }

  return { kind: 'valid', value: value as VehicleOnboardingBrakeReferenceDraft };
}

export function strictParseHvBatteryReference(
  raw: unknown,
): StrictSectionParse<VehicleOnboardingHvBatteryReferenceDraft> {
  if (raw === undefined || raw === null) return { kind: 'absent' };
  if (!isPlainObject(raw)) return { kind: 'invalid' };
  try {
    assertExactObjectKeys(
      raw,
      ['capacityKwh', 'capacityType', 'source', 'documentId', 'serviceEventId', 'notes'],
      'hvBatteryReference',
    );
  } catch {
    return { kind: 'invalid' };
  }

  if (typeof raw.capacityKwh !== 'number' || !Number.isFinite(raw.capacityKwh) || raw.capacityKwh <= 0) {
    return { kind: 'invalid' };
  }
  if (typeof raw.capacityType !== 'string') return { kind: 'invalid' };
  if (typeof raw.source !== 'string') return { kind: 'invalid' };

  const capacityType = raw.capacityType as BatteryReferenceCapacityType;
  const source = raw.source as BatteryReferenceCapacitySource;

  if (!(BATTERY_REFERENCE_CAPACITY_ASSESSMENT_COMPATIBLE_TYPES as readonly string[]).includes(capacityType)) {
    return { kind: 'invalid' };
  }
  if (!(BATTERY_REFERENCE_CAPACITY_ALLOWED_SOURCES as readonly string[]).includes(source)) {
    return { kind: 'invalid' };
  }

  const documentId = optionalString(raw.documentId);
  const notes = optionalString(raw.notes);
  if (documentId === undefined || notes === undefined) return { kind: 'invalid' };

  if (raw.serviceEventId != null) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'valid',
    value: {
      capacityKwh: raw.capacityKwh,
      capacityType,
      source,
      documentId,
      serviceEventId: null,
      notes,
    },
  };
}

export function buildTechnicalBaselineDraftV2FromRaw(raw: Record<string, unknown>): {
  draft: VehicleTechnicalBaselineDraftV2;
  hasInvalidSection: boolean;
} {
  const tireReferenceSpec = strictParseTireReferenceSpec(raw.tireReferenceSpec);
  const tireInstalledConfig = strictParseTireInstalledConfig(raw.tireInstalledConfig);
  const brakeReference = strictParseBrakeReference(raw.brakeReference);
  const hvBatteryReference = strictParseHvBatteryReference(raw.hvBatteryReference);

  const hasInvalidSection =
    tireReferenceSpec.kind === 'invalid' ||
    tireInstalledConfig.kind === 'invalid' ||
    brakeReference.kind === 'invalid' ||
    hvBatteryReference.kind === 'invalid';

  return {
    hasInvalidSection,
    draft: {
      version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      tireReferenceSpec: tireReferenceSpec.kind === 'valid' ? tireReferenceSpec.value : null,
      tireInstalledConfig:
        tireInstalledConfig.kind === 'valid' ? tireInstalledConfig.value : null,
      brakeReference: brakeReference.kind === 'valid' ? brakeReference.value : null,
      hvBatteryReference: hvBatteryReference.kind === 'valid' ? hvBatteryReference.value : null,
    },
  };
}

export function sectionParseKind<T>(
  result: StrictSectionParse<T>,
): 'absent' | 'invalid' | 'valid' {
  if (result.kind === 'absent') return 'absent';
  if (result.kind === 'invalid') return 'invalid';
  return 'valid';
}

export function assessStrictV2SectionFromRaw(
  raw: unknown,
  parser: (r: unknown) => StrictSectionParse<unknown>,
): 'absent' | 'invalid' | 'present' {
  if (raw === undefined || raw === null) return 'absent';
  const parsed = parser(raw);
  if (parsed.kind === 'invalid') return 'invalid';
  if (parsed.kind === 'absent') return 'absent';
  return 'present';
}
