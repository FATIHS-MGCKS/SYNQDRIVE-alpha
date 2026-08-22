import { MessageSquare } from 'lucide-react';
import { EmptyState } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';

interface CommunicationEmptyStateProps {
  compact?: boolean;
}

export function CommunicationEmptyState({ compact }: CommunicationEmptyStateProps) {
  const { t } = useLanguage();

  return (
    <EmptyState
      compact={compact}
      icon={<MessageSquare className="h-5 w-5" aria-hidden />}
      title={t('communication.empty.selectConversation.title')}
      description={t('communication.empty.selectConversation.description')}
      className="h-full"
    />
  );
}
