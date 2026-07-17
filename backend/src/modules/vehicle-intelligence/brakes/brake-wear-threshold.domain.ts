import { BrakeWearThresholdSource } from '@prisma/client';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import {
  componentInstallationToReferenceSpec,
  inferEvidenceCategoryFromSourceType,
  isAnchorEligibleCategory,
  resolveNominalThickness,
} from './brake-reference-spec.domain';
import type { BrakeReferenceSpecComponent, BrakeReferenceSpecRecord } from './brake-reference-spec.types';
import type {
  BrakeComponentWearThresholdContract,
  ResolveWearThresholdOptions,
} from './brake-wear-threshold.types';
import { BrakeComponentInstallationType } from '@prisma/client';

const COMPONENT_MINIMUM_FIELD: Record<
  BrakeReferenceSpecComponent,
  keyof BrakeReferenceSpecRecord
> = {
  FRONT_PADS: 'frontPadMinimumThicknessMm',
  REAR_PADS: 'rearPadMinimumThicknessMm',
  FRONT_DISCS: 'frontDiscMinimumThicknessMm',
  REAR_DISCS: 'rearDiscMinimumThicknessMm',
};

function normalizePositive(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function inferThresholdSourceFromSpec(
  spec: BrakeReferenceSpecRecord | null | undefined,
): BrakeWearThresholdSource {
  if (spec?.thresholdSource) return spec.thresholdSource;

  const evidence = inferEvidenceCategoryFromSourceType(spec?.sourceType, {
    userConfirmed: spec?.userConfirmedAt != null,
  });

  switch (evidence) {
    case 'MANUFACTURER_CONFIRMED':
      return BrakeWearThresholdSource.MANUFACTURER_MINIMUM;
    case 'USER_CONFIRMED':
      return BrakeWearThresholdSource.USER_CONFIRMED;
    case 'PART_CATALOG_CONFIRMED':
      return BrakeWearThresholdSource.PART_CATALOG;
    case 'DOCUMENTED':
      return BrakeWearThresholdSource.WORKSHOP_DOCUMENTED;
    case 'AI_ESTIMATED':
      return BrakeWearThresholdSource.AI_ESTIMATED;
    case 'DEFAULT_ASSUMPTION':
    case 'LEGACY_UNVERIFIED':
      return BrakeWearThresholdSource.LEGACY_DEFAULT;
    default:
      return BrakeWearThresholdSource.UNKNOWN;
  }
}

export function isThresholdConfirmed(
  spec: BrakeReferenceSpecRecord | null | undefined,
  source: BrakeWearThresholdSource,
): boolean {
  if (spec?.thresholdConfirmedAt != null) return true;
  if (source === BrakeWearThresholdSource.AI_ESTIMATED) return false;
  if (source === BrakeWearThresholdSource.LEGACY_DEFAULT) return false;
  if (source === BrakeWearThresholdSource.UNKNOWN) return false;
  if (spec?.userConfirmedAt != null) return true;
  return (
    source === BrakeWearThresholdSource.MANUFACTURER_MINIMUM ||
    source === BrakeWearThresholdSource.WORKSHOP_DOCUMENTED ||
    source === BrakeWearThresholdSource.USER_CONFIRMED ||
    source === BrakeWearThresholdSource.PART_CATALOG
  );
}

function readSpecMinimum(
  spec: BrakeReferenceSpecRecord | null | undefined,
  component: BrakeReferenceSpecComponent,
): number | null {
  if (!spec) return null;
  const field = COMPONENT_MINIMUM_FIELD[component];
  return normalizePositive(spec[field] as number | null | undefined);
}

function computeOperationalWarningMm(
  component: BrakeReferenceSpecComponent,
  minimumMm: number,
  anchorMm: number | null | undefined,
): number {
  if (component.endsWith('PADS')) {
    return Math.max(minimumMm + 1.5, BRAKE_HEALTH_CONFIG.pad.warningMm);
  }
  if (anchorMm != null && anchorMm > minimumMm) {
    const warnWear = BRAKE_HEALTH_CONFIG.disc.warningWearMm;
    return Math.max(minimumMm + 0.5, anchorMm - warnWear);
  }
  return minimumMm + 1;
}

export function resolveComponentWearThreshold(
  component: BrakeReferenceSpecComponent,
  spec: BrakeReferenceSpecRecord | null | undefined,
  options: ResolveWearThresholdOptions = {},
): BrakeComponentWearThresholdContract {
  const nominal = resolveNominalThickness(spec, component);
  const installationMinimum = normalizePositive(options.installationMinimumMm);
  const specMinimum = readSpecMinimum(spec, component);
  const minimumThicknessMm = installationMinimum ?? specMinimum;
  const source = inferThresholdSourceFromSpec(spec);
  const confirmed =
    minimumThicknessMm != null &&
    isThresholdConfirmed(spec, source) &&
    source !== BrakeWearThresholdSource.AI_ESTIMATED &&
    source !== BrakeWearThresholdSource.LEGACY_DEFAULT;

  if (minimumThicknessMm != null) {
    const warningThresholdMm = confirmed
      ? computeOperationalWarningMm(component, minimumThicknessMm, options.anchorMm)
      : null;
    return {
      component,
      nominalThicknessMm: nominal?.thicknessMm ?? null,
      currentMeasuredThicknessMm: normalizePositive(options.currentMeasuredThicknessMm),
      minimumThicknessMm,
      warningThresholdMm,
      criticalThresholdMm: confirmed ? minimumThicknessMm : null,
      source,
      confirmed,
      thresholdMissing: false,
      thresholdConfidence: spec?.thresholdConfidence ?? null,
      usesLegacyDefault: false,
    };
  }

  const isDisc = component.endsWith('DISCS');
  if (isDisc) {
    return {
      component,
      nominalThicknessMm: nominal?.thicknessMm ?? null,
      currentMeasuredThicknessMm: normalizePositive(options.currentMeasuredThicknessMm),
      minimumThicknessMm: null,
      warningThresholdMm: null,
      criticalThresholdMm: null,
      source: BrakeWearThresholdSource.UNKNOWN,
      confirmed: false,
      thresholdMissing: true,
      thresholdConfidence: null,
      usesLegacyDefault: false,
    };
  }

  // Pads without component minimum: legacy defaults may guide estimates only.
  const legacyMinimum = BRAKE_HEALTH_CONFIG.pad.criticalMm;
  const legacyWarning = BRAKE_HEALTH_CONFIG.pad.warningMm;
  return {
    component,
    nominalThicknessMm: nominal?.thicknessMm ?? null,
    currentMeasuredThicknessMm: normalizePositive(options.currentMeasuredThicknessMm),
    minimumThicknessMm: legacyMinimum,
    warningThresholdMm: legacyWarning,
    criticalThresholdMm: null,
    source: BrakeWearThresholdSource.LEGACY_DEFAULT,
    confirmed: false,
    thresholdMissing: true,
    thresholdConfidence: null,
    usesLegacyDefault: true,
  };
}

export function resolveWearThresholdForInstallation(
  component: BrakeComponentInstallationType,
  spec: BrakeReferenceSpecRecord | null | undefined,
  options: ResolveWearThresholdOptions = {},
): BrakeComponentWearThresholdContract | null {
  const mapped = componentInstallationToReferenceSpec(component);
  if (!mapped) return null;
  return resolveComponentWearThreshold(mapped, spec, options);
}

export function resolveAllComponentWearThresholds(
  spec: BrakeReferenceSpecRecord | null | undefined,
  anchors?: Partial<Record<BrakeReferenceSpecComponent, number | null>>,
): Record<BrakeReferenceSpecComponent, BrakeComponentWearThresholdContract> {
  const components: BrakeReferenceSpecComponent[] = [
    'FRONT_PADS',
    'REAR_PADS',
    'FRONT_DISCS',
    'REAR_DISCS',
  ];
  return components.reduce(
    (acc, component) => {
      acc[component] = resolveComponentWearThreshold(component, spec, {
        anchorMm: anchors?.[component] ?? null,
      });
      return acc;
    },
    {} as Record<BrakeReferenceSpecComponent, BrakeComponentWearThresholdContract>,
  );
}

export function modelingMinimumMm(threshold: BrakeComponentWearThresholdContract): number | null {
  if (threshold.component.endsWith('DISCS')) {
    if (threshold.thresholdMissing || threshold.minimumThicknessMm == null) return null;
    return threshold.minimumThicknessMm;
  }
  if (threshold.minimumThicknessMm == null) return null;
  return threshold.minimumThicknessMm;
}

export function modelingUsableWearMm(
  anchorMm: number,
  threshold: BrakeComponentWearThresholdContract,
): number | null {
  const minimum = modelingMinimumMm(threshold);
  if (minimum == null) return null;
  const usable = anchorMm - minimum;
  return usable > 0 ? usable : 0;
}

export function canEmitMeasuredCritical(threshold: BrakeComponentWearThresholdContract): boolean {
  return (
    threshold.confirmed &&
    !threshold.thresholdMissing &&
    threshold.criticalThresholdMm != null &&
    !threshold.usesLegacyDefault
  );
}

export function toThresholdApiContract(
  threshold: BrakeComponentWearThresholdContract,
): Pick<
  BrakeComponentWearThresholdContract,
  | 'component'
  | 'warningThresholdMm'
  | 'criticalThresholdMm'
  | 'source'
  | 'confirmed'
  | 'thresholdMissing'
> {
  return {
    component: threshold.component,
    warningThresholdMm: threshold.warningThresholdMm,
    criticalThresholdMm: threshold.criticalThresholdMm,
    source: threshold.source,
    confirmed: threshold.confirmed,
    thresholdMissing: threshold.thresholdMissing,
  };
}
