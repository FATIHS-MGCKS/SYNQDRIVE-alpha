import { StatusChip } from '../../../../components/patterns';
import { EmptyState } from '../../../../components/patterns/states';
import { VoiceSectionHeader } from '../../../../components/voice-ui';
import type { VoiceControlPlaneWebhookEventRow } from '../../../../lib/api';
import { timeAgo } from './voice-org-workspace.ops';

interface VoiceOrgEventsTabProps {
  events: VoiceControlPlaneWebhookEventRow[];
  onReplay: (eventId: string) => void;
}

function statusTone(status: string): 'success' | 'warning' | 'critical' | 'neutral' {
  if (status === 'PROCESSED') return 'success';
  if (status === 'FAILED') return 'critical';
  if (['QUEUED', 'RECEIVED'].includes(status)) return 'warning';
  return 'neutral';
}

export function VoiceOrgEventsTab({ events, onReplay }: VoiceOrgEventsTabProps) {
  return (
    <div className="space-y-4" data-testid="voice-org-tab-events">
      <VoiceSectionHeader
        title="Events"
        description="Provider-Events mit redigierter Diagnose — keine vollständigen Payloads."
      />

      {events.length === 0 ? (
        <EmptyState title="Keine Events" description="Für diese Organisation wurden noch keine Webhook-Events erfasst." />
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <div
              key={event.id}
              className="rounded-xl border border-border p-3 space-y-2"
              data-testid={`org-webhook-event-${event.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">{event.provider}</span>
                  <span className="text-muted-foreground">{event.eventType ?? '—'}</span>
                  <StatusChip tone={statusTone(event.status)}>{event.status}</StatusChip>
                  {event.status === 'FAILED' && (
                    <StatusChip tone="critical">DLQ</StatusChip>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">{timeAgo(event.receivedAt)}</span>
              </div>

              <p className="text-[11px] text-muted-foreground line-clamp-2">
                {event.diagnosticSummary ?? event.errorMessage ?? 'Keine Diagnose'}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                <span>Retries: {event.retryCount}</span>
                {event.errorCode && <span>Code: {event.errorCode}</span>}
              </div>

              {event.status === 'FAILED' && (
                <button
                  type="button"
                  onClick={() => onReplay(event.id)}
                  className="text-xs font-semibold text-[color:var(--brand)]"
                >
                  Webhook-Ereignis erneut verarbeiten
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
