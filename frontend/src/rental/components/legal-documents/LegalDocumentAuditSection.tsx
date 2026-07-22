import { DataCard, SectionHeader, StatusChip, Timeline } from '../../../components/patterns';
import type { LegalDocumentEventDto } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatLegalDocumentDate,
  legalDocumentTypeTitle,
} from '../../lib/legal-documents-overview';
import { formatLifecycleEventLabel } from '../../lib/legal-document-lifecycle.utils';

interface Props {
  events: LegalDocumentEventDto[];
  loading?: boolean;
}

function eventTone(eventType: string) {
  if (eventType.includes('FAILED') || eventType === 'REVOKED') return 'critical' as const;
  if (eventType === 'ACTIVATED' || eventType === 'APPROVED') return 'success' as const;
  if (eventType === 'IN_REVIEW' || eventType === 'SUBMITTED_FOR_REVIEW') return 'watch' as const;
  return 'neutral' as const;
}

export function LegalDocumentAuditSection({ events, loading }: Props) {
  const { t, locale } = useLanguage();

  return (
    <div className="space-y-3">
      <SectionHeader
        title={t('legalDocuments.audit.title')}
        description={t('legalDocuments.audit.description')}
        as="label"
      />
      <DataCard>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">{t('legalDocuments.audit.empty')}</p>
        ) : (
          <Timeline
            items={events.map((event) => ({
              id: event.id,
              tone: eventTone(event.eventType),
              title: (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{formatLifecycleEventLabel(event.eventType, t)}</span>
                  <StatusChip tone={eventTone(event.eventType)}>v{event.versionLabel}</StatusChip>
                </span>
              ),
              time: formatLegalDocumentDate(event.createdAt, locale),
              description: (
                <>
                  {legalDocumentTypeTitle(event.documentType, event.legalVariant, t)} ·{' '}
                  {event.language.toUpperCase()}
                  {event.jurisdiction ? ` · ${event.jurisdiction}` : ''}
                  <br />
                  {event.actorDisplayName ?? t('legalDocuments.audit.system')}
                  {event.reason ? ` — ${event.reason}` : ''}
                </>
              ),
            }))}
          />
        )}
      </DataCard>
    </div>
  );
}
