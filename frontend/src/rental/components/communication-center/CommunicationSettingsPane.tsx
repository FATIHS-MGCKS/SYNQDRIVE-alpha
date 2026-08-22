import { useMemo } from 'react';
import { EmptyState } from '../../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { WhatsAppBusinessSettings } from '../whatsapp/WhatsAppBusinessSettings';
import { VoiceAgentSettings } from '../voice-assistant/VoiceAgentSettings';
import { CommunicationSettingsNav } from './CommunicationSettingsNav';
import { CommunicationSettingsOverview } from './CommunicationSettingsOverview';
import { SmsSettingsPanel } from './SmsSettingsPanel';
import { normalizeCommunicationSettingsSection } from './communication-center-navigation';
import {
  canAccessCommunicationSettingsSection,
} from './communication-settings-permissions';
import type { CommunicationSettingsSection } from './communication-center.types';

interface CommunicationSettingsPaneProps {
  activeSection: CommunicationSettingsSection;
  enabled?: boolean;
  onSectionChange: (section: CommunicationSettingsSection) => void;
}

export function CommunicationSettingsPane({
  activeSection,
  enabled = true,
  onSectionChange,
}: CommunicationSettingsPaneProps) {
  const { t } = useLanguage();
  const { hasPermission, userRole } = useRentalOrg();

  const section = useMemo(
    () => normalizeCommunicationSettingsSection(activeSection),
    [activeSection],
  );

  const canAccessSection = canAccessCommunicationSettingsSection(
    section,
    hasPermission,
    userRole,
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row"
      data-testid="communication-settings-shell"
    >
      <CommunicationSettingsNav
        activeSection={section}
        hasPermission={hasPermission}
        membershipRole={userRole}
        onChange={onSectionChange}
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-1">
        {!canAccessSection ? (
          <EmptyState
            compact
            title={t('communication.settings.accessDenied.title')}
            description={t('communication.settings.accessDenied.description')}
          />
        ) : section === 'overview' ? (
          <CommunicationSettingsOverview enabled={enabled} onNavigate={onSectionChange} />
        ) : section === 'whatsapp' ? (
          <WhatsAppBusinessSettings enabled={enabled} />
        ) : section === 'voice' ? (
          <VoiceAgentSettings enabled={enabled} />
        ) : (
          <SmsSettingsPanel enabled={enabled} />
        )}
      </div>
    </div>
  );
}
