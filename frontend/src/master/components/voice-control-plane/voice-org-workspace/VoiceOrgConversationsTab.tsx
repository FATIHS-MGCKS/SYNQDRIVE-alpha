import { StatusChip } from '../../../../components/patterns';
import { EmptyState } from '../../../../components/patterns/states';
import { VoiceSectionHeader } from '../../../../components/voice-ui';
import type { VoiceConversationAdminSummary } from '../../../../lib/api';
import { timeAgo } from './voice-org-workspace.ops';

interface VoiceOrgConversationsTabProps {
  conversations: VoiceConversationAdminSummary[];
}

function outcomeTone(outcome: string): 'success' | 'warning' | 'critical' | 'neutral' {
  if (outcome === 'RESOLVED' || outcome === 'COMPLETED') return 'success';
  if (outcome === 'ESCALATED') return 'warning';
  if (outcome === 'FAILED' || outcome === 'ABANDONED') return 'critical';
  return 'neutral';
}

export function VoiceOrgConversationsTab({ conversations }: VoiceOrgConversationsTabProps) {
  return (
    <div className="space-y-4" data-testid="voice-org-tab-conversations">
      <VoiceSectionHeader
        title="Gespräche"
        description="Zusammenfassungen ohne vollständige Transkripte — maskierte Rufnummern."
      />

      {conversations.length === 0 ? (
        <EmptyState title="Keine Gespräche" description="Für diese Organisation liegen noch keine Gespräche vor." />
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className="rounded-xl border border-border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">{conv.direction}</span>
                  <StatusChip tone={outcomeTone(conv.outcome)}>{conv.outcome}</StatusChip>
                  {conv.escalated && <StatusChip tone="warning">Eskaliert</StatusChip>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                  {conv.summary ?? 'Keine Zusammenfassung'}
                </p>
              </div>
              <div className="text-right text-[10px] text-muted-foreground shrink-0">
                <p>{timeAgo(conv.startedAt)}</p>
                <p className="font-mono">{conv.callerNumber ?? '—'}</p>
                {conv.durationSeconds != null && (
                  <p className="tabular-nums">{Math.round(conv.durationSeconds / 60)} min</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
        Vollständige Transkripte sind in der Master-Ansicht nicht verfügbar.
      </p>
    </div>
  );
}
