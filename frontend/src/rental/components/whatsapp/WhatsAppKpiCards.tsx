import { Skeleton } from '../../../components/ui/skeleton';
import { VoiceKpiCard } from '../voice-assistant/VoiceOpsKpiStrip';

interface WhatsAppKpiCardsProps {
  loading?: boolean;
  openConversations: number | null;
  unreadTotal: number | null;
  humanReview: number | null;
  failedMessages: number | null;
  aiMessagesToday: number | null;
  onOpenInbox?: () => void;
}

export function WhatsAppKpiCards({
  loading,
  openConversations,
  unreadTotal,
  humanReview,
  failedMessages,
  aiMessagesToday,
  onOpenInbox,
}: WhatsAppKpiCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
    );
  }

  const dash = '—';

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      <VoiceKpiCard
        label="Open conversations"
        value={openConversations ?? dash}
        hint="Active threads"
        icon="message-circle"
        tone="brand"
        onClick={onOpenInbox}
      />
      <VoiceKpiCard
        label="Unread messages"
        value={unreadTotal ?? dash}
        hint="Across all threads"
        icon="mail"
        tone={(unreadTotal ?? 0) > 0 ? 'watch' : 'neutral'}
        onClick={onOpenInbox}
      />
      <VoiceKpiCard
        label="Needs human review"
        value={humanReview ?? dash}
        hint="Pending handover"
        icon="user-check"
        tone={(humanReview ?? 0) > 0 ? 'critical' : 'neutral'}
        onClick={onOpenInbox}
      />
      <VoiceKpiCard
        label="Failed messages"
        value={failedMessages ?? dash}
        hint={failedMessages == null ? 'Per-thread only' : 'In selected thread'}
        icon="alert-circle"
        tone={(failedMessages ?? 0) > 0 ? 'critical' : 'neutral'}
      />
      <VoiceKpiCard
        label="AI messages"
        value={aiMessagesToday ?? dash}
        hint="Total AI-sent (org)"
        icon="sparkles"
        tone="brand"
      />
    </div>
  );
}
