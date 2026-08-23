import { ChevronDown, ChevronUp, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { UseCommunicationVoiceCallResult } from '../../../lib/communication/hooks/useCommunicationVoiceCall';

interface CommunicationVoiceCallCardProps {
  voiceCall: UseCommunicationVoiceCallResult;
  conversationId: string;
  onOpenAiActivity?: () => void;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function speakerLabelKey(speaker: string) {
  switch (speaker) {
    case 'CUSTOMER':
      return 'communication.voice.speaker.customer' as const;
    case 'AI_AGENT':
      return 'communication.voice.speaker.aiAgent' as const;
    case 'HUMAN_OPERATOR':
      return 'communication.voice.speaker.humanOperator' as const;
    default:
      return 'communication.voice.speaker.unknown' as const;
  }
}

export function CommunicationVoiceCallCard({
  voiceCall,
  conversationId,
  onOpenAiActivity,
}: CommunicationVoiceCallCardProps) {
  const { t } = useLanguage();
  const detail = voiceCall.callDetail;

  if (voiceCall.detailLoading) {
    return (
      <div
        data-testid="communication-voice-call-card-loading"
        className="border-b border-border/40 px-3 py-3 text-[11px] text-muted-foreground"
      >
        {t('communication.voice.loading')}
      </div>
    );
  }

  if (voiceCall.detailError || !detail) {
    return null;
  }

  const DirectionIcon = detail.direction === 'INBOUND' ? PhoneIncoming : PhoneOutgoing;
  const directionLabel =
    detail.direction === 'INBOUND'
      ? t('communication.voice.direction.inbound')
      : t('communication.voice.direction.outbound');

  return (
    <section
      data-testid="communication-voice-call-card"
      className="border-b border-border/40 bg-muted/10 px-3 py-3"
      aria-label={t('communication.voice.callCardLabel')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <DirectionIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-[11px] font-semibold text-foreground">{directionLabel}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] font-medium text-muted-foreground">
              {t(`communication.voice.outcome.${detail.outcome}` as const)}
            </span>
            {detail.escalated && (
              <>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  {t('communication.voice.escalated')}
                </span>
              </>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground tabular-nums">
            {new Date(detail.startedAt).toLocaleString()}
            <span aria-hidden> · </span>
            {t('communication.voice.duration', { value: formatDuration(detail.durationSeconds) })}
            {detail.maskedCallerNumber ? (
              <>
                <span aria-hidden> · </span>
                <span className="truncate">{detail.maskedCallerNumber}</span>
              </>
            ) : null}
          </p>

          {detail.summaryAvailable && detail.summary ? (
            <p className="text-[11px] leading-relaxed text-foreground/90">{detail.summary}</p>
          ) : null}

          {detail.escalationReason ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-300">
              {t('communication.voice.escalationReason', { reason: detail.escalationReason })}
            </p>
          ) : null}

          {detail.errorMessage ? (
            <p className="text-[10px] text-destructive">{detail.errorMessage}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {onOpenAiActivity ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              onClick={onOpenAiActivity}
              data-testid="communication-voice-ai-activity-link"
            >
              {t('communication.voice.aiActivity')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            disabled={voiceCall.creatingTask}
            aria-busy={voiceCall.creatingTask}
            onClick={() => void voiceCall.createTask()}
            data-testid="communication-voice-create-task"
          >
            {voiceCall.creatingTask
              ? t('communication.voice.createTaskLoading')
              : t('communication.voice.createTask')}
          </Button>
        </div>
      </div>

      {voiceCall.taskError ? (
        <p role="alert" className="mt-2 text-[10px] text-destructive">
          {t('communication.voice.createTaskError')}
        </p>
      ) : null}
      {voiceCall.createdTaskId ? (
        <p className="mt-2 text-[10px] text-emerald-700 dark:text-emerald-300">
          {t('communication.voice.createTaskSuccess')}
        </p>
      ) : null}

      <div className="mt-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
          aria-expanded={voiceCall.transcriptExpanded}
          aria-controls={`communication-voice-transcript-${conversationId}`}
          onClick={() => voiceCall.setTranscriptExpanded(!voiceCall.transcriptExpanded)}
          data-testid="communication-voice-transcript-toggle"
        >
          {voiceCall.transcriptExpanded
            ? t('communication.voice.hideTranscript')
            : t('communication.voice.showTranscript')}
          {voiceCall.transcriptExpanded ? (
            <ChevronUp className="h-3 w-3" aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden />
          )}
        </button>

        {voiceCall.transcriptExpanded ? (
          <div
            id={`communication-voice-transcript-${conversationId}`}
            className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border/50 bg-background/80 p-2"
            data-testid="communication-voice-transcript-panel"
          >
            {voiceCall.transcriptLoading ? (
              <p className="text-[10px] text-muted-foreground">{t('communication.voice.transcriptLoading')}</p>
            ) : voiceCall.transcriptError ? (
              <p role="alert" className="text-[10px] text-destructive">
                {t('communication.voice.transcriptError')}
              </p>
            ) : voiceCall.transcript?.availability === 'TRANSCRIPT_UNAVAILABLE' ? (
              <p className="text-[10px] text-muted-foreground">
                {t('communication.voice.transcriptUnavailable')}
              </p>
            ) : (
              <ul className="space-y-2">
                {voiceCall.transcript?.segments.map((segment) => (
                  <li key={segment.id} className="text-[10px] leading-relaxed">
                    <span
                      className={cn(
                        'mr-1.5 inline-flex rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                        segment.speaker === 'CUSTOMER' && 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
                        segment.speaker === 'AI_AGENT' && 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
                        segment.speaker === 'HUMAN_OPERATOR' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                        segment.speaker === 'UNKNOWN' && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {t(speakerLabelKey(segment.speaker))}
                    </span>
                    <span className="text-foreground/90">{segment.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
