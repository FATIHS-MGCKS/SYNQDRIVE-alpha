import type { VehicleOnboardingCase } from '@prisma/client';
import {
  VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION,
  VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
} from '../contracts/vo-document-versions';
import type { VehicleTechnicalBaselineDraftV1 } from '../contracts/vehicle-technical-baseline-draft.v1';
import type { VehicleTechnicalBaselineDraftV2 } from '../contracts/vehicle-technical-baseline-draft.v2';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { evaluateReferenceCapacityCreate } from '@modules/vehicle-intelligence/battery-health/reference-capacity/vehicle-battery-reference-capacity.policy';
import { isOnboardingBrakeReferenceMaterializable } from './technical-baseline-brake.validation';
import { buildBrakeSpecVehicleFitContextFromCase } from './technical-baseline-vehicle-context';
import {
  assessStrictV2SectionFromRaw,
  strictParseBrakeReference,
  strictParseHvBatteryReference,
  buildTechnicalBaselineDraftV2FromRaw,
  strictParseTireInstalledConfig,
  strictParseTireReferenceSpec,
} from './technical-baseline-draft.v2.runtime';

export type TechnicalBaselineDraftParsed =
  | { version: 1; draft: VehicleTechnicalBaselineDraftV1 }
  | { version: 2; draft: VehicleTechnicalBaselineDraftV2 };

export type BaselineSectionMaterializationState =
  | 'absent'
  | 'materializable'
  | 'invalid'
  | 'v1_opaque_only';

const OPAQUE_V1_KEYS = {
  tire: 'tireReferenceId',
  brake: 'brakeReferenceSpecId',
  hvBattery: 'hvBatteryReferenceId',
} as const;

function isNonEmptyString(val: unknown): boolean {
  return typeof val === 'string' && val.trim() !== '';
}

function rawTechnicalJson(caseRow: VehicleOnboardingCase): Record<string, unknown> | null {
  const json = caseRow.draftTechnicalBaselineJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return json as Record<string, unknown>;
}

export function parseTechnicalBaselineDraft(caseRow: VehicleOnboardingCase): TechnicalBaselineDraftParsed {
  const version = caseRow.draftTechnicalBaselineVersion;
  const json = caseRow.draftTechnicalBaselineJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new VehicleOnboardingError(
      'UNSUPPORTED_CONTRACT_VERSION',
      'Invalid draftTechnicalBaselineJson',
    );
  }

  if (version === VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION) {
    const draft = json as VehicleTechnicalBaselineDraftV1;
    if (draft.version !== VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION) {
      throw new VehicleOnboardingError(
        'UNSUPPORTED_CONTRACT_VERSION',
        'draftTechnicalBaselineJson.version mismatch',
      );
    }
    return { version: 1, draft };
  }

  if (version === VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2) {
    const raw = json as Record<string, unknown>;
    if (raw.version !== VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2) {
      throw new VehicleOnboardingError(
        'UNSUPPORTED_CONTRACT_VERSION',
        'draftTechnicalBaselineJson.version mismatch',
      );
    }
    const { draft } = buildTechnicalBaselineDraftV2FromRaw(raw);
    return { version: 2, draft };
  }

  throw new VehicleOnboardingError(
    'UNSUPPORTED_CONTRACT_VERSION',
    `Unsupported draftTechnicalBaselineVersion: ${version}`,
  );
}

export function isTireReferenceSpecMaterializable(
  spec: VehicleTechnicalBaselineDraftV2['tireReferenceSpec'],
): boolean {
  if (!spec) return false;
  return (
    isNonEmptyString(spec.frontDimension) ||
    isNonEmptyString(spec.rearDimension) ||
    isNonEmptyString(spec.loadIndexFront) ||
    isNonEmptyString(spec.loadIndexRear)
  );
}

export function isHvBatteryReferenceMaterializable(
  hv: VehicleTechnicalBaselineDraftV2['hvBatteryReference'],
): boolean {
  if (!hv) return false;
  return evaluateReferenceCapacityCreate(hv).ok;
}

export function assessTireBaselineState(
  parsed: TechnicalBaselineDraftParsed,
  caseRow?: VehicleOnboardingCase,
): BaselineSectionMaterializationState {
  if (parsed.version === 1) {
    const val = parsed.draft.referenceInputs[OPAQUE_V1_KEYS.tire];
    if (isNonEmptyString(val) || (val != null && typeof val !== 'string')) {
      return 'v1_opaque_only';
    }
    return 'absent';
  }
  const raw = caseRow ? rawTechnicalJson(caseRow) : null;
  if (raw) {
    const section = assessStrictV2SectionFromRaw(raw.tireReferenceSpec, strictParseTireReferenceSpec);
    if (section === 'invalid') return 'invalid';
    const installed = assessStrictV2SectionFromRaw(
      raw.tireInstalledConfig,
      strictParseTireInstalledConfig,
    );
    if (installed === 'invalid') return 'invalid';
  }

  const { tireReferenceSpec, tireInstalledConfig } = parsed.draft;
  if (!tireReferenceSpec && !tireInstalledConfig) return 'absent';

  if (tireInstalledConfig) {
    return 'materializable';
  }
  if (isTireReferenceSpecMaterializable(tireReferenceSpec)) return 'materializable';
  return 'invalid';
}

export function assessBrakeBaselineState(
  parsed: TechnicalBaselineDraftParsed,
  caseRow?: VehicleOnboardingCase,
): BaselineSectionMaterializationState {
  if (parsed.version === 1) {
    const val = parsed.draft.referenceInputs[OPAQUE_V1_KEYS.brake];
    if (isNonEmptyString(val) || (val != null && typeof val !== 'string')) {
      return 'v1_opaque_only';
    }
    return 'absent';
  }
  const raw = caseRow ? rawTechnicalJson(caseRow) : null;
  if (raw) {
    const section = assessStrictV2SectionFromRaw(raw.brakeReference, strictParseBrakeReference);
    if (section === 'invalid') return 'invalid';
  }
  if (!parsed.draft.brakeReference) return 'absent';

  const vehicleContext = caseRow
    ? buildBrakeSpecVehicleFitContextFromCase(caseRow)
    : {};
  return isOnboardingBrakeReferenceMaterializable(parsed.draft.brakeReference, vehicleContext)
    ? 'materializable'
    : 'invalid';
}

export function assessHvBatteryBaselineState(
  parsed: TechnicalBaselineDraftParsed,
  caseRow?: VehicleOnboardingCase,
): BaselineSectionMaterializationState {
  if (parsed.version === 1) {
    const val = parsed.draft.referenceInputs[OPAQUE_V1_KEYS.hvBattery];
    if (isNonEmptyString(val) || (val != null && typeof val !== 'string')) {
      return 'v1_opaque_only';
    }
    return 'absent';
  }
  const raw = caseRow ? rawTechnicalJson(caseRow) : null;
  if (raw) {
    const section = assessStrictV2SectionFromRaw(
      raw.hvBatteryReference,
      strictParseHvBatteryReference,
    );
    if (section === 'invalid') return 'invalid';
  }
  if (!parsed.draft.hvBatteryReference) return 'absent';
  return isHvBatteryReferenceMaterializable(parsed.draft.hvBatteryReference)
    ? 'materializable'
    : 'invalid';
}

export function parseTechnicalBaselineDraftV2ForActivation(
  caseRow: VehicleOnboardingCase,
): VehicleTechnicalBaselineDraftV2 {
  const parsed = parseTechnicalBaselineDraft(caseRow);
  if (parsed.version !== 2) {
    return {
      version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
    };
  }
  return parsed.draft;
}
