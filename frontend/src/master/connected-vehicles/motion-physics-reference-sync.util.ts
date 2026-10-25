export type MotionPhysicsEvidenceTierUi = 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED' | '' | null;

export type MotionPhysicsPendingCreateSource = 'MISTRAL_AI' | null;

/** How vehicle AI specs were applied to the form (reference auto-create eligibility). */
export type AiSpecsApplyProvenance = 'mistral_live' | 'local_fallback';

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

/**
 * After AI apply: only successful live Mistral may queue MISTRAL_AI auto-reference.
 * Local fallback, mixed pre-existing + AI, or post-apply manual edits → no auto provenance.
 */
export function resolveMotionPhysicsPendingAfterAiApply(input: {
  provenance: AiSpecsApplyProvenance;
  appliedMotionFromAi: boolean;
  motionFieldsHadValuesBeforeApply: boolean;
  manualEditedAfterApply: boolean;
}): MotionPhysicsPendingCreateSource {
  if (!input.appliedMotionFromAi) return null;
  if (input.provenance !== 'mistral_live') return null;
  if (input.motionFieldsHadValuesBeforeApply) return null;
  if (input.manualEditedAfterApply) return null;
  return 'MISTRAL_AI';
}

/** Routine vehicle edit must not create or upgrade motion references without eligible live Mistral apply. */
export function shouldSyncMotionPhysicsReferenceOnSave(input: {
  evidenceTier: MotionPhysicsEvidenceTierUi;
  referenceId: string | null;
  pendingCreateSource: MotionPhysicsPendingCreateSource;
  hasMotionValues: boolean;
  manualMotionEdited: boolean;
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
  if (input.manualMotionEdited) {
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

export type MotionPhysicsFormSnapshot = {
  curbWeight: string;
  systemMotorPowerKw: string;
  accel0To100S: string;
  variantAssumption: string;
  systemPowerDefinition: string;
};

export function snapshotMotionPhysicsFormFields(input: MotionPhysicsFormSnapshot): MotionPhysicsFormSnapshot {
  return { ...input };
}

export function normalizeMotionPhysicsFormSnapshot(
  input: MotionPhysicsFormSnapshot,
): MotionPhysicsFormSnapshot {
  return {
    curbWeight: input.curbWeight.trim(),
    systemMotorPowerKw: input.systemMotorPowerKw.trim(),
    accel0To100S: input.accel0To100S.trim(),
    variantAssumption: input.variantAssumption.trim(),
    systemPowerDefinition: input.systemPowerDefinition.trim(),
  };
}

export function motionPhysicsFormMatchesSnapshot(
  current: MotionPhysicsFormSnapshot,
  baseline: MotionPhysicsFormSnapshot | null,
): boolean {
  if (!baseline) return true;
  const a = normalizeMotionPhysicsFormSnapshot(current);
  const b = normalizeMotionPhysicsFormSnapshot(baseline);
  return (
    a.curbWeight === b.curbWeight &&
    a.systemMotorPowerKw === b.systemMotorPowerKw &&
    a.accel0To100S === b.accel0To100S &&
    a.variantAssumption === b.variantAssumption &&
    a.systemPowerDefinition === b.systemPowerDefinition
  );
}

/** ESTIMATED reference loaded in form — form diverges from stored reference row. */
export function hasUnconfirmedManualMotionPhysicsEdits(input: {
  evidenceTier: MotionPhysicsEvidenceTierUi;
  referenceId: string | null;
  loadedReferenceBaseline: MotionPhysicsFormSnapshot | null;
  currentForm: MotionPhysicsFormSnapshot;
}): boolean {
  if (!input.referenceId || input.evidenceTier !== 'ESTIMATED') return false;
  if (!input.loadedReferenceBaseline) return false;
  return !motionPhysicsFormMatchesSnapshot(input.currentForm, input.loadedReferenceBaseline);
}

/** Confirm AI estimate only when form still matches the loaded ESTIMATED reference (no silent stale confirm). */
export function canConfirmEstimatedAiMotionReference(input: {
  evidenceTier: MotionPhysicsEvidenceTierUi;
  referenceId: string | null;
  loadedReferenceBaseline: MotionPhysicsFormSnapshot | null;
  currentForm: MotionPhysicsFormSnapshot;
}): boolean {
  if (!input.referenceId || input.evidenceTier !== 'ESTIMATED') return false;
  if (!input.loadedReferenceBaseline) return false;
  return motionPhysicsFormMatchesSnapshot(input.currentForm, input.loadedReferenceBaseline);
}

export function snapshotMotionPhysicsFromActiveReference(ref: {
  curbMassKg?: number | null;
  systemMotorPowerKw?: number | null;
  accel0To100S?: number | null;
  variantAssumption?: string | null;
  systemPowerDefinition?: string | null;
}): MotionPhysicsFormSnapshot {
  return snapshotMotionPhysicsFormFields({
    curbWeight: ref.curbMassKg != null ? String(ref.curbMassKg) : '',
    systemMotorPowerKw: ref.systemMotorPowerKw != null ? String(ref.systemMotorPowerKw) : '',
    accel0To100S: ref.accel0To100S != null ? String(ref.accel0To100S) : '',
    variantAssumption: ref.variantAssumption ?? '',
    systemPowerDefinition: ref.systemPowerDefinition?.trim() ?? '',
  });
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
