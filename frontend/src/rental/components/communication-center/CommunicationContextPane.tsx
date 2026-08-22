import { Layers } from 'lucide-react';
import { EmptyState } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';

interface CommunicationContextPaneProps {
  selectedConversationId: string | null;
  onClose?: () => void;
}

export function CommunicationContextPane({
  selectedConversationId,
  onClose,
}: CommunicationContextPaneProps) {
  const { t } = useLanguage();

  if (!selectedConversationId) return null;

  return (
    <aside
      data-testid="communication-context-pane"
      className="flex h-full min-h-0 flex-col border-border/40 bg-background"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
        <h2 className="text-[13px] font-semibold text-foreground">{t('communication.context.title')}</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40 xl:hidden"
          >
            {t('communication.context.close')}
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EmptyState
          compact
          icon={<Layers className="h-5 w-5" aria-hidden />}
          title={t('communication.context.shellEmpty.title')}
          description={t('communication.context.shellEmpty.description')}
          className="h-full"
        />
      </div>
    </aside>
  );
}
