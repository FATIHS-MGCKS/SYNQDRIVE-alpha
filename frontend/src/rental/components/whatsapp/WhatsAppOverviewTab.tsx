import { Icon } from '../ui/Icon';
import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { StatusChip } from '../../../components/patterns';
import type { WhatsAppConfig, WhatsAppConversation, WhatsAppStats } from '../../../lib/api';
import { AI_MODE_META, buildReadinessChecks, type ReadinessCheck, type WhatsAppTab } from './whatsapp.ops';
import { WhatsAppReadinessStrip } from './WhatsAppReadinessStrip';
import { WhatsAppKpiCards } from './WhatsAppKpiCards';
import type { WhatsAppTemplate } from '../../../lib/api';

interface WhatsAppOverviewTabProps {
  config: WhatsAppConfig | null;
  stats: WhatsAppStats | null;
  templates: WhatsAppTemplate[];
  conversations: WhatsAppConversation[];
  loadError: string | null;
  onNavigate: (tab: WhatsAppTab) => void;
  onConnect: () => void;
  onRetry: () => void;
}

export function WhatsAppOverviewTab({
  config,
  stats,
  templates,
  conversations,
  loadError,
  onNavigate,
  onConnect,
  onRetry,
}: WhatsAppOverviewTabProps) {
  const checks = buildReadinessChecks(config, stats, templates);
  const humanReview = conversations.filter(c => c.status === 'PENDING_HUMAN').length;
  const recent = [...conversations]
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
    .slice(0, 5);

  if (loadError) {
    return <ErrorState title="Could not load WhatsApp" description={loadError} onRetry={onRetry} />;
  }

  return (
    <div className="space-y-4">
      <WhatsAppReadinessStrip checks={checks} onNavigate={onNavigate} />
      <WhatsAppKpiCards
        openConversations={stats?.openConversations ?? null}
        unreadTotal={stats?.unreadTotal ?? null}
        humanReview={humanReview}
        failedMessages={null}
        aiMessagesToday={stats?.aiMessages ?? null}
        onOpenInbox={() => onNavigate('inbox')}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="sq-card rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
          <h3 className="text-[12px] font-semibold text-foreground">Setup checklist</h3>
          <ul className="mt-3 space-y-2">
            {checks.map((c: ReadinessCheck) => (
              <li key={c.id} className="flex items-start gap-2 text-[11px]">
                <Icon
                  name={c.status === 'ok' ? 'check-circle-2' : c.status === 'error' ? 'x-circle' : 'alert-circle'}
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    c.status === 'ok'
                      ? 'text-[color:var(--status-positive)]'
                      : c.status === 'error'
                        ? 'text-[color:var(--status-critical)]'
                        : 'text-[color:var(--status-watch)]'
                  }`}
                />
                <span className="text-foreground">{c.label}</span>
                <span className="text-muted-foreground">— {c.detail}</span>
              </li>
            ))}
          </ul>
          {!config?.isConnected && (
            <button
              type="button"
              onClick={onConnect}
              className="sq-press mt-4 rounded-xl bg-[color:var(--brand)] px-3 py-2 text-[11px] font-semibold text-white"
            >
              Start setup wizard
            </button>
          )}
        </section>

        <section className="sq-card rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-foreground">Recent activity</h3>
            <button
              type="button"
              onClick={() => onNavigate('inbox')}
              className="text-[10px] font-semibold text-[color:var(--brand)] hover:underline"
            >
              Open inbox
            </button>
          </div>
          {recent.length === 0 ? (
            <EmptyState compact title="No conversations yet" description="Inbound messages appear after webhook delivery." />
          ) : (
            <ul className="mt-2 divide-y divide-border/30">
              {recent.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-foreground">
                      {c.contactName ?? c.contactPhone}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">{c.lastMessagePreview}</p>
                  </div>
                  {c.unreadCount > 0 && (
                    <StatusChip tone="watch">
                      {c.unreadCount}
                    </StatusChip>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {config && (
        <section className="sq-card rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
          <h3 className="text-[12px] font-semibold text-foreground">AI assistance summary</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {AI_MODE_META[config.aiMode].description}. Sensitive cases remain human review.
          </p>
        </section>
      )}
    </div>
  );
}
