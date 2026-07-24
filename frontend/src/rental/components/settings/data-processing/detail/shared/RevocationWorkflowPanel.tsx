import { Loader2, RefreshCw } from 'lucide-react';
import { StatusChip, Timeline } from '../../../../../../components/patterns';
import type { RevocationWorkflowDetail } from '../../../../../../lib/api';
import { mapRevocationTimeline } from '../../../../../lib/data-processing-timeline.mappers';
import { useLanguage } from '../../../../../i18n/LanguageContext';
import { DetailSection } from './DetailPrimitives';

interface Props {
  detail: RevocationWorkflowDetail | null;
  loading?: boolean;
  onResume?: () => void;
  canResume?: boolean;
  resuming?: boolean;
}

export function RevocationWorkflowPanel({
  detail,
  loading,
  onResume,
  canResume,
  resuming,
}: Props) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <DetailSection title={t('dataProcessing.detail.revocation.title')}>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          {t('dataProcessing.detail.revocation.loading')}
        </div>
      </DetailSection>
    );
  }

  if (!detail) return null;

  const { workflow } = detail;
  const failed = workflow.status === 'REVOCATION_FAILED' || workflow.status === 'DEAD_LETTER';
  const tone = failed ? 'critical' : workflow.status === 'COMPLETED' ? 'success' : 'watch';

  return (
    <DetailSection title={t('dataProcessing.detail.revocation.title')}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={tone}>{workflow.status}</StatusChip>
          {workflow.reason ? (
            <span className="text-[11px] text-muted-foreground">{workflow.reason}</span>
          ) : null}
        </div>
        <Timeline items={mapRevocationTimeline(detail)} />
        {canResume && failed && onResume ? (
          <button
            type="button"
            onClick={onResume}
            disabled={resuming}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50"
          >
            {resuming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {t('dataProcessing.detail.revocation.resume')}
          </button>
        ) : null}
      </div>
    </DetailSection>
  );
}
