import { Timeline } from '../../../../../../components/patterns';
import type { ProcessingActivityVersionItem } from '../../../../../../lib/api';
import { mapVersionTimeline } from '../../../../../lib/data-processing-timeline.mappers';
import { useLanguage } from '../../../../../i18n/LanguageContext';
import { DetailSection } from './DetailPrimitives';

interface Props {
  versions: ProcessingActivityVersionItem[];
  onSelectVersion?: (version: ProcessingActivityVersionItem) => void;
  selectedId?: string;
}

export function VersionHistoryPanel({ versions, onSelectVersion, selectedId }: Props) {
  const { t } = useLanguage();
  if (versions.length <= 1) return null;

  return (
    <DetailSection title={t('dataProcessing.detail.versions.title')}>
      <p className="text-[11px] text-muted-foreground mb-2">{t('dataProcessing.detail.versions.hint')}</p>
      <Timeline items={mapVersionTimeline(versions)} />
      {onSelectVersion ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelectVersion(v)}
              aria-current={selectedId === v.id ? 'true' : undefined}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border ${
                selectedId === v.id
                  ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted/40'
              }`}
            >
              v{v.versionNumber}
              {v.isCurrentVersion ? ` · ${t('dataProcessing.detail.versions.current')}` : ''}
            </button>
          ))}
        </div>
      ) : null}
    </DetailSection>
  );
}
