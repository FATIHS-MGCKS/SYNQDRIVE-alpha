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
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground xl:hidden"
          >
            {t('communication.context.close')}
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-4">
          {(['customer', 'booking', 'vehicle', 'station', 'assignment'] as const).map((section) => (
            <section key={section} className="border-b border-border/30 pb-3 last:border-b-0">
              <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {t(`communication.context.sections.${section}`)}
              </h3>
              <p className="text-[12px] text-muted-foreground">
                {t('communication.context.emptySection')}
              </p>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
