import type { RentalDrivingAnalysisAssessmentStatus, Prisma } from '@prisma/client';
import { publishesRentalDrivingStressScore } from './rental-driving-analysis.assessment';
import {
  filterScoreDerivedRecommendationTexts,
  filterScoreDerivedWatchpointTexts,
} from './rental-driving-analysis.api-response.publish-text';

const VEHICLE_STRESS_SCORE_KEYS = [
  'drivingStressScore',
  'longitudinalStressScore',
  'brakingStressScore',
  'stopGoStressScore',
  'highSpeedStressScore',
  'thermalBrakeStressScore',
] as const;

export function resolvePublishedRentalApiDrivingStressScore(
  assessmentStatus: RentalDrivingAnalysisAssessmentStatus | null | undefined,
  drivingScore: number | null | undefined,
): number | null {
  if (!publishesRentalDrivingStressScore(assessmentStatus)) return null;
  if (drivingScore == null || !Number.isFinite(drivingScore)) return null;
  return drivingScore;
}

function redactVehicleStressSummaryNumericScores(
  summary: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...summary };
  for (const key of VEHICLE_STRESS_SCORE_KEYS) {
    if (key in next && typeof next[key] === 'number') {
      next[key] = null;
    }
  }
  if ('stressLevel' in next) {
    next.stressLevel = null;
  }
  if ('summary' in next && typeof next.summary === 'string') {
    next.summary = null;
  }
  return next;
}

function redactStressDerivedOverallAssessment(
  assessment: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...assessment,
    level: null,
    title: null,
    shortSummary: null,
  };
}

function redactStressDerivedWearImpact(
  wear: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...wear,
    overallWearImpact: null,
    summary: null,
    affectedAreas: [],
  };
}

function redactStressDerivedEventSummary(
  eventSummary: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...eventSummary };
  if (Array.isArray(next.eventHighlights)) {
    next.eventHighlights = filterScoreDerivedWatchpointTexts(
      next.eventHighlights as string[],
    );
  }
  return next;
}

function redactRentalMetricsVehicleLoadStress(
  metrics: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...metrics };
  const vehicleLoad = next.vehicleLoad;
  if (!vehicleLoad || typeof vehicleLoad !== 'object' || Array.isArray(vehicleLoad)) {
    return next;
  }
  const vl = { ...(vehicleLoad as Record<string, unknown>) };
  if ('stressScore' in vl) {
    vl.stressScore = null;
  }
  if ('level' in vl) {
    vl.level = null;
  }
  next.vehicleLoad = vl;
  return next;
}

/** API response gate — does not mutate persisted payload; shallow-copies for outbound JSON only. */
export function gateRentalAnalysisPayloadForApi(
  payload: Prisma.JsonValue | null | undefined,
  assessmentStatus: RentalDrivingAnalysisAssessmentStatus | null | undefined,
): Prisma.JsonValue | null | undefined {
  if (payload == null) return payload;
  if (publishesRentalDrivingStressScore(assessmentStatus)) return payload;
  if (typeof payload !== 'object' || Array.isArray(payload)) return payload;

  const root = { ...(payload as Record<string, unknown>) };
  const vss = root.vehicleStressSummary;
  if (vss && typeof vss === 'object' && !Array.isArray(vss)) {
    root.vehicleStressSummary = redactVehicleStressSummaryNumericScores(
      vss as Record<string, unknown>,
    );
  }

  const overall = root.overallAssessment;
  if (overall && typeof overall === 'object' && !Array.isArray(overall)) {
    root.overallAssessment = redactStressDerivedOverallAssessment(
      overall as Record<string, unknown>,
    );
  }

  const wear = root.wearImpactAssessment;
  if (wear && typeof wear === 'object' && !Array.isArray(wear)) {
    root.wearImpactAssessment = redactStressDerivedWearImpact(wear as Record<string, unknown>);
  }

  if (Array.isArray(root.watchpoints)) {
    root.watchpoints = filterScoreDerivedWatchpointTexts(root.watchpoints as string[]);
  }
  if (Array.isArray(root.recommendations)) {
    root.recommendations = filterScoreDerivedRecommendationTexts(
      root.recommendations as string[],
    );
  }

  const eventSummary = root.eventSummary;
  if (eventSummary && typeof eventSummary === 'object' && !Array.isArray(eventSummary)) {
    root.eventSummary = redactStressDerivedEventSummary(
      eventSummary as Record<string, unknown>,
    );
  }

  const rentalMetrics = root.rentalMetrics;
  if (rentalMetrics && typeof rentalMetrics === 'object' && !Array.isArray(rentalMetrics)) {
    root.rentalMetrics = redactRentalMetricsVehicleLoadStress(
      rentalMetrics as Record<string, unknown>,
    );
  }

  return root as Prisma.JsonValue;
}