import { Workflow } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { canAccessWorkflowAutomations } from './communication-channels-permissions';

interface CommunicationAutomationsPaneProps {
  onOpenWorkflowAutomation: () => void;
}

export function CommunicationAutomationsPane({
  onOpenWorkflowAutomation,
}: CommunicationAutomationsPaneProps) {
  const { t } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const canAccess = canAccessWorkflowAutomations(hasPermission);

  return (
    <div
      className="surface-premium mx-auto flex max-w-2xl flex-col gap-4 rounded-2xl border border-border/40 p-5 shadow-[var(--shadow-1)]"
      data-testid="communication-automations-pane"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[color:var(--brand)]/10 p-2 text-[color:var(--brand)]">
          <Workflow className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t('communication.automations.title')}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('communication.automations.description')}
          </p>
        </div>
      </div>

      {canAccess ? (
        <Button
          type="button"
          data-testid="communication-automations-open"
          onClick={onOpenWorkflowAutomation}
        >
          {t('communication.automations.open')}
        </Button>
      ) : (
        <p className="text-[11px] text-muted-foreground" data-testid="communication-automations-denied">
          {t('communication.automations.accessDenied')}
        </p>
      )}
    </div>
  );
}
