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

/** Map RDA assessment status to trip Driving Impact quality hints (P2-1 / no new algorithm). */
export function mapRentalAssessmentToDrivingImpactStatus(
  status: RentalDrivingAnalysisAssessmentStatus | string | null | undefined,
): string | null {
  switch (status) {
    case 'PARTIAL':
      return 'PARTIAL';
    case 'PROVISIONAL':
      return 'STALE';
    case 'FAILED':
      return 'FAILED';
    case 'NOT_ASSESSABLE':
      return 'UNSUPPORTED';
    default:
      return null;
  }
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
  if (typeof payloadScore === 'number') return payloadScore;
  return resolveDrivingStressScore({
    drivingScore: analysis.drivingScore,
    drivingStressScore: analysis.drivingStressScore,
  });
}