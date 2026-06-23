import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage, type WhatsAppConversationContext } from '../../../lib/api';
import type { WhatsAppQuickActionId } from '../../../lib/api';

interface WhatsAppQuickActionsProps {
  orgId: string | undefined;
  conversationId: string;
  context: WhatsAppConversationContext | null;
  onRefresh: () => void;
}

export function WhatsAppQuickActions({
  orgId,
  conversationId,
  context,
  onRefresh,
}: WhatsAppQuickActionsProps) {
  const [running, setRunning] = useState<string | null>(null);

  const runAction = useCallback(
    async (actionId: WhatsAppQuickActionId, requiresConfirm?: boolean) => {
      if (!orgId) return;
      if (requiresConfirm && !window.confirm(`Run "${actionId.replace(/_/g, ' ')}"?`)) return;

      setRunning(actionId);
      try {
        await api.whatsapp.executeQuickAction(orgId, conversationId, actionId, {});
        toast.success('Action completed');
        onRefresh();
      } catch (err) {
        toast.error('Action failed', { description: getErrorMessage(err) });
      } finally {
        setRunning(null);
      }
    },
    [orgId, conversationId, onRefresh],
  );

  if (!context?.quickActions?.length) return null;

  return (
    <section className="rounded-xl border border-border/40 bg-muted/10 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon name="zap" className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Quick actions
        </h4>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {context.quickActions.map(action => (
          <button
            key={action.id}
            type="button"
            disabled={!action.enabled || running === action.id}
            title={action.enabled ? action.label : action.reason ?? 'Not available'}
            onClick={() => void runAction(action.id, action.requiresConfirm)}
            className={cn(
              'sq-press rounded-lg border px-2 py-1 text-[9px] font-semibold',
              action.enabled
                ? 'border-border/60 text-foreground hover:bg-muted'
                : 'cursor-not-allowed border-border/30 text-muted-foreground opacity-60',
            )}
          >
            {running === action.id ? '…' : action.label}
          </button>
        ))}
      </div>
      {context.whatsapp.customerOptedOut && (
        <p className="mt-2 text-[9px] text-[color:var(--status-watch)]">
          Customer opted out — outbound reminders blocked.
        </p>
      )}
    </section>
  );
}
