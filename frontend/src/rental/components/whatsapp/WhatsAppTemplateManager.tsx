import { Icon } from '../ui/Icon';
import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { StatusChip } from '../../../components/patterns';
import type { WhatsAppTemplate } from '../../../lib/api';
import { TEMPLATE_CATEGORY_LABELS } from './whatsapp.ops';

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
          <h2 className="text-[14px] font-semibold text-foreground">Message templates</h2>
          <p className="text-[11px] text-muted-foreground">
            Use approved templates outside the 24h service window. Meta approval required for production.
          </p>
        </div>
        {onCreateDraft && (
          <button
            type="button"
            onClick={onCreateDraft}
            className="sq-press rounded-xl border border-border/60 px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-muted"
          >
            New draft
          </button>
        )}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create local drafts for booking confirmation, pickup reminders, and more."
          action={
            onCreateDraft ? (
              <button
                type="button"
                onClick={onCreateDraft}
                className="sq-press rounded-xl bg-[color:var(--brand)] px-4 py-2 text-[11px] font-semibold text-white"
              >
                Create first template
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map(t => (
            <article
              key={t.id}
              className="sq-card rounded-xl border border-border/40 p-4 shadow-[var(--shadow-1)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[12px] font-semibold text-foreground">{t.name}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {TEMPLATE_CATEGORY_LABELS[t.category] ?? t.category} · {t.language}
                  </p>
                </div>
                <StatusChip tone={templateStatusTone(t.providerStatus)}>
                  {t.providerStatus.replace('_', ' ')}
                </StatusChip>
              </div>
              <p className="mt-3 line-clamp-3 rounded-lg bg-muted/30 p-2.5 font-mono text-[10px] leading-relaxed text-foreground">
                {t.bodyTemplate}
              </p>
              {t.variableSchema && (
                <p className="mt-2 text-[9px] text-muted-foreground">
                  Variables: {Object.keys(t.variableSchema).join(', ') || '—'}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
