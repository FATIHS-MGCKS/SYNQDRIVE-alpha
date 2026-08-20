import { Icon } from '../ui/Icon';
import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { WhatsAppTemplate } from '../../../lib/api';
import { labelTemplateCategory } from './whatsapp-i18n';

interface WhatsAppTemplateManagerProps {
  templates: WhatsAppTemplate[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCreateDraft?: () => void;
}

function templateStatusTone(
  status: string,
): 'success' | 'watch' | 'critical' | 'neutral' | 'info' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'PENDING_APPROVAL':
      return 'watch';
    case 'REJECTED':
      return 'critical';
    case 'DRAFT':
      return 'neutral';
    default:
      return 'info';
  }
}

export function WhatsAppTemplateManager({
  templates,
  loading,
  error,
  onRetry,
  onCreateDraft,
}: WhatsAppTemplateManagerProps) {
  const { locale, t } = useLanguage();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Icon name="loader-2" className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={onRetry} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">{t('whatsapp.template.title')}</h2>
          <p className="text-[11px] text-muted-foreground">
            {t('whatsapp.template.subtitle')}
          </p>
        </div>
        {onCreateDraft && (
          <button
            type="button"
            onClick={onCreateDraft}
            className="sq-press rounded-xl border border-border/60 px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-muted"
          >
            {t('whatsapp.template.newDraft')}
          </button>
        )}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          title={t('whatsapp.template.emptyTitle')}
          description={t('whatsapp.template.emptyDesc')}
          action={
            onCreateDraft ? (
              <button
                type="button"
                onClick={onCreateDraft}
                className="sq-press rounded-xl bg-[color:var(--brand)] px-4 py-2 text-[11px] font-semibold text-white"
              >
                {t('whatsapp.template.createFirst')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map(tpl => (
            <article
              key={tpl.id}
              className="surface-premium rounded-xl border border-border/40 p-4 shadow-[var(--shadow-1)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[12px] font-semibold text-foreground">{tpl.name}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {labelTemplateCategory(locale, tpl.category)} · {tpl.language}
                  </p>
                </div>
                <StatusChip tone={templateStatusTone(tpl.providerStatus)}>
                  {tpl.providerStatus.replace('_', ' ')}
                </StatusChip>
              </div>
              <p className="mt-3 line-clamp-3 rounded-lg bg-muted/30 p-2.5 font-mono text-[10px] leading-relaxed text-foreground">
                {tpl.bodyTemplate}
              </p>
              {tpl.variableSchema && (
                <p className="mt-2 text-[9px] text-muted-foreground">
                  {t('whatsapp.template.variables')} {Object.keys(tpl.variableSchema).join(', ') || '—'}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
