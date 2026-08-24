import { toast } from 'sonner';
import { ErrorState } from '../../../components/patterns/states';
import { Skeleton } from '../../../components/ui/skeleton';
import { api, getErrorMessage } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { VoiceAssistantBuilder } from './VoiceAssistantBuilder';
import { VoiceTelephonyWizard } from './VoiceTelephonyWizard';
import { useVoiceAgentSettings } from './useVoiceAgentSettings';

interface VoiceAgentSettingsProps {
  enabled?: boolean;
}

export function VoiceAgentSettings({ enabled = true }: VoiceAgentSettingsProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const settings = useVoiceAgentSettings({ orgId, enabled });

  if (settings.loading) {
    return (
      <div className="space-y-3" data-testid="voice-settings-loading">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (settings.error || !settings.assistant || !orgId) {
    return (
      <ErrorState
        compact
        title={t('communication.settings.loadError')}
        error={t('communication.settings.voice.loadError')}
        onRetry={() => void settings.reload()}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="voice-agent-settings">
      <VoiceAssistantBuilder
        orgId={orgId}
        assistant={settings.assistant}
        readiness={settings.readiness}
        voices={settings.voices}
        voicesLoading={settings.voicesLoading}
        voicesError={settings.voicesError}
        onLoadVoices={() => void settings.loadVoices()}
        textField={settings.textField}
        setTextField={settings.setTextField}
        setVoiceSelection={settings.setVoiceSelection}
        hasDraft={settings.hasDraft}
        saving={settings.saving}
        onSave={() => void settings.save()}
        onNavigateTab={() => undefined}
      />
      <VoiceTelephonyWizard
        orgId={orgId}
        assistant={settings.assistant}
        readinessElevenLabsOk={settings.readiness?.checks.find((c) => c.key === 'elevenlabs')?.ok}
        isBusy={settings.saving}
        onAssistantUpdated={settings.setAssistant}
        onNavigateTest={() => undefined}
        onError={(err) =>
          toast.error(t('voice.phone.error'), { description: getErrorMessage(err) })
        }
        loadPhoneNumbers={() => api.voiceAssistant.phoneNumbers(orgId)}
        assignPhoneNumber={(phoneNumberId) =>
          api.voiceAssistant.assignPhoneNumber(orgId, phoneNumberId)
        }
        unassignPhoneNumber={() => api.voiceAssistant.unassignPhoneNumber(orgId)}
        refreshTelephony={() => api.voiceAssistant.refreshTelephony(orgId)}
        updateTelephonySettings={(payload) =>
          api.voiceAssistant.updateTelephonySettings(orgId, payload)
        }
      />
    </div>
  );
}
