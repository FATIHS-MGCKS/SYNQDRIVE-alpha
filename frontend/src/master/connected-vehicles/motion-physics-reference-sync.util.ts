export type MotionPhysicsEvidenceTierUi = 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED' | '' | null;

export type MotionPhysicsPendingCreateSource = 'MISTRAL_AI' | null;

/** Canonical stored values for systemPowerDefinition (matches backend semantics). */
export const MOTION_SYSTEM_POWER_DEFINITION_OPTIONS = [
  'OEM_RATED_MOTOR_KW',
  'OEM_RATED_SYSTEM_KW',
  'OEM_RATED_SYSTEM_KW_ESTIMATED',
] as const;

export type MotionSystemPowerDefinitionOption = (typeof MOTION_SYSTEM_POWER_DEFINITION_OPTIONS)[number];

export function hasMotionPhysicsFormValues(input: {
  curbWeight: string;
  systemMotorPowerKw: string;
  accel0To100S: string;
  variantAssumption?: string;
  systemPowerDefinition?: string;
}): boolean {
  const curb = input.curbWeight.trim();
  const power = input.systemMotorPowerKw.trim();
  const accel = input.accel0To100S.trim();
  const variant = input.variantAssumption?.trim() ?? '';
  const definition = input.systemPowerDefinition?.trim() ?? '';
  return Boolean(curb || power || accel || variant || definition);
}

export function isMotionPhysicsReferenceReadOnly(
  tier: MotionPhysicsEvidenceTierUi,
): boolean {
  return tier === 'VERIFIED';
}

export function canConfirmManualMotionValues(tier: MotionPhysicsEvidenceTierUi): boolean {
  return tier !== 'VERIFIED';
}

/** Routine vehicle edit must not create or upgrade motion references without an explicit AI apply in-session. */
export function shouldSyncMotionPhysicsReferenceOnSave(input: {
  evidenceTier: MotionPhysicsEvidenceTierUi;
  referenceId: string | null;
  pendingCreateSource: MotionPhysicsPendingCreateSource;
  hasMotionValues: boolean;
}): boolean {
  if (input.evidenceTier === 'VERIFIED' || input.evidenceTier === 'CONFIRMED') {
    return false;
  }
  if (input.referenceId && input.evidenceTier === 'ESTIMATED') {
    return false;
  }
  if (input.pendingCreateSource !== 'MISTRAL_AI') {
    return false;
  }
  return input.hasMotionValues;
}

export function motionPhysicsReferenceSourceForSave(
  pendingCreateSource: MotionPhysicsPendingCreateSource,
): 'MISTRAL_AI' | null {
  return pendingCreateSource === 'MISTRAL_AI' ? 'MISTRAL_AI' : null;
}

export function parseMotionPhysicsNumericField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function buildMotionPhysicsReferenceCreateBody(input: {
  curbWeight: string;
  systemMotorPowerKw: string;
  accel0To100S: string;
  variantAssumption: string;
  systemPowerDefinition: string;
  source: 'MISTRAL_AI' | 'MANUAL_ENTRY';
  manualOperatorConfirm?: boolean;
}) {
  return {
    curbMassKg: parseMotionPhysicsNumericField(input.curbWeight),
    systemMotorPowerKw: parseMotionPhysicsNumericField(input.systemMotorPowerKw),
    accel0To100S: parseMotionPhysicsNumericField(input.accel0To100S),
    variantAssumption: input.variantAssumption.trim() || null,
    systemPowerDefinition: input.systemPowerDefinition.trim() || null,
    source: input.source,
    manualOperatorConfirm: input.manualOperatorConfirm === true ? true : undefined,
  };
}
