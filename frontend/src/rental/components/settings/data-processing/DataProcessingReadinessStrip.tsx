import { AlertTriangle, ClipboardList, ShieldAlert, ShieldCheck } from 'lucide-react';
import { MetricCard } from '../../../../components/patterns';
import type { DataProcessingReadinessSummary } from '../../../lib/data-processing-readiness';
import { formatDataProcessingOverallDetail } from '../../../lib/data-processing-readiness';
import { useLooseLanguage } from '../../../lib/data-processing-i18n';

interface Props {
  summary: DataProcessingReadinessSummary;
  loading?: boolean;
}

export function DataProcessingReadinessStrip({ summary, loading }: Props) {
  const { t } = useLooseLanguage();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <MetricCard
        label={t('dataProcessing.readiness.overall')}
        value={t(`dataProcessing.readiness.overall.${summary.overallKey}`)}
        hint={formatDataProcessingOverallDetail(summary, t)}
        status={summary.overallTone}
        icon={
          summary.overallTone === 'success' ? (
            <ShieldCheck className="h-4 w-4" />
          ) : summary.overallTone === 'critical' ? (
            <ShieldAlert className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )
        }
        loading={loading}
        variant="summary"
        valueSize="compact"
        className="col-span-2 sm:col-span-1"
      />
      <MetricCard
        label={t('dataProcessing.readiness.activities')}
        value={summary.activitiesTotal - summary.activitiesWithGaps}
        unit={summary.activitiesTotal > 0 ? `/ ${summary.activitiesTotal}` : undefined}
        status={summary.activitiesWithGaps > 0 ? 'critical' : summary.activitiesTotal > 0 ? 'success' : 'neutral'}
        hint={
          summary.activitiesWithGaps > 0
            ? t('dataProcessing.readiness.activitiesGap', { count: summary.activitiesWithGaps })
            : t('dataProcessing.readiness.activitiesOk')
        }
        icon={<ClipboardList className="h-4 w-4" />}
        loading={loading}
        variant="summary"
        valueSize="compact"
      />
      <MetricCard
        label={t('dataProcessing.readiness.coverage')}
        value={summary.coverageTotal - summary.coverageGaps}
        unit={summary.coverageTotal > 0 ? `/ ${summary.coverageTotal}` : undefined}
        status={summary.coverageGaps > 0 ? 'watch' : summary.coverageTotal > 0 ? 'success' : 'neutral'}
        hint={
          summary.coverageGaps > 0
            ? t('dataProcessing.readiness.coverageGap', { count: summary.coverageGaps })
            : t('dataProcessing.readiness.coverageOk')
        }
        loading={loading}
        variant="summary"
        valueSize="compact"
      />
      <MetricCard
        label={t('dataProcessing.readiness.partners')}
        value={summary.partnersTotal - summary.partnerGaps}
        unit={summary.partnersTotal > 0 ? `/ ${summary.partnersTotal}` : undefined}
        status={summary.partnerGaps > 0 ? 'watch' : summary.partnersTotal > 0 ? 'success' : 'neutral'}
        hint={
          summary.partnerGaps > 0
            ? t('dataProcessing.readiness.partnersGap', { count: summary.partnerGaps })
            : t('dataProcessing.readiness.partnersOk')
        }
        loading={loading}
        variant="summary"
        valueSize="compact"
      />
    </div>
  );
}
