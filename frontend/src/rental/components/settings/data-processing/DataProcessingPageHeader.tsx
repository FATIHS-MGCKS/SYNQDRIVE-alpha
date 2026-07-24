import { Shield } from 'lucide-react';
import { PageHeader, StatusChip } from '../../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { DataProcessingReadinessSummary } from '../../../lib/data-processing-readiness';
import { formatDataProcessingOverallDetail } from '../../../lib/data-processing-readiness';

interface DataProcessingPageHeaderProps {
  readiness: DataProcessingReadinessSummary;
  loading?: boolean;
}

export function DataProcessingPageHeader({ readiness, loading }: DataProcessingPageHeaderProps) {
  const { t } = useLanguage();

  return (
    <PageHeader
      variant="full"
      eyebrow={t('dataProcessing.eyebrow')}
      title={t('dataProcessing.title')}
      description={t('dataProcessing.subtitle')}
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/50 text-[var(--brand)]">
          <Shield className="h-5 w-5" aria-hidden />
        </div>
      }
      status={
        <StatusChip tone={loading ? 'neutral' : readiness.overallTone} dot>
          {loading
            ? t('dataProcessing.status.loading')
            : t(`dataProcessing.readiness.overall.${readiness.overallKey}`)}
        </StatusChip>
      }
      meta={
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {loading
            ? t('dataProcessing.status.loadingDetail')
            : formatDataProcessingOverallDetail(readiness, t)}
        </p>
      }
    />
  );
}
