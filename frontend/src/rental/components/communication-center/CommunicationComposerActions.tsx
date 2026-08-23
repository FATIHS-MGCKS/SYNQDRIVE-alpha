import { useCallback, useState } from 'react';
import { MoreHorizontal, Sparkles, Zap } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { WhatsAppConversationContext } from '../../../lib/api';

interface CommunicationQuickActionsProps {
  context: WhatsAppConversationContext | null;
  loading?: boolean;
  runningActionId?: string | null;
  onExecute: (actionId: string, requiresConfirm?: boolean) => void;
}

export function CommunicationQuickActions({
  context,
  loading,
  runningActionId,
  onExecute,
}: CommunicationQuickActionsProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const actions = context?.quickActions?.filter((action) => action.enabled) ?? [];

  const handleSelect = useCallback(
    (actionId: string, requiresConfirm?: boolean) => {
      setOpen(false);
      void onExecute(actionId, requiresConfirm);
    },
    [onExecute],
  );

  if (loading || actions.length === 0) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 text-[11px]"
          aria-label={t('communication.quickActions.label')}
          data-testid="communication-quick-actions-trigger"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{t('communication.quickActions.label')}</span>
          <MoreHorizontal className="h-3.5 w-3.5 sm:hidden" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[min(18rem,calc(100vw-2rem))]">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            disabled={runningActionId === action.id}
            onClick={() => handleSelect(action.id, action.requiresConfirm)}
          >
            {runningActionId === action.id ? '…' : action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CommunicationAiSuggestionButton({
  disabled,
  loading,
  onClick,
}: {
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 px-2 text-[11px]"
      disabled={disabled || loading}
      aria-label={t('communication.aiSuggestion.generate')}
      data-testid="communication-ai-suggestion-trigger"
      onClick={onClick}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{t('communication.aiSuggestion.label')}</span>
    </Button>
  );
}
