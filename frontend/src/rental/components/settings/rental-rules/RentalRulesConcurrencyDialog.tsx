import { AlertTriangle } from 'lucide-react';
import { FormDialog } from '../../../../components/patterns';

export interface RentalRulesConflictViewModel {
  title: string;
  description: string;
  yourChangesLabel: string;
  yourChangesSummary: string;
  serverChangesLabel: string;
  serverChangesSummary: string;
  reloadLabel: string;
  editAgainLabel: string;
  cancelLabel: string;
}

interface RentalRulesConcurrencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: RentalRulesConflictViewModel | null;
  onReload: () => void;
  onEditAgain: () => void;
}

export function RentalRulesConcurrencyDialog({
  open,
  onOpenChange,
  model,
  onReload,
  onEditAgain,
}: RentalRulesConcurrencyDialogProps) {
  if (!model) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      maxWidthClassName="sm:max-w-lg"
      title={model.title}
      description={model.description}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <button type="button" className="sq-btn sq-btn-ghost min-h-9" onClick={() => onOpenChange(false)}>
            {model.cancelLabel}
          </button>
          <button type="button" className="sq-btn sq-btn-ghost min-h-9" onClick={onEditAgain}>
            {model.editAgainLabel}
          </button>
          <button type="button" className="sq-btn sq-btn-primary min-h-9" onClick={onReload}>
            {model.reloadLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[13px] leading-relaxed text-foreground">{model.description}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {model.yourChangesLabel}
            </h4>
            <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
              {model.yourChangesSummary}
            </p>
          </section>
          <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {model.serverChangesLabel}
            </h4>
            <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
              {model.serverChangesSummary}
            </p>
          </section>
        </div>
      </div>
    </FormDialog>
  );
}
