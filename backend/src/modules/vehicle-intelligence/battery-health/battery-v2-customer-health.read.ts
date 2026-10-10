import { BatteryEvidenceScope, type BatteryFeatures, type SohPublicationState } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { selectBestBatterySpec } from './battery-status';
import type { LegacyPublicationSafetyResult } from './battery-legacy-publication-safety';
import { resolveBatteryV2UserFacingSohPct } from './battery-v2-user-facing-lv.policy';
import { presentLegacyCrankFeatures } from './battery-crank-policy';

export interface BatteryV2CrankDiagnosticFields {
  vPreCrank: number | null;
  vMinCrank: number | null;
  crankDrop: number | null;
  vRecovery5s: number | null;
  vRecovery30s: number | null;
  crankAt: Date | null;
  crankTripId: string | null;
}

export interface BatteryV2RestFeatureFields {
  vOff60m: number | null;
  vOff6h: number | null;
  deltaVRest: number | null;
  restWindowStartedAt: Date | null;
  rest60mCapturedAt: Date | null;
  rest6hCapturedAt: Date | null;
}

/** Customer-safe V2 health read model — no raw legacy SOH publication fields. */
export interface BatteryV2CustomerHealthReadModel {
  vehicleId: string;
  userFacingSohPct: number | null;
  estimatedSocPct: number | null;
  estimatedLvHealthScore: number | null;
  confidence: string;
  badge: string;
  scoredAt: Date | null;
  publicationState: SohPublicationState | string;
  maturityConfidence: string | null;
  signalConfidence: string;
  legacyPublicationSafety: LegacyPublicationSafetyResult;
  restFeatures: BatteryV2RestFeatureFields;
  crank: BatteryV2CrankDiagnosticFields;
}

export async function buildBatteryV2CustomerHealthReadModel(
  prisma: PrismaService,
  features: BatteryFeatures,
): Promise<BatteryV2CustomerHealthReadModel> {
  const [specs, lvEvidenceRecent] = await Promise.all([
    prisma.vehicleBatterySpec.findMany({ where: { vehicleId: features.vehicleId } }),
    prisma.batteryEvidence.findMany({
      where: {
        vehicleId: features.vehicleId,
        scope: BatteryEvidenceScope.LV,
      },
      orderBy: { observedAt: 'desc' },
      take: 25,
      select: { valueType: true, sourceType: true },
    }),
  ]);

  const batteryTypeRaw = selectBestBatterySpec(specs)?.batteryType ?? null;

  const { userFacingSohPct, legacyPublicationSafety } = resolveBatteryV2UserFacingSohPct(
    features.publishedSohPct,
    {
      publicationState: features.publicationState,
      publishedSohPct: features.publishedSohPct,
      maturityConfidence: features.maturityConfidence,
      vOff60m: features.vOff60m,
      vOff6h: features.vOff6h,
      rest60mCapturedAt: features.rest60mCapturedAt,
      rest6hCapturedAt: features.rest6hCapturedAt,
      crankDrop: features.crankDrop,
      crankObservationCount: features.crankObservationCount,
      crankAt: features.crankAt,
      scoredAt: features.scoredAt,
      lastPublishedAt: features.lastPublishedAt,
      batteryTypeRaw,
      lvEvidenceRecent,
    },
  );

  const customerBadge =
    userFacingSohPct == null ? 'unknown' : features.badge ?? 'unknown';

  return {
    vehicleId: features.vehicleId,
    userFacingSohPct,
    estimatedSocPct: features.estimatedSocPct,
    estimatedLvHealthScore: userFacingSohPct,
    confidence: features.confidence ?? 'insufficient_data',
    badge: customerBadge,
    scoredAt: features.scoredAt,
    publicationState: features.publicationState,
    maturityConfidence: features.maturityConfidence,
    signalConfidence: features.confidence ?? 'insufficient_data',
    legacyPublicationSafety,
    restFeatures: {
      vOff60m: features.vOff60m,
      vOff6h: features.vOff6h,
      deltaVRest: features.deltaVRest,
      restWindowStartedAt: features.restWindowStartedAt,
      rest60mCapturedAt: features.rest60mCapturedAt,
      rest6hCapturedAt: features.rest6hCapturedAt,
    },
    crank: {
      vPreCrank: features.vPreCrank,
      vMinCrank: features.vMinCrank,
      crankDrop: features.crankDrop,
      vRecovery5s: features.vRecovery5s,
      vRecovery30s: features.vRecovery30s,
      crankAt: features.crankAt,
      crankTripId: features.crankTripId,
    },
  };
}

/** Maps the customer read model to rental API payloads (no raw legacy SOH fields). */
export function presentBatteryV2CustomerHealthPayload(
  model: BatteryV2CustomerHealthReadModel,
) {
  const crankFeatures = presentLegacyCrankFeatures(model.crank);
  return {
    estimatedSocPct: model.estimatedSocPct,
    /** @deprecated Prefer estimatedLvHealthScore — gated customer LV score, not HV SOH */
    estimatedSohPct: model.userFacingSohPct,
    estimatedLvHealthScore: model.userFacingSohPct,
    userFacingSohPct: model.userFacingSohPct,
    confidence: model.confidence,
    badge: model.badge,
    scoredAt: model.scoredAt,
    publicationState: model.publicationState,
    maturityConfidence: model.maturityConfidence,
    signalConfidence: model.signalConfidence,
    legacyPublicationSafety: model.legacyPublicationSafety,
    restFeatures: model.restFeatures,
    crankFeatures,
  };
}
