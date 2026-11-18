import type { RentalDrivingAnalysisItem } from '../../lib/api';
import { resolveDrivingStressScore } from './scoreFormat';

export type RentalDrivingAnalysisAssessmentStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'PROVISIONAL'
  | 'NOT_ASSESSABLE'
  | 'FAILED';

export function publishesRentalDrivingStressScore(
  status: RentalDrivingAnalysisAssessmentStatus | string | null | undefined,
): boolean {
  return status === 'COMPLETE' || status === 'PARTIAL';
}

export function normalizePublishedRentalStressScore(
  score: number | null | undefined,
): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return score;
}

export type RentalAssessmentStatusI18nKey =
  | 'misuseStress.stress.assessmentStatus.COMPLETE'
  | 'misuseStress.stress.assessmentStatus.PARTIAL'
  | 'misuseStress.stress.assessmentStatus.PROVISIONAL'
  | 'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE'
  | 'misuseStress.stress.assessmentStatus.FAILED';

export function rentalAssessmentStatusI18nKey(
  status: RentalDrivingAnalysisAssessmentStatus | string | null | undefined,
): RentalAssessmentStatusI18nKey | null {
  switch (status) {
    case 'COMPLETE':
      return 'misuseStress.stress.assessmentStatus.COMPLETE';
    case 'PARTIAL':
      return 'misuseStress.stress.assessmentStatus.PARTIAL';
    case 'PROVISIONAL':
      return 'misuseStress.stress.assessmentStatus.PROVISIONAL';
    case 'NOT_ASSESSABLE':
      return 'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE';
    case 'FAILED':
      return 'misuseStress.stress.assessmentStatus.FAILED';
    default:
      return null;
  }
}

export function resolveRentalAnalysisStressScore(
  analysis: RentalDrivingAnalysisItem | null | undefined,
): number | null {
  if (!analysis) return null;
  if (!publishesRentalDrivingStressScore(analysis.assessmentStatus)) return null;
  const payloadScore = analysis.payload?.vehicleStressSummary?.drivingStressScore;
  if (typeof payloadScore === 'number') {
    return normalizePublishedRentalStressScore(payloadScore);
  }
  return normalizePublishedRentalStressScore(
    resolveDrivingStressScore({
      drivingScore: analysis.drivingScore,
      drivingStressScore: analysis.drivingStressScore,
    }),
  );
}