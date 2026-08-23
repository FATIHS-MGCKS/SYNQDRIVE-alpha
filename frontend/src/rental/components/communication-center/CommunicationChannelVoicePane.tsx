import { Button } from '../../../components/ui/button';
import { Skeleton } from '../../../components/ui/skeleton';
import { ErrorState } from '../../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { useVoiceAgentSettings } from '../voice-assistant/useVoiceAgentSettings';
import { CommunicationChannelStatusChip } from './communication-channel-status';
import { resolveVoiceSettingsStatus } from './communication-settings-status';
import { canManageVoiceSettings } from './communication-channels-permissions';

interface CommunicationChannelVoicePaneProps {
  enabled?: boolean;
  onOpenConversations: () => void;
  onOpenVoiceAssistant: (options: {
    opsTab: 'overview' | 'settings' | 'analytics' | 'automations';
    wizardStep?: 'tests' | null;
  }) => void;
}

export function CommunicationChannelVoicePane({
  enabled = true,
  onOpenConversations,
  onOpenVoiceAssistant,
}: CommunicationChannelVoicePaneProps) {
  const { t } = useLanguage();
  const { orgId, hasPermission, userRole } = useRentalOrg();
  const canManage = canManageVoiceSettings(hasPermission, userRole);
  const voice = useVoiceAgentSettings({ orgId, enabled: enabled && canManage });
  const status = resolveVoiceSettingsStatus(voice.assistant);

  if (voice.loading) {
    return (
      <div className="space-y-3" data-testid="communication-channel-voice-loading">
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  if (voice.error) {
    return (
      <ErrorState
        compact
        title={t('communication.settings.loadError')}
        error={t('communication.settings.voice.loadError')}
        onRetry={() => void voice.reload()}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="communication-channel-voice">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t('communication.channels.voice')}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('communication.channels.providerLabel')}: Twilio / ElevenLabs
          </p>
        </div>
        <CommunicationChannelStatusChip
          status={status}
          label={t(`communication.settings.status.${status}` as const)}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t('communication.channels.voice.specializedHint')}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-3 text-left"
          data-testid="communication-voice-link-settings"
          onClick={() => onOpenVoiceAssistant({ opsTab: 'settings' })}
        >
          <span className="block text-[11px] font-semibold">
            {t('communication.channels.voice.configureAgent')}
          </span>
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
            {t('communication.channels.voice.configureAgentHint')}
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-3 text-left"
          data-testid="communication-voice-link-analytics"
          onClick={() => onOpenVoiceAssistant({ opsTab: 'analytics' })}
        >
          <span className="block text-[11px] font-semibold">
            {t('communication.channels.voice.analytics')}
          </span>
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
            {t('communication.channels.voice.analyticsHint')}
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-3 text-left"
          data-testid="communication-voice-link-telephony"
          onClick={() => onOpenVoiceAssistant({ opsTab: 'settings' })}
        >
          <span className="block text-[11px] font-semibold">
            {t('communication.channels.voice.telephony')}
          </span>
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
            {t('communication.channels.voice.telephonyHint')}
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-3 text-left"
          data-testid="communication-voice-link-test"
          onClick={() => onOpenVoiceAssistant({ opsTab: 'settings', wizardStep: 'tests' })}
        >
          <span className="block text-[11px] font-semibold">
            {t('communication.channels.voice.testAssistant')}
          </span>
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
            {t('communication.channels.voice.testAssistantHint')}
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-3 text-left"
          data-testid="communication-voice-link-automations"
          onClick={() => onOpenVoiceAssistant({ opsTab: 'automations' })}
        >
          <span className="block text-[11px] font-semibold">
            {t('communication.channels.voice.automations')}
          </span>
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
            {t('communication.channels.voice.automationsHint')}
          </span>
        </Button>
      </div>

      <Button
        type="button"
        className="w-full sm:w-auto"
        data-testid="communication-voice-open-conversations"
        onClick={onOpenConversations}
      >
        {t('communication.channels.openConversationsVoice')}
      </Button>
    </div>
  );
}
