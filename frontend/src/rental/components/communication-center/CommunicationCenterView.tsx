import { Shield } from 'lucide-react';
import { EmptyState } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { hasCommunicationPermission, hasVoiceAssistantAdminPermission } from '../../lib/communication-permissions';
import { CommunicationCenterShell } from './CommunicationCenterShell';
import type { CommunicationCenterUrlState } from './communication-center-navigation';

interface CommunicationCenterViewProps {
  onOpenVoiceAssistant?: (options: {
    opsTab: 'overview' | 'settings' | 'analytics' | 'automations';
    wizardStep?: 'tests' | null;
  }) => void;
  onOpenEmailSettings?: () => void;
  onOpenWorkflowAutomation?: () => void;
  initialState?: Partial<CommunicationCenterUrlState>;
}

export function CommunicationCenterView({
  onOpenVoiceAssistant,
  onOpenEmailSettings,
  onOpenWorkflowAutomation,
  initialState,
}: CommunicationCenterViewProps) {
  const { t } = useLanguage();
  const { hasPermission, userRole, loading } = useRentalOrg();
  const canRead =
    hasCommunicationPermission(hasPermission, 'read', userRole) ||
    hasVoiceAssistantAdminPermission(hasPermission, 'read', userRole);

  if (loading) {
    return null;
  }

  if (!canRead) {
    return (
      <div data-testid="communication-center-access-denied" className="py-12">
        <EmptyState
          icon={<Shield className="h-5 w-5" aria-hidden />}
          title={t('communication.accessDenied.title')}
          description={t('communication.accessDenied.description')}
        />
      </div>
    );
  }

  return (
    <CommunicationCenterShell
      initialState={initialState}
      onOpenVoiceAssistant={onOpenVoiceAssistant}
      onOpenEmailSettings={onOpenEmailSettings}
      onOpenWorkflowAutomation={onOpenWorkflowAutomation}
    />
  );
}
