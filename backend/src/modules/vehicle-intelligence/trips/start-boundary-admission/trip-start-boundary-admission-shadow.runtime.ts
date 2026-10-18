import type { Logger } from '@nestjs/common';
import type { DimoSegmentsService, RoutePoint } from '../../../dimo/dimo-segments.service';
import type { DimoProviderRequestContext } from '../../../dimo/provider/dimo-provider-gateway.types';
import type { TripMetricsService } from '../../../observability/trip-metrics.service';
import { compareStartBoundaryAdmissionShadow } from './trip-start-boundary-admission.shadow';
import type { TripStartIntegrationModality } from './trip-start-boundary-admission.types';
import type { StartBoundaryEvidenceContext } from './trip-start-boundary-legacy-resolution';
import type { TripCoreDataPoint } from '../../../dimo/dimo-segments.service';
import {
  isTripStartBoundaryAdmissionShadowEnabledForVehicle,
  isTripStartBoundaryAdmissionShadowRouteFetchEnabled,
} from './trip-start-boundary-admission-shadow.config';
import { normalizeSegmentDetectionMechanism } from './trip-start-boundary-admission.types';

export type ShadowStartBoundaryAdmissionSummary = {
  vehicleId: string;
  dimoTokenId: number;
  integrationModality: TripStartIntegrationModality;
  providerSegmentId: string | null;
  providerSegmentDetectionMechanism: string | null;
  candidateStartAt: string;
  legacyCanonicalStartAt: string;
  proposedCanonicalStartAt: string;
  shadowProposedStartAt: string;
  shadowDeltaMs: number;
  shadowDecision: string;
  deltaMs: number;
  decision: string;
  movementEvidenceSources: string[];
  movementEvidenceCoverage: string;
  routeEvidenceAvailable: boolean;
  additionalShadowRouteFetchPerformed: boolean;
  legacyRouteFetchPerformed: boolean;
  uncorroboratedPrefixFromAt: string | null;
  uncorroboratedPrefixToAt: string | null;
  shadowExecutionFailure: string | null;
  observedAt: string;
};

export type RunStartBoundaryAdmissionShadowParams = {
  vehicleId: string;
  dimoTokenId: number;
  organizationId?: string | null;
  candidateStartAt: Date;
  confirmedAt: Date;
  corePoints: TripCoreDataPoint[];
  profile: string;
  integrationModality: TripStartIntegrationModality;
  legacy: {
    startAt: Date;
    source: string;
    dimoSegmentId: string | null;
  };
  evidence: StartBoundaryEvidenceContext;
  segments: DimoSegmentsService;
  providerContext: DimoProviderRequestContext;
  tripMetrics?: TripMetricsService | null;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
};

function recordShadowMetrics(
  tripMetrics: TripMetricsService | null | undefined,
  labels: {
    integrationModality: TripStartIntegrationModality;
    decision: string;
    legacySource: string;
    evidenceCoverage: string;
  },
  deltaMs: number,
): void {
  if (!tripMetrics) return;
  tripMetrics.tripStartBoundaryAdmissionShadowComparisons.inc({
    integration_modality: labels.integrationModality,
    decision: labels.decision,
    legacy_source: labels.legacySource,
    evidence_coverage: labels.evidenceCoverage,
  });
  tripMetrics.tripStartBoundaryAdmissionShadowDeltaSeconds.observe(
    {
      integration_modality: labels.integrationModality,
      decision: labels.decision,
      legacy_source: labels.legacySource,
    },
    Math.abs(deltaMs) / 1000,
  );
}

export async function runStartBoundaryAdmissionShadow(
  params: RunStartBoundaryAdmissionShadowParams,
): Promise<ShadowStartBoundaryAdmissionSummary | null> {
  const env = params.env ?? process.env;
  if (!isTripStartBoundaryAdmissionShadowEnabledForVehicle(params.vehicleId, env)) {
    return null;
  }

  try {
    let routePoints: RoutePoint[] = params.evidence.routePoints;
    let additionalShadowRouteFetchPerformed = false;

    if (
      params.evidence.matchingSegment &&
      routePoints.length === 0 &&
      isTripStartBoundaryAdmissionShadowRouteFetchEnabled(env)
    ) {
      params.tripMetrics?.tripStartBoundaryAdmissionShadowRouteFetchAttempts?.inc();
      try {
        routePoints = await params.segments.fetchRouteEnrichment(
          params.dimoTokenId,
          params.evidence.boundaryWindowFrom,
          params.confirmedAt,
          params.providerContext,
        );
        additionalShadowRouteFetchPerformed = true;
      } catch (fetchErr) {
        params.tripMetrics?.tripStartBoundaryAdmissionShadowRouteFetchErrors?.inc();
        throw fetchErr;
      }
    }

    const comparison = compareStartBoundaryAdmissionShadow({
      candidateStartAt: params.candidateStartAt,
      confirmedAt: params.confirmedAt,
      segments: params.evidence.segments,
      corePoints: params.corePoints,
      routePoints,
      profile: params.profile,
      integrationModality: params.integrationModality,
      segmentDetectionMechanismIndependentlyProven: false,
    });

    const proposed = comparison.proposedCanonicalStartAt;
    const mechanism = params.evidence.matchingSegment?.mechanism ?? null;

    const summary: ShadowStartBoundaryAdmissionSummary = {
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      integrationModality: params.integrationModality,
      providerSegmentId: params.evidence.matchingSegment?.segmentId ?? null,
      providerSegmentDetectionMechanism: mechanism
        ? normalizeSegmentDetectionMechanism(mechanism)
        : null,
      candidateStartAt: params.candidateStartAt.toISOString(),
      legacyCanonicalStartAt: params.legacy.startAt.toISOString(),
      proposedCanonicalStartAt: proposed.toISOString(),
      shadowProposedStartAt: proposed.toISOString(),
      shadowDeltaMs: comparison.deltaMs,
      shadowDecision: comparison.decision,
      deltaMs: comparison.deltaMs,
      decision: comparison.decision,
      movementEvidenceSources: comparison.evidenceSources,
      movementEvidenceCoverage: comparison.movementEvidenceCoverage,
      routeEvidenceAvailable: routePoints.length > 0,
      additionalShadowRouteFetchPerformed,
      legacyRouteFetchPerformed: params.evidence.legacyRouteFetchPerformed,
      uncorroboratedPrefixFromAt:
        comparison.uncertainty.uncorroboratedPrefixFromAt?.toISOString() ?? null,
      uncorroboratedPrefixToAt:
        comparison.uncertainty.uncorroboratedPrefixToAt?.toISOString() ?? null,
      shadowExecutionFailure: null,
      observedAt: new Date().toISOString(),
    };

    recordShadowMetrics(
      params.tripMetrics,
      {
        integrationModality: params.integrationModality,
        decision: comparison.decision,
        legacySource: params.legacy.source,
        evidenceCoverage: summary.movementEvidenceCoverage,
      },
      comparison.deltaMs,
    );

    return summary;
  } catch (err) {
    params.tripMetrics?.tripStartBoundaryAdmissionShadowErrors?.inc({
      phase: 'start_confirmation',
    });
    params.logger?.warn(
      `Start boundary admission shadow failed (non-blocking): vehicle=${params.vehicleId} ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      integrationModality: params.integrationModality,
      providerSegmentId: params.evidence.matchingSegment?.segmentId ?? null,
      providerSegmentDetectionMechanism: null,
      candidateStartAt: params.candidateStartAt.toISOString(),
      legacyCanonicalStartAt: params.legacy.startAt.toISOString(),
      proposedCanonicalStartAt: params.legacy.startAt.toISOString(),
      shadowProposedStartAt: params.legacy.startAt.toISOString(),
      shadowDeltaMs: 0,
      shadowDecision: 'SHADOW_EXECUTION_FAILED',
      deltaMs: 0,
      decision: 'SHADOW_EXECUTION_FAILED',
      movementEvidenceSources: [],
      movementEvidenceCoverage: 'UNKNOWN',
      routeEvidenceAvailable: false,
      additionalShadowRouteFetchPerformed: false,
      legacyRouteFetchPerformed: params.evidence.legacyRouteFetchPerformed,
      uncorroboratedPrefixFromAt: null,
      uncorroboratedPrefixToAt: null,
      shadowExecutionFailure:
        err instanceof Error ? err.message : String(err),
      observedAt: new Date().toISOString(),
    };
  }
}

export function mergeShadowStartBoundaryIntoEvidenceSummary<
  T extends Record<string, unknown>,
>(summary: T, shadow: ShadowStartBoundaryAdmissionSummary | null): T {
  if (!shadow) return summary;
  return {
    ...summary,
    shadowStartBoundaryAdmission: shadow,
  };
}
