import { DataCard, SectionHeader, StatusChip, Timeline } from '../../../components/patterns';
import type { LegalDocumentEventDto } from '../../../lib/api';
import {
  formatLegalDocumentDate,
  legalDocumentTypeTitle,
} from '../../lib/legal-documents-overview';

interface Props {
  events: LegalDocumentEventDto[];
  loading?: boolean;
}

const EVENT_LABEL_DE: Record<string, string> = {
  UPLOADED: 'Hochgeladen',
  SUBMITTED_FOR_REVIEW: 'Zur Prüfung eingereicht',
  RETURNED_TO_DRAFT: 'Zurück in Entwurf',
  APPROVED: 'Freigegeben',
  SCHEDULED: 'Aktivierung geplant',
  ACTIVATED: 'Aktiviert',
  SUPERSEDED: 'Ersetzt',
  REVOKED: 'Zurückgezogen',
  ARCHIVED: 'Archiviert',
  LEGAL_HOLD_SET: 'Legal Hold gesetzt',
  LEGAL_HOLD_CLEARED: 'Legal Hold aufgehoben',
  STORAGE_PURGED: 'Datei gelöscht (Retention)',
  STORAGE_PURGE_FAILED: 'Löschung fehlgeschlagen',
  RECIPIENT_REDACTED: 'Empfängerdaten redigiert',
};

function eventTone(eventType: string) {
  if (eventType.includes('FAILED') || eventType === 'REVOKED') return 'critical' as const;
  if (eventType === 'ACTIVATED' || eventType === 'APPROVED') return 'success' as const;
  if (eventType === 'IN_REVIEW' || eventType === 'SUBMITTED_FOR_REVIEW') return 'watch' as const;
  return 'neutral' as const;
}

export function LegalDocumentAuditSection({ events, loading }: Props) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="Audit & Verwendung"
        description="Letzte Lifecycle-Ereignisse und Freigaben (read-only)"
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
          <p className="text-[12px] text-muted-foreground">Noch keine Audit-Einträge vorhanden.</p>
        ) : (
          <Timeline
            items={events.map((event) => ({
              id: event.id,
              tone: eventTone(event.eventType),
              title: (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{EVENT_LABEL_DE[event.eventType] ?? event.eventType}</span>
                  <StatusChip tone={eventTone(event.eventType)}>v{event.versionLabel}</StatusChip>
                </span>
              ),
              time: formatLegalDocumentDate(event.createdAt),
              description: (
                <>
                  {legalDocumentTypeTitle(event.documentType, event.legalVariant)} ·{' '}
                  {event.language.toUpperCase()}
                  {event.jurisdiction ? ` · ${event.jurisdiction}` : ''}
                  <br />
                  {event.actorDisplayName ?? 'System'}
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
