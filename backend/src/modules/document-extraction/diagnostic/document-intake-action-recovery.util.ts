import { Prisma } from '@prisma/client';

export const ACTION_RECOVERY_META_KEY = '_actionRecoveryCount';
export const ACTION_RECOVERY_DEAD_LETTER_KEY = '_actionRecoveryDeadLetterAt';

export function readActionRecoveryCount(plausibility: unknown): number {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return 0;
  }
  const value = (plausibility as Record<string, unknown>)[ACTION_RECOVERY_META_KEY];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function readActionRecoveryDeadLetterAt(plausibility: unknown): string | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const value = (plausibility as Record<string, unknown>)[ACTION_RECOVERY_DEAD_LETTER_KEY];
  return typeof value === 'string' ? value : null;
}

export function withIncrementedActionRecoveryCount(plausibility: unknown): Prisma.InputJsonValue {
  const base =
    plausibility && typeof plausibility === 'object' && !Array.isArray(plausibility)
      ? { ...(plausibility as Record<string, unknown>) }
      : {};
  const next = readActionRecoveryCount(plausibility) + 1;
  return { ...base, [ACTION_RECOVERY_META_KEY]: next } as Prisma.InputJsonValue;
}

export function withActionRecoveryDeadLetter(plausibility: unknown): Prisma.InputJsonValue {
  const base =
    plausibility && typeof plausibility === 'object' && !Array.isArray(plausibility)
      ? { ...(plausibility as Record<string, unknown>) }
      : {};
  return {
    ...base,
    [ACTION_RECOVERY_DEAD_LETTER_KEY]: new Date().toISOString(),
  } as Prisma.InputJsonValue;
}
