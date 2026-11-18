import type { RentalDrivingAnalysisAssessmentStatus } from '@prisma/client';
import { publishesRentalDrivingStressScore } from '../rental-driving-analysis/rental-driving-analysis.assessment';

export type BookingDetailUsageAnalysisSlice = {
  assessmentStatus?: RentalDrivingAnalysisAssessmentStatus | null;
  drivingScore?: number | null;
};

export function resolveBookingDetailDrivingStressScore(
  analysis: BookingDetailUsageAnalysisSlice | null | undefined,
): number | null {
  if (!analysis) return null;
  if (!publishesRentalDrivingStressScore(analysis.assessmentStatus)) return null;
  const score = analysis.drivingScore;
  if (score == null || !Number.isFinite(score)) return null;
  return score;
}

export function resolveBookingDetailUsageAssessmentStatus(
  analysis: BookingDetailUsageAnalysisSlice | null | undefined,
): RentalDrivingAnalysisAssessmentStatus | null {
  return analysis?.assessmentStatus ?? null;
}