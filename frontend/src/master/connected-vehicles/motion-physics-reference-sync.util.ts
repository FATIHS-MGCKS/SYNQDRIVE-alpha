export type MotionPhysicsEvidenceTierUi = 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED' | '' | null;

export type MotionPhysicsPendingCreateSource = 'MISTRAL_AI' | null;

export function hasMotionPhysicsFormValues(input: {
  curbWeight: string;
  systemMotorPowerKw: string;
  accel0To100S: string;
}): boolean {
  const curb = input.curbWeight.trim();
  const power = input.systemMotorPowerKw.trim();
  const accel = input.accel0To100S.trim();
  return Boolean(curb || power || accel);
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
