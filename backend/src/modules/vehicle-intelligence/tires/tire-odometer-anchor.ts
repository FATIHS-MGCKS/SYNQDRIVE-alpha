import {
  TireOdometerAnchorSource,
  TireOdometerAnchorStatus,
} from '@prisma/client';

/** Maximum km drop tolerated vs last known odometer before flagging rollback. */
export const ODOMETER_ROLLBACK_TOLERANCE_KM = 50;

/** Maximum single-step odometer increase without documented confirmation. */
export const ODOMETER_UNREALISTIC_JUMP_KM = 10_000;

export type OdometerPlausibilityIssue = 'ROLLBACK' | 'UNREALISTIC_JUMP';

export interface VehicleOdometerContext {
  latestState: {
    odometerKm: number | null;
    providerSource: string | null;
    providerFetchedAt: Date | null;
    sourceTimestamp: Date | null;
    lastSeenAt: Date | null;
    source: string | null;
  } | null;
  vehicleMileageKm: number | null;
  lastKnownOdometerKm: number | null;
}

export interface ResolveOdometerAnchorInput {
  clientOdometerKm?: number | null;
  /** Client value is only accepted when explicitly confirmed. */
  manualConfirmed?: boolean;
  documentEvidenceId?: string | null;
  context: VehicleOdometerContext;
}

export interface ResolvedOdometerAnchor {
  odometerKm: number | null;
  source: TireOdometerAnchorSource;
  capturedAt: Date;
  evidenceId: string | null;
  status: TireOdometerAnchorStatus;
  confidence: number;
  plausibilityIssue: OdometerPlausibilityIssue | null;
  /** True when a client value was supplied but ignored (API manipulation guard). */
  clientValueIgnored: boolean;
}

export function toFiniteOdometerKm(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10) / 10;
}

export function mapProviderToAnchorSource(
  providerSource: string | null | undefined,
  fallbackSource?: string | null,
): TireOdometerAnchorSource | null {
  for (const raw of [providerSource, fallbackSource]) {
    const key = String(raw ?? '').trim().toUpperCase();
    if (!key) continue;
    if (key.includes('HIGH_MOBILITY') || key === 'HM') {
      return TireOdometerAnchorSource.PROVIDER_HIGH_MOBILITY;
    }
    if (key.includes('DIMO')) {
      return TireOdometerAnchorSource.PROVIDER_DIMO;
    }
  }
  return null;
}

export function assessOdometerPlausibility(
  candidateKm: number,
  lastKnownKm: number | null | undefined,
): { plausible: boolean; issue: OdometerPlausibilityIssue | null } {
  if (lastKnownKm == null || !Number.isFinite(lastKnownKm)) {
    return { plausible: true, issue: null };
  }
  if (candidateKm < lastKnownKm - ODOMETER_ROLLBACK_TOLERANCE_KM) {
    return { plausible: false, issue: 'ROLLBACK' };
  }
  if (candidateKm > lastKnownKm + ODOMETER_UNREALISTIC_JUMP_KM) {
    return { plausible: false, issue: 'UNREALISTIC_JUMP' };
  }
  return { plausible: true, issue: null };
}

const BASE_CONFIDENCE_BY_SOURCE: Record<TireOdometerAnchorSource, number> = {
  [TireOdometerAnchorSource.PROVIDER_DIMO]: 92,
  [TireOdometerAnchorSource.PROVIDER_HIGH_MOBILITY]: 90,
  [TireOdometerAnchorSource.MANUAL_CONFIRMED]: 85,
  [TireOdometerAnchorSource.DOCUMENTED]: 78,
  [TireOdometerAnchorSource.VEHICLE_LATEST_STATE]: 68,
  [TireOdometerAnchorSource.HISTORICAL_INFERRED]: 38,
  [TireOdometerAnchorSource.UNKNOWN]: 12,
};

export function deriveOdometerAnchorConfidence(
  source: TireOdometerAnchorSource,
  plausibilityIssue: OdometerPlausibilityIssue | null,
): number {
  let score = BASE_CONFIDENCE_BY_SOURCE[source] ?? 12;
  if (plausibilityIssue === 'ROLLBACK') score = Math.min(score, 25);
  if (plausibilityIssue === 'UNREALISTIC_JUMP') score = Math.min(score, 30);
  return Math.max(0, Math.min(100, score));
}

export function deriveOdometerAnchorStatus(
  odometerKm: number | null,
  plausibilityIssue: OdometerPlausibilityIssue | null,
): TireOdometerAnchorStatus {
  if (odometerKm == null) return TireOdometerAnchorStatus.ANCHOR_REQUIRED;
  if (plausibilityIssue != null) return TireOdometerAnchorStatus.MEASUREMENT_REQUIRED;
  return TireOdometerAnchorStatus.ANCHORED;
}

export function isPredictionCapable(
  status: TireOdometerAnchorStatus | null | undefined,
): boolean {
  return status === TireOdometerAnchorStatus.ANCHORED;
}

const RUNTIME_TELEMETRY_AUTO_ANCHOR_SOURCES = new Set<TireOdometerAnchorSource>([
  TireOdometerAnchorSource.PROVIDER_DIMO,
  TireOdometerAnchorSource.PROVIDER_HIGH_MOBILITY,
  TireOdometerAnchorSource.VEHICLE_LATEST_STATE,
]);

/** Whether recalculate may persist a missing install anchor from live telemetry. */
export function isRuntimeTelemetryAutoAnchorEligible(
  anchor: ResolvedOdometerAnchor,
): boolean {
  return (
    anchor.odometerKm != null &&
    anchor.status === TireOdometerAnchorStatus.ANCHORED &&
    RUNTIME_TELEMETRY_AUTO_ANCHOR_SOURCES.has(anchor.source)
  );
}

export function resolveOdometerAnchor(
  input: ResolveOdometerAnchorInput,
): ResolvedOdometerAnchor {
  const capturedAt = new Date();
  const ctx = input.context;
  const lastKnown = toFiniteOdometerKm(ctx.lastKnownOdometerKm);

  const clientKm = toFiniteOdometerKm(input.clientOdometerKm);
  const clientAccepted =
    clientKm != null && input.manualConfirmed === true;
  const clientValueIgnored = clientKm != null && !clientAccepted;

  const latestOdo = toFiniteOdometerKm(ctx.latestState?.odometerKm);
  const providerSource = mapProviderToAnchorSource(
    ctx.latestState?.providerSource,
    ctx.latestState?.source,
  );

  let odometerKm: number | null = null;
  let source: TireOdometerAnchorSource = TireOdometerAnchorSource.UNKNOWN;
  let evidenceId: string | null = input.documentEvidenceId ?? null;

  if (clientAccepted) {
    odometerKm = clientKm;
    source = TireOdometerAnchorSource.MANUAL_CONFIRMED;
  } else if (latestOdo != null && providerSource != null) {
    odometerKm = latestOdo;
    source = providerSource;
  } else if (latestOdo != null) {
    odometerKm = latestOdo;
    source = TireOdometerAnchorSource.VEHICLE_LATEST_STATE;
  } else {
    const mileageKm = toFiniteOdometerKm(ctx.vehicleMileageKm);
    if (mileageKm != null) {
      odometerKm = mileageKm;
      source = TireOdometerAnchorSource.HISTORICAL_INFERRED;
    }
  }

  if (input.documentEvidenceId && source === TireOdometerAnchorSource.MANUAL_CONFIRMED) {
    source = TireOdometerAnchorSource.DOCUMENTED;
    evidenceId = input.documentEvidenceId;
  }

  const plausibility =
    odometerKm != null
      ? assessOdometerPlausibility(odometerKm, lastKnown)
      : { plausible: true, issue: null as OdometerPlausibilityIssue | null };

  const status = deriveOdometerAnchorStatus(odometerKm, plausibility.issue);
  const confidence = deriveOdometerAnchorConfidence(source, plausibility.issue);

  return {
    odometerKm,
    source,
    capturedAt,
    evidenceId,
    status,
    confidence,
    plausibilityIssue: plausibility.issue,
    clientValueIgnored,
  };
}

export function buildSetupOdometerAnchorFields(anchor: ResolvedOdometerAnchor) {
  return {
    installedOdometerKm: anchor.odometerKm,
    installedOdometerSource: anchor.source,
    installedOdometerCapturedAt: anchor.capturedAt,
    installedOdometerEvidenceId: anchor.evidenceId,
    odometerAnchorStatus: anchor.status,
    odometerAnchorConfidence: anchor.confidence,
  };
}

export function buildMountPeriodCreateData(args: {
  organizationId: string | null;
  tireSetupId: string;
  installedAt: Date;
  anchor: ResolvedOdometerAnchor;
}) {
  return {
    organizationId: args.organizationId,
    tireSetupId: args.tireSetupId,
    installedAt: args.installedAt,
    ...buildSetupOdometerAnchorFields(args.anchor),
  };
}

export function applyAnchorToRemainingKmProjection(args: {
  anchorStatus: TireOdometerAnchorStatus | null | undefined;
  adjustedRemainingKm: number;
  confidenceScore: number;
}): {
  adjustedRemainingKm: number | null;
  confidenceScore: number;
  predictionCapable: boolean;
  warnings: string[];
} {
  if (!isPredictionCapable(args.anchorStatus)) {
    const warnings: string[] = [];
    if (args.anchorStatus === TireOdometerAnchorStatus.ANCHOR_REQUIRED) {
      warnings.push(
        'No traceable odometer anchor — remaining km projection withheld.',
      );
    } else if (args.anchorStatus === TireOdometerAnchorStatus.MEASUREMENT_REQUIRED) {
      warnings.push(
        'Odometer anchor requires validation — record a tread measurement before trusting remaining km.',
      );
    }
    return {
      adjustedRemainingKm: null,
      confidenceScore: Math.min(args.confidenceScore, 45),
      predictionCapable: false,
      warnings,
    };
  }
  return {
    adjustedRemainingKm: args.adjustedRemainingKm,
    confidenceScore: args.confidenceScore,
    predictionCapable: true,
    warnings: [],
  };
}
