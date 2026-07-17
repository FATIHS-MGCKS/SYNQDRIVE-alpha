import { BadRequestException } from '@nestjs/common';
import type { PlausibilityResult } from './document-extraction-plausibility.service';

/** Machine-readable BLOCKER codes from a fresh plausibility run. */
export function getPlausibilityBlockerCodes(
  result: PlausibilityResult | null | undefined,
): string[] {
  if (!result?.checks?.length) return [];
  return result.checks.filter((check) => check.status === 'BLOCKER').map((check) => check.code);
}

export function hasUnresolvedPlausibilityBlocker(
  result: PlausibilityResult | null | undefined,
): boolean {
  return result?.overallStatus === 'BLOCKER';
}

/** Server-side apply gate — no admin override path in V1. */
export function assertApplyNotBlockedByPlausibility(
  plausibility: PlausibilityResult,
): void {
  if (!hasUnresolvedPlausibilityBlocker(plausibility)) return;
  throw new BadRequestException({
    message: 'Apply blocked by unresolved plausibility BLOCKER',
    plausibilityBlockers: getPlausibilityBlockerCodes(plausibility),
    plausibility,
  });
}
