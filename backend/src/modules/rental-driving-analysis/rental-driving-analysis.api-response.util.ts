import type { RentalDrivingAnalysisAssessmentStatus, Prisma } from '@prisma/client';
import { publishesRentalDrivingStressScore } from './rental-driving-analysis.assessment';

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
  return root as Prisma.JsonValue;
}