import { Shield } from 'lucide-react';
import { EmptyState } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { hasCommunicationPermission } from '../../lib/communication-permissions';
import { CommunicationCenterShell } from './CommunicationCenterShell';

export function CommunicationCenterView() {
  const { t } = useLanguage();
  const { hasPermission, userRole } = useRentalOrg();
  const canRead = hasCommunicationPermission(hasPermission, 'read', userRole);

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

  return <CommunicationCenterShell />;
}
