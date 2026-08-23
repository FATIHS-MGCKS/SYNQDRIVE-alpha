import { useCallback, useState } from 'react';
import { MoreHorizontal, Zap } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationQuickActionAvailability } from '../../../lib/communication/types';
import type { TranslationKey } from '../../i18n/translations/en';

interface CommunicationQuickActionsProps {
  actions: CommunicationQuickActionAvailability[];
  loading?: boolean;
  runningActionId?: string | null;
  pendingConfirm?: CommunicationQuickActionAvailability | null;
  onExecute: (action: CommunicationQuickActionAvailability) => void;
  onConfirmPending?: () => void;
  onCancelPending?: () => void;
}

export function CommunicationQuickActions({
  actions,
  loading,
  runningActionId,
  pendingConfirm,
  onExecute,
  onConfirmPending,
  onCancelPending,
}: CommunicationQuickActionsProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const enabledActions = actions.filter((action) => action.enabled);

  const handleSelect = useCallback(
    (action: CommunicationQuickActionAvailability) => {
      setOpen(false);
      onExecute(action);
    },
    [onExecute],
  );

  const confirmLabelKey = pendingConfirm?.confirmKey
    ? (pendingConfirm.confirmKey as TranslationKey)
    : null;

  if (loading || enabledActions.length === 0) return null;

  return (
    <>
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
          {enabledActions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              disabled={runningActionId === action.id}
              onClick={() => handleSelect(action)}
            >
              {runningActionId === action.id
                ? '…'
                : t(action.labelKey as TranslationKey)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={Boolean(pendingConfirm)} onOpenChange={(next) => !next && onCancelPending?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm ? t(pendingConfirm.labelKey as TranslationKey) : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmLabelKey && t(confirmLabelKey)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelPending}>
              {t('communication.quickActions.confirm.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmPending}>
              {t('communication.quickActions.confirm.proceed')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { CommunicationAiSuggestionButton } from './CommunicationAiSuggestionButton';
