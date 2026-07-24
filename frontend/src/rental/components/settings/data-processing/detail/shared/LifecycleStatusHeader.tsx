import { StatusChip } from '../../../../../../components/patterns';
import { labelLifecycleStatus } from '../../../../../lib/data-processing-status-labels';
import { useLanguage } from '../../../../../i18n/LanguageContext';

interface Props {
  status: string;
  versionNumber?: number;
  isCurrentVersion?: boolean;
  statusSemantics?: {
    label: string;
    description: string;
    displayCategory: string;
  };
}

export function LifecycleStatusHeader({ status, versionNumber, isCurrentVersion, statusSemantics }: Props) {
  const { t } = useLanguage();
  const tone =
    status === 'ACTIVE'
      ? 'success'
      : status === 'REVOKED' || status === 'REJECTED'
        ? 'critical'
        : status === 'SUSPENDED'
          ? 'watch'
          : 'neutral';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusChip tone={tone}>
        <span className="sr-only">{t('dataProcessing.a11y.statusPrefix')}: </span>
        {statusSemantics?.label ?? labelLifecycleStatus(status, t)}
      </StatusChip>
      {versionNumber != null ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {t('dataProcessing.detail.version', { version: versionNumber })}
        </span>
      ) : null}
      {isCurrentVersion === false ? (
        <StatusChip tone="watch">{t('dataProcessing.detail.historicalVersion')}</StatusChip>
      ) : null}
      {statusSemantics?.description ? (
        <p className="w-full text-[11px] text-muted-foreground">{statusSemantics.description}</p>
      ) : null}
    </div>
  );
}
