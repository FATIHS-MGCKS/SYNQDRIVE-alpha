import { Inbox } from 'lucide-react';
import { PageHeader } from '../../../components/patterns/page-header';
import { useLanguage } from '../../i18n/LanguageContext';

export function CommunicationCenterHeader() {
  const { t } = useLanguage();

  return (
    <PageHeader
      variant="full"
      title={t('communication.center.title')}
      description={t('communication.center.subtitle')}
      icon={<Inbox className="h-4 w-4" aria-hidden />}
    />
  );
}
