import { Skeleton } from '../../../components/ui/skeleton';
import { useLanguage } from '../../../i18n/LanguageContext';
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
  const { t } = useLanguage();

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
        label={t('whatsapp.kpi.openConversations')}
        value={openConversations ?? dash}
        hint={t('whatsapp.kpi.openConversationsHint')}
        icon="message-circle"
        tone="brand"
        onClick={onOpenInbox}
      />
      <VoiceKpiCard
        label={t('whatsapp.kpi.unreadMessages')}
        value={unreadTotal ?? dash}
        hint={t('whatsapp.kpi.unreadMessagesHint')}
        icon="mail"
        tone={(unreadTotal ?? 0) > 0 ? 'watch' : 'neutral'}
        onClick={onOpenInbox}
      />
      <VoiceKpiCard
        label={t('whatsapp.kpi.humanReview')}
        value={humanReview ?? dash}
        hint={t('whatsapp.kpi.humanReviewHint')}
        icon="user-check"
        tone={(humanReview ?? 0) > 0 ? 'critical' : 'neutral'}
        onClick={onOpenInbox}
      />
      <VoiceKpiCard
        label={t('whatsapp.kpi.failedMessages')}
        value={failedMessages ?? dash}
        hint={
          failedMessages == null
            ? t('whatsapp.kpi.failedMessagesHintGlobal')
            : t('whatsapp.kpi.failedMessagesHintThread')
        }
        icon="alert-circle"
        tone={(failedMessages ?? 0) > 0 ? 'critical' : 'neutral'}
      />
      <VoiceKpiCard
        label={t('whatsapp.kpi.aiMessages')}
        value={aiMessagesToday ?? dash}
        hint={t('whatsapp.kpi.aiMessagesHint')}
        icon="sparkles"
        tone="brand"
      />
    </div>
  );
}
