/** Returns true when an AI/Mistral spec value may replace the current form field. */
export function shouldApplyAiSpecToEmptyField(currentValue: string, incoming: unknown): boolean {
  if (incoming == null) return false;
  return currentValue.trim() === '';
}

export function isMotionPhysicsTierLockedForAiMerge(
  tier: 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED' | '' | null | undefined,
): boolean {
  return tier === 'CONFIRMED' || tier === 'VERIFIED';
}
