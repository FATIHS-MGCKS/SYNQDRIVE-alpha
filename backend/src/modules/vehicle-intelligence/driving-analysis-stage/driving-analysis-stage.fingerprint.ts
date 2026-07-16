import { createHash } from 'crypto';
import type { DrivingAnalysisStageKey } from '@prisma/client';
import { assertIdentityHasNoSecrets } from '../driving-analysis-run/driving-analysis-run.fingerprint';
import type { StageFingerprintContext } from './driving-analysis-stage.types';

function normalizePart(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  return String(value).trim();
}

/** Stage-specific stable input tags — no secrets, no raw payloads. */
function stageInputTags(ctx: StageFingerprintContext): string[] {
  const base = [`stage:${ctx.stageKey}`, ...(ctx.inputTags ?? [])];

  switch (ctx.stageKey) {
    case 'SEGMENT_VALIDATE':
      return [...base, `waypoints:${normalizePart(ctx.waypointCount)}`];
    case 'NATIVE_EVENTS':
    case 'EVENT_CONTEXT':
    case 'DRIVING_IMPACT':
    case 'MISUSE_RECONCILE':
      return [
        ...base,
        `nativeEvents:${normalizePart(ctx.nativeEventCount)}`,
        `behavior:${normalizePart(ctx.behaviorEnrichmentStatus)}`,
      ];
    case 'ROUTE':
      return [
        ...base,
        `waypoints:${normalizePart(ctx.waypointCount)}`,
        `route:${normalizePart(ctx.routeEnrichmentStatus)}`,
      ];
    case 'ASSESSABILITY':
    case 'ATTRIBUTION':
    case 'DECISION_SUMMARY':
    case 'HEALTH_IMPACT_PUBLISH':
      return [...base, `behavior:${normalizePart(ctx.behaviorEnrichmentStatus)}`];
    default:
      return base;
  }
}

/**
 * Deterministic per-stage SHA-256 fingerprint.
 * Same stage + same fingerprint + same model version → skip recompute.
 */
export function buildStageInputFingerprint(ctx: StageFingerprintContext): string {
  assertIdentityHasNoSecrets({
    organizationId: ctx.organizationId,
    tripId: ctx.tripId,
    vehicleId: ctx.vehicleId,
    analysisType: 'TRIP_ENRICHMENT',
    capabilityVersion: ctx.capabilityVersion,
    inputTags: stageInputTags(ctx),
  });

  const parts = [
    ctx.organizationId,
    ctx.tripId,
    ctx.vehicleId,
    ctx.stageKey,
    ctx.modelVersion,
    normalizePart(ctx.tripEndTimeIso),
    ctx.capabilityVersion,
    ...stageInputTags(ctx).map((tag) => normalizePart(tag)).sort(),
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function requiresStageRecompute(
  existing: { modelVersion: string; inputFingerprint: string } | null,
  next: { modelVersion: string; inputFingerprint: string },
  recomputeStageKeys?: DrivingAnalysisStageKey[],
  stageKey?: DrivingAnalysisStageKey,
): boolean {
  if (!existing) return true;
  if (existing.modelVersion !== next.modelVersion) {
    if (recomputeStageKeys && stageKey) {
      return recomputeStageKeys.includes(stageKey);
    }
    return true;
  }
  return existing.inputFingerprint !== next.inputFingerprint;
}
