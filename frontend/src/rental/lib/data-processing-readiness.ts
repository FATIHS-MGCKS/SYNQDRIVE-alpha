import type { StatusTone } from '../../components/patterns';
import type {
  DataAuthorizationDto,
  DataProcessingAgreementListItem,
  EnforcementCoverageSummaryDto,
  ProcessingActivityRegisterListItem,
} from '../../lib/api';

export type DataProcessingOverallReadinessKey =
  | 'traceable'
  | 'noData'
  | 'blockingGaps'
  | 'partnerReview';

export interface DataProcessingReadinessSummary {
  overallTone: StatusTone;
  overallKey: DataProcessingOverallReadinessKey;
  overallDetailParams?: {
    activitiesWithGaps?: number;
    coverageGaps?: number;
  };
  activitiesWithGaps: number;
  activitiesTotal: number;
  coverageGaps: number;
  coverageTotal: number;
  partnerGaps: number;
  partnersTotal: number;
  blockingGapLabels: string[];
}

export function buildDataProcessingReadinessSummary(input: {
  activities: ProcessingActivityRegisterListItem[];
  coverage: EnforcementCoverageSummaryDto | null;
  partners: DataProcessingAgreementListItem[];
  legacyAuthorizations: DataAuthorizationDto[];
}): DataProcessingReadinessSummary {
  const activitiesTotal = input.activities.length;
  const activitiesWithGaps = input.activities.filter((a) => a.hasBlockingGaps).length;
  const blockingGapLabels = [
    ...new Set(input.activities.flatMap((a) => a.completeness.blockingGaps ?? [])),
  ];

  const coverageTotal = input.coverage?.totalFlows ?? 0;
  const coverageGaps =
    (input.coverage?.notImplementedCount ?? 0) + (input.coverage?.enforcementErrorCount ?? 0);

  const partnersTotal = input.partners.length;
  const partnerGaps = input.partners.filter(
    (p) => p.transferAssessmentStatus === 'NOT_ASSESSED' || p.status !== 'ACTIVE',
  ).length;

  const hasActivityGaps = activitiesWithGaps > 0;
  const hasCoverageGaps = coverageGaps > 0;
  const hasPartnerGaps = partnerGaps > 0 && partnersTotal > 0;
  const noData = activitiesTotal === 0 && input.legacyAuthorizations.length === 0;

  let overallTone: StatusTone = 'success';
  let overallKey: DataProcessingOverallReadinessKey = 'traceable';
  let overallDetailParams: DataProcessingReadinessSummary['overallDetailParams'];

  if (noData) {
    overallTone = 'neutral';
    overallKey = 'noData';
  } else if (hasActivityGaps || hasCoverageGaps) {
    overallTone = 'critical';
    overallKey = 'blockingGaps';
    overallDetailParams = {
      activitiesWithGaps: hasActivityGaps ? activitiesWithGaps : undefined,
      coverageGaps: hasCoverageGaps ? coverageGaps : undefined,
    };
  } else if (hasPartnerGaps) {
    overallTone = 'watch';
    overallKey = 'partnerReview';
  }

  return {
    overallTone,
    overallKey,
    overallDetailParams,
    activitiesWithGaps,
    activitiesTotal,
    coverageGaps,
    coverageTotal,
    partnerGaps,
    partnersTotal,
    blockingGapLabels,
  };
}

export function formatDataProcessingOverallDetail(
  summary: Pick<DataProcessingReadinessSummary, 'overallKey' | 'overallDetailParams'>,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (summary.overallKey === 'blockingGaps') {
    const parts: string[] = [];
    const { activitiesWithGaps, coverageGaps } = summary.overallDetailParams ?? {};
    if (activitiesWithGaps) {
      parts.push(
        t('dataProcessing.readiness.overallDetail.blockingGapsActivities', {
          count: activitiesWithGaps,
        }),
      );
    }
    if (coverageGaps) {
      parts.push(
        t('dataProcessing.readiness.overallDetail.blockingGapsCoverage', { count: coverageGaps }),
      );
    }
    return parts.join(' · ');
  }
  return t(`dataProcessing.readiness.overallDetail.${summary.overallKey}`);
}
