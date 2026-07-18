import { useCallback, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { StatusChip } from '../../../components/patterns';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../../components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../components/ui/collapsible';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type { VoiceAssistantData, VoiceConversationEntry } from '../../../lib/api';
import { formatMoneyCents } from '../../../lib/money';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import {
  buildConversationTimeline,
  canPlayCallAudio,
  conversationIntent,
  estimatedCallCostCents,
  formatDuration,
  isInbound,
  maskCallerNumber,
  outcomeBadgeTone,
  providerStatusForConversation,
  resolveFollowUpKind,
  resolvePrivacyStatus,
  shortEntityRef,
} from './voice-conversation.utils';

interface VoiceConversationDetailDrawerProps {
  orgId: string;
  conversation: VoiceConversationEntry | null;
  assistant: VoiceAssistantData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centsPerMinute?: number;
  onTaskCreated?: () => void;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,34%)] gap-2 border-b border-border/30 py-2.5 sm:grid-cols-[140px_1fr]">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-[11px] text-foreground">{children}</dd>
    </div>
  );
}

export function VoiceConversationDetailDrawer({
  orgId,
  conversation,
  assistant,
  open,
  onOpenChange,
  centsPerMinute = 0,
  onTaskCreated,
}: VoiceConversationDetailDrawerProps) {
  const { t, locale } = useLanguage();
  const moneyLocale = locale === 'de' ? 'de-DE' : 'en-US';
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptAudited, setTranscriptAudited] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const revealTranscript = useCallback(() => {
    setTranscriptOpen(true);
    if (!transcriptAudited) {
      setTranscriptAudited(true);
      toast.message(t('voice.conversations.audit.transcriptAccess'), {
        description: t('voice.conversations.audit.logged'),
      });
    }
  }, [transcriptAudited, t]);

  if (!conversation) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg" />
      </Sheet>
    );
  }

  const privacy = resolvePrivacyStatus(conversation, assistant);
  const followUp = resolveFollowUpKind(conversation);
  const intent = conversationIntent(conversation);
  const costCents = estimatedCallCostCents(conversation, centsPerMinute);
  const timeline = buildConversationTimeline(conversation);
  const audioAllowed = canPlayCallAudio(conversation, assistant);
  const providerStatus = providerStatusForConversation(conversation);

  const createTask = async () => {
    if (!orgId) return;
    setCreatingTask(true);
    try {
      await api.tasks.create(orgId, {
        title: t('voice.conversations.taskTitle', {
          date: new Date(conversation.startedAt).toLocaleDateString(moneyLocale),
        }),
        description: [
          conversation.summary ? `${t('voice.conversations.summary')}: ${conversation.summary}` : null,
          conversation.escalationReason
            ? `${t('voice.conversations.escalation')}: ${conversation.escalationReason}`
            : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
        type: 'CUSTOMER_FOLLOWUP',
        source: 'MANUAL',
        priority: conversation.escalated ? 'HIGH' : 'NORMAL',
        bookingId: conversation.linkedBookingId ?? undefined,
        customerId: conversation.linkedCustomerId ?? undefined,
        vehicleId: conversation.linkedVehicleId ?? undefined,
        metadata: {
          voiceConversationId: conversation.id,
          outcome: conversation.outcome,
        },
        sourceKey: 'VOICE_ASSISTANT',
      });
      toast.success(t('voice.conversations.taskCreated'));
      onTaskCreated?.();
    } catch (err) {
      toast.error(t('voice.conversations.taskFailed'), { description: getErrorMessage(err) });
    } finally {
      setCreatingTask(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" aria-describedby="voice-conversation-drawer-desc">
        <SheetHeader className="border-b border-border/40 pb-4">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-left text-base">
            <Icon
              name={isInbound(conversation.direction) ? 'phone-incoming' : 'phone-outgoing'}
              className="h-4 w-4"
              aria-hidden
            />
            {maskCallerNumber(conversation.callerNumber) ?? t('voice.ops.unknownCaller')}
          </SheetTitle>
          <SheetDescription id="voice-conversation-drawer-desc" className="text-left">
            {new Date(conversation.startedAt).toLocaleString(moneyLocale)} ·{' '}
            {formatDuration(conversation.durationSeconds)}
          </SheetDescription>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <StatusChip tone="neutral" className="text-[9px]">
              {t(
                isInbound(conversation.direction)
                  ? 'voice.conversations.direction.inbound'
                  : 'voice.conversations.direction.outbound',
              )}
            </StatusChip>
            <StatusChip tone={outcomeBadgeTone(conversation.outcome)} className="text-[9px]">
              {t(`voice.conversations.outcome.${conversation.outcome}` as 'voice.conversations.outcome.RESOLVED')}
            </StatusChip>
            <StatusChip tone="neutral" className="text-[9px]">
              {t(`voice.conversations.privacy.${privacy}` as 'voice.conversations.privacy.full')}
            </StatusChip>
          </div>
        </SheetHeader>

        <div className="mt-2 space-y-4 pb-6">
          <section aria-labelledby="voice-drawer-summary">
            <h3 id="voice-drawer-summary" className="mb-2 text-xs font-bold text-foreground">
              {t('voice.conversations.drawer.summary')}
            </h3>
            <p className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5 text-[11px] text-foreground/90">
              {conversation.summary?.trim() || t('voice.conversations.noSummary')}
            </p>
            {intent && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                <span className="font-semibold">{t('voice.conversations.intent')}:</span> {intent}
              </p>
            )}
          </section>

          <section aria-labelledby="voice-drawer-timeline">
            <h3 id="voice-drawer-timeline" className="mb-2 text-xs font-bold text-foreground">
              {t('voice.conversations.drawer.timeline')}
            </h3>
            <ol className="space-y-2">
              {timeline.map(event => (
                <li key={event.id} className="flex gap-2 text-[10px]">
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                    {new Date(event.at).toLocaleTimeString(moneyLocale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">
                      {event.kind === 'tool'
                        ? event.label
                        : t(`voice.conversations.timeline.${event.label}` as 'voice.conversations.timeline.started')}
                    </p>
                    {event.detail && <p className="text-muted-foreground">{event.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <dl>
            <DetailRow label={t('voice.conversations.drawer.customer')}>
              {conversation.linkedCustomerId
                ? t('voice.conversations.linkedCustomer', {
                    ref: shortEntityRef(conversation.linkedCustomerId),
                  })
                : t('voice.ops.unknownCaller')}
            </DetailRow>
            <DetailRow label={t('voice.conversations.drawer.booking')}>
              {conversation.linkedBookingId
                ? t('voice.conversations.linkedBooking', {
                    ref: shortEntityRef(conversation.linkedBookingId),
                  })
                : '—'}
            </DetailRow>
            <DetailRow label={t('voice.conversations.drawer.vehicle')}>
              {conversation.linkedVehicleId
                ? shortEntityRef(conversation.linkedVehicleId)
                : '—'}
            </DetailRow>
            <DetailRow label={t('voice.conversations.drawer.followUp')}>
              {t(`voice.conversations.followUp.${followUp}` as 'voice.conversations.followUp.none')}
            </DetailRow>
            <DetailRow label={t('voice.conversations.drawer.cost')}>
              {costCents == null
                ? '—'
                : formatMoneyCents(costCents, 'EUR', moneyLocale)}
            </DetailRow>
            <DetailRow label={t('voice.conversations.drawer.providerStatus')}>
              {t(`voice.conversations.provider.${providerStatus}` as 'voice.conversations.provider.finalized')}
            </DetailRow>
          </dl>

          {(conversation.actionsPerformed?.length ?? 0) > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold text-foreground">
                {t('voice.conversations.drawer.toolActions')}
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {conversation.actionsPerformed!.map(action => (
                  <li key={action}>
                    <StatusChip tone="info" className="text-[9px]">
                      {action}
                    </StatusChip>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {conversation.taskId && (
            <section>
              <h3 className="mb-1 text-xs font-bold text-foreground">{t('voice.conversations.drawer.tasks')}</h3>
              <p className="text-[11px] text-muted-foreground">
                {t('voice.conversations.linkedTask', { ref: shortEntityRef(conversation.taskId) })}
              </p>
            </section>
          )}

          {!conversation.taskId && followUp !== 'none' && (
            <button
              type="button"
              disabled={creatingTask}
              onClick={() => void createTask()}
              className="sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border border-border/60 px-3.5 py-2 text-[11px] font-semibold"
            >
              <Icon name={creatingTask ? 'loader-2' : 'list-plus'} className={cn('h-3.5 w-3.5', creatingTask && 'animate-spin')} />
              {creatingTask ? t('voice.conversations.creatingTask') : t('voice.conversations.createTask')}
            </button>
          )}

          {conversation.hasTranscript && (
            <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
              <CollapsibleTrigger
                type="button"
                onClick={() => {
                  if (!transcriptOpen) revealTranscript();
                }}
                className="flex w-full items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-left text-[11px] font-semibold"
              >
                {t('voice.conversations.drawer.transcript')}
                <Icon name={transcriptOpen ? 'chevron-up' : 'chevron-down'} className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 max-h-56 overflow-y-auto rounded-lg bg-muted/30 p-3 text-[10px] whitespace-pre-wrap text-foreground/90">
                  {conversation.transcript}
                </pre>
                {transcriptAudited && (
                  <p className="mt-1 text-[10px] text-muted-foreground">{t('voice.conversations.audit.logged')}</p>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {audioAllowed && (
            <section className="rounded-lg border border-dashed border-border/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-foreground">{t('voice.conversations.drawer.audio')}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{t('voice.conversations.audio.available')}</p>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
