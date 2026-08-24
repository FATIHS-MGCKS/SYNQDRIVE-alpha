import { useMemo, useState, useEffect } from 'react';
import { EmptyState } from '../../../components/patterns/states';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { useAppTheme } from '../../../context/AppThemeContext';
import { WhatsAppBusinessSettings } from '../whatsapp/WhatsAppBusinessSettings';
import { WhatsAppTemplateManager } from '../whatsapp/WhatsAppTemplateManager';
import { WhatsAppKpiCards } from '../whatsapp/WhatsAppKpiCards';
import { WhatsAppReadinessStrip } from '../whatsapp/WhatsAppReadinessStrip';
import { buildReadinessChecks } from '../whatsapp/whatsapp.ops';
import { useWhatsAppBusinessSettings } from '../whatsapp/useWhatsAppBusinessSettings';
import type { CommunicationChannelsSection, CommunicationVoiceIntent, CommunicationWhatsAppChannelSubview } from './communication-center.types';
import type { CommunicationCenterUrlState } from './communication-center-navigation';
import { VoiceAssistantView } from '../VoiceAssistantView';
import {
  mapVoiceAssistantStateToCanonicalVoiceIntent,
  mapVoiceIntentToAssistantState,
} from './legacy-communication-navigation';
import { CommunicationChannelsNav } from './CommunicationChannelsNav';
import { CommunicationChannelsLanding } from './CommunicationChannelsLanding';
import { CommunicationChannelVoicePane } from './CommunicationChannelVoicePane';
import { CommunicationChannelEmailPane } from './CommunicationChannelEmailPane';
import { SmsSettingsPanel } from './SmsSettingsPanel';
import {
  canAccessCommunicationChannelsSection,
  canManageWhatsAppSettings,
} from './communication-channels-permissions';
import { useWhatsAppChannelPane } from './useWhatsAppChannelPane';

type WhatsAppChannelSubview = 'overview' | 'configuration' | 'templates';

interface CommunicationChannelsPaneProps {
  activeSection: CommunicationChannelsSection;
  enabled?: boolean;
  whatsappChannelSubview?: CommunicationWhatsAppChannelSubview;
  voiceIntent?: CommunicationVoiceIntent | null;
  voiceWizardStep?: 'tests' | null;
  onSectionChange: (section: CommunicationChannelsSection) => void;
  onWhatsappSubviewChange?: (subview: CommunicationWhatsAppChannelSubview) => void;
  onVoiceCanonicalStateChange?: (
    state: Pick<CommunicationCenterUrlState, 'voiceIntent' | 'voiceWizardStep'>,
  ) => void;
  onOpenConversations: (channel: 'whatsapp' | 'voice' | 'sms') => void;
  onOpenVoiceAssistant: (options: { opsTab: 'overview' | 'settings' | 'analytics' | 'automations'; wizardStep?: 'tests' | null }) => void;
  onOpenEmailSettings: () => void;
}

export function CommunicationChannelsPane({
  activeSection,
  enabled = true,
  whatsappChannelSubview = 'overview',
  voiceIntent = null,
  voiceWizardStep = null,
  onSectionChange,
  onWhatsappSubviewChange,
  onVoiceCanonicalStateChange,
  onOpenConversations,
  onOpenVoiceAssistant,
  onOpenEmailSettings,
}: CommunicationChannelsPaneProps) {
  const { t } = useLanguage();
  const { isDarkMode } = useAppTheme();
  const { orgId, hasPermission, userRole } = useRentalOrg();
  const [whatsappSubview, setWhatsappSubview] = useState<WhatsAppChannelSubview>(whatsappChannelSubview);

  const section = useMemo(() => activeSection, [activeSection]);
  const canAccessSection = canAccessCommunicationChannelsSection(
    section,
    hasPermission,
    userRole,
  );
  const canManageWhatsapp = canManageWhatsAppSettings(hasPermission, userRole);
  const whatsappSettings = useWhatsAppBusinessSettings({ orgId, enabled: enabled && canManageWhatsapp });
  const whatsappChannel = useWhatsAppChannelPane({ orgId, enabled: enabled && canManageWhatsapp });

  const readinessChecks = useMemo(
    () => buildReadinessChecks(whatsappSettings.config, whatsappChannel.stats, whatsappChannel.templates),
    [whatsappChannel.stats, whatsappChannel.templates, whatsappSettings.config],
  );

  useEffect(() => {
    setWhatsappSubview(whatsappChannelSubview);
  }, [whatsappChannelSubview]);

  const handleWhatsappSubviewChange = (subview: WhatsAppChannelSubview) => {
    setWhatsappSubview(subview);
    onWhatsappSubviewChange?.(subview);
  };

  const showEmbeddedVoiceSpecialized =
    section === 'voice' &&
    voiceIntent != null &&
    voiceIntent !== 'overview' &&
    voiceIntent !== 'conversations';

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row"
      data-testid="communication-channels-shell"
    >
      <CommunicationChannelsNav
        activeSection={section}
        hasPermission={hasPermission}
        membershipRole={userRole}
        onChange={onSectionChange}
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-1">
        {!canAccessSection ? (
          <EmptyState
            compact
            title={t('communication.channels.accessDenied.title')}
            description={t('communication.channels.accessDenied.description')}
          />
        ) : section === 'overview' ? (
          <CommunicationChannelsLanding enabled={enabled} onNavigate={onSectionChange} />
        ) : section === 'whatsapp' ? (
          <div className="space-y-4" data-testid="communication-channel-whatsapp">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {t('communication.channels.whatsapp')}
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('communication.channels.providerLabel')}: Meta
                </p>
              </div>
              <button
                type="button"
                className="sq-press rounded-lg border border-border/40 px-3 py-2 text-[11px] font-semibold text-foreground"
                onClick={() => onOpenConversations('whatsapp')}
              >
                {t('communication.channels.openConversations')}
              </button>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-border/40 pb-2">
              {(['overview', 'configuration', 'templates'] as const).map((subview) => (
                <button
                  key={subview}
                  type="button"
                  data-testid={`communication-whatsapp-subview-${subview}`}
                  className={cn(
                    'sq-press rounded-lg px-3 py-1.5 text-[10px] font-semibold',
                    whatsappSubview === subview
                      ? 'bg-[color:var(--brand)]/10 text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => handleWhatsappSubviewChange(subview)}
                >
                  {t(`communication.channels.whatsapp.subview.${subview}` as const)}
                </button>
              ))}
            </div>

            {whatsappSubview === 'overview' && (
              <div className="space-y-4">
                <WhatsAppReadinessStrip
                  checks={readinessChecks}
                  onNavigate={(tab) => {
                    if (tab === 'inbox') {
                      onOpenConversations('whatsapp');
                      return;
                    }
                    if (tab === 'templates') {
                      handleWhatsappSubviewChange('templates');
                      return;
                    }
                    if (tab === 'settings') {
                      handleWhatsappSubviewChange('configuration');
                      return;
                    }
                    handleWhatsappSubviewChange('overview');
                  }}
                />
                <WhatsAppKpiCards
                  openConversations={whatsappChannel.stats?.openConversations ?? null}
                  unreadTotal={whatsappChannel.stats?.unreadTotal ?? null}
                  humanReview={null}
                  failedMessages={null}
                  aiMessagesToday={whatsappChannel.stats?.aiMessages ?? null}
                  onOpenInbox={() => onOpenConversations('whatsapp')}
                />
              </div>
            )}

            {whatsappSubview === 'configuration' && (
              <WhatsAppBusinessSettings enabled={enabled && canManageWhatsapp} />
            )}

            {whatsappSubview === 'templates' && (
              <WhatsAppTemplateManager
                templates={whatsappChannel.templates}
                loading={whatsappChannel.templatesLoading}
                error={whatsappChannel.templatesError}
                onRetry={() => void whatsappChannel.reload()}
              />
            )}
          </div>
        ) : section === 'voice' ? (
          showEmbeddedVoiceSpecialized ? (
            <div data-testid="communication-voice-specialized-embedded">
              <VoiceAssistantView
                isDarkMode={isDarkMode}
                suppressLegacyUrlSync
                initialVoiceState={mapVoiceIntentToAssistantState(voiceIntent!, {
                  wizardStep: voiceWizardStep,
                })}
                onCanonicalVoiceStateChange={(next) => {
                  onVoiceCanonicalStateChange?.(mapVoiceAssistantStateToCanonicalVoiceIntent(next));
                }}
              />
            </div>
          ) : (
            <CommunicationChannelVoicePane
              enabled={enabled}
              onOpenConversations={() => onOpenConversations('voice')}
              onOpenVoiceAssistant={onOpenVoiceAssistant}
            />
          )
        ) : section === 'sms' ? (
          <div data-testid="communication-channel-sms">
            <SmsSettingsPanel enabled={enabled} />
          </div>
        ) : (
          <CommunicationChannelEmailPane
            enabled={enabled}
            onOpenEmailSettings={onOpenEmailSettings}
          />
        )}
      </div>
    </div>
  );
}
