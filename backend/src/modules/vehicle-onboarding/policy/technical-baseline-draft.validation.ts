import type { VehicleOnboardingCase } from '@prisma/client';
import {
  VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION,
  VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
} from '../contracts/vo-document-versions';
import type { VehicleTechnicalBaselineDraftV1 } from '../contracts/vehicle-technical-baseline-draft.v1';
import type {
  VehicleOnboardingBrakeReferenceDraft,
  VehicleOnboardingHvBatteryReferenceDraft,
  VehicleOnboardingTireInstalledConfigDraft,
  VehicleOnboardingTireReferenceSpecDraft,
  VehicleTechnicalBaselineDraftV2,
} from '../contracts/vehicle-technical-baseline-draft.v2';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  normalizeReferenceSpecWriteInput,
  validateSpecVehicleFit,
} from '@modules/vehicle-intelligence/brakes/brake-reference-spec.domain';
import { evaluateReferenceCapacityCreate } from '@modules/vehicle-intelligence/battery-health/reference-capacity/vehicle-battery-reference-capacity.policy';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';

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

function parseV2TireReferenceSpec(raw: unknown): VehicleOnboardingTireReferenceSpecDraft | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as VehicleOnboardingTireReferenceSpecDraft;
}

function parseV2TireInstalled(raw: unknown): VehicleOnboardingTireInstalledConfigDraft | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.evidenceInstalled !== true) return null;
  return raw as VehicleOnboardingTireInstalledConfigDraft;
}

function parseV2Brake(raw: unknown): VehicleOnboardingBrakeReferenceDraft | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as VehicleOnboardingBrakeReferenceDraft;
}

function parseV2HvBattery(raw: unknown): VehicleOnboardingHvBatteryReferenceDraft | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.capacityKwh !== 'number') return null;
  if (typeof o.capacityType !== 'string') return null;
  if (typeof o.source !== 'string') return null;
  return {
    capacityKwh: o.capacityKwh,
    capacityType: o.capacityType as BatteryReferenceCapacityType,
    source: o.source as BatteryReferenceCapacitySource,
    documentId: (o.documentId as string | null | undefined) ?? null,
    serviceEventId: (o.serviceEventId as string | null | undefined) ?? null,
    notes: (o.notes as string | null | undefined) ?? null,
  };
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
    const draft: VehicleTechnicalBaselineDraftV2 = {
      version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      tireReferenceSpec: parseV2TireReferenceSpec(raw.tireReferenceSpec),
      tireInstalledConfig: parseV2TireInstalled(raw.tireInstalledConfig),
      brakeReference: parseV2Brake(raw.brakeReference),
      hvBatteryReference: parseV2HvBattery(raw.hvBatteryReference),
    };
    return { version: 2, draft };
  }

  throw new VehicleOnboardingError(
    'UNSUPPORTED_CONTRACT_VERSION',
    `Unsupported draftTechnicalBaselineVersion: ${version}`,
  );
}

export function isTireReferenceSpecMaterializable(
  spec: VehicleOnboardingTireReferenceSpecDraft | null | undefined,
): boolean {
  if (!spec) return false;
  return (
    isNonEmptyString(spec.frontDimension) ||
    isNonEmptyString(spec.rearDimension) ||
    isNonEmptyString(spec.loadIndexFront) ||
    isNonEmptyString(spec.loadIndexRear)
  );
}

export function isBrakeReferenceMaterializable(
  brake: VehicleOnboardingBrakeReferenceDraft | null | undefined,
): boolean {
  if (!brake) return false;
  try {
    const fit = validateSpecVehicleFit(brake, {}, undefined);
    if (!fit.valid) return false;
    const normalized = normalizeReferenceSpecWriteInput(brake);
    const thicknessKeys = [
      'frontPadNominalThicknessMm',
      'rearPadNominalThicknessMm',
      'frontDiscNominalThicknessMm',
      'rearDiscNominalThicknessMm',
    ];
    return thicknessKeys.some((k) => normalized.data[k] != null);
  } catch {
    return false;
  }
}

export function isHvBatteryReferenceMaterializable(
  hv: VehicleOnboardingHvBatteryReferenceDraft | null | undefined,
): boolean {
  if (!hv) return false;
  return evaluateReferenceCapacityCreate(hv).ok;
}

function rawTechnicalJson(caseRow: VehicleOnboardingCase): Record<string, unknown> | null {
  const json = caseRow.draftTechnicalBaselineJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return json as Record<string, unknown>;
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
  const rawTireRef = raw?.tireReferenceSpec;
  const rawTireInstalled = raw?.tireInstalledConfig;
  const { tireReferenceSpec, tireInstalledConfig } = parsed.draft;
  const hasSection =
    rawTireRef != null || rawTireInstalled != null || tireReferenceSpec != null || tireInstalledConfig != null;
  if (!hasSection) return 'absent';
  if (rawTireInstalled != null && tireInstalledConfig == null) return 'invalid';
  if (rawTireRef != null && tireReferenceSpec != null && !isTireReferenceSpecMaterializable(tireReferenceSpec)) {
    return 'invalid';
  }
  if (tireInstalledConfig != null) {
    if (tireInstalledConfig.evidenceInstalled !== true) return 'invalid';
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
  if (raw?.brakeReference != null && parsed.draft.brakeReference == null) return 'invalid';
  if (parsed.draft.brakeReference == null) return 'absent';
  return isBrakeReferenceMaterializable(parsed.draft.brakeReference)
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
  if (raw?.hvBatteryReference != null && parsed.draft.hvBatteryReference == null) return 'invalid';
  if (parsed.draft.hvBatteryReference == null) return 'absent';
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
