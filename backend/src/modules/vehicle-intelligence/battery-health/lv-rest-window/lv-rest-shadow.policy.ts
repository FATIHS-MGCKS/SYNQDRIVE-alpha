import type { BatteryMeasurementQuality } from '@prisma/client';
import { isBatteryV2RestShadowEnabled } from '@config/battery-health-v2.config';

export const LV_REST_SHADOW_CONTEXT_MARKER = 'shadowMode' as const;

export function isLvRestShadowModeActive(): boolean {
  return isBatteryV2RestShadowEnabled();
}

export function withLvRestShadowContext<T extends Record<string, unknown>>(
  context: T,
): T & { shadowMode: true } {
  return {
    ...context,
    shadowMode: true,
  };
}

export function isLvRestShadowMeasurementContext(
  context: unknown,
): context is { shadowMode: true } {
  return (
    typeof context === 'object' &&
    context !== null &&
    (context as { shadowMode?: unknown }).shadowMode === true
  );
}

/** Shadow measurements never feed canonical health, rental readiness, alerts, or tasks. */
export function resolveLvRestShadowEvidenceEligible(
  qualityEvidenceEligible: boolean,
): boolean {
  if (isLvRestShadowModeActive()) {
    return false;
  }
  return qualityEvidenceEligible;
}

export function resolveLvRestShadowPublicationEligible(): false {
  return false;
}

export function isLvRestShadowProminentHealthEligible(): false {
  return false;
}

export const LV_REST_SHADOW_BLOCKED_SIDE_EFFECTS = [
  'battery_publication',
  'rental_readiness',
  'alert',
  'task',
  'prominent_health_percent',
] as const;

export type LvRestShadowBlockedSideEffect =
  (typeof LV_REST_SHADOW_BLOCKED_SIDE_EFFECTS)[number];

export function isLvRestShadowContaminationQuality(
  quality: BatteryMeasurementQuality,
): boolean {
  return quality.startsWith('CONTAMINATED_BY_');
}
