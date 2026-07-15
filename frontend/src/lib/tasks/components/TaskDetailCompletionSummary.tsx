import { cn } from '../../../components/ui/utils';
import type { TaskDetailCompletionSummaryModel } from '../taskDetailActions.utils';

export interface TaskDetailCompletionSummaryProps {
  summary: TaskDetailCompletionSummaryModel;
  mobile?: boolean;
  onOpenSuccessorTask?: (taskId: string) => void;
}

export function TaskDetailCompletionSummary({
  summary,
  mobile = false,
  onOpenSuccessorTask,
}: TaskDetailCompletionSummaryProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/70 bg-muted/15 px-3 py-3',
        mobile ? 'text-sm' : 'text-[12px]',
      )}
      data-testid="task-completion-summary"
    >
      <p className="font-semibold text-foreground">
        {summary.isCancelled
          ? 'Aufgabe storniert'
          : summary.isAutoResolved
            ? 'Automatisch aufgelöst'
            : summary.isSuperseded
              ? 'Automatisch beendet'
              : 'Aufgabe abgeschlossen'}
      </p>

      {summary.completedAtLabel && (
        <p className="mt-1 text-muted-foreground">Abgeschlossen am {summary.completedAtLabel}</p>
      )}

      {summary.completedByLabel && !summary.isAutoResolved && !summary.isSuperseded && (
        <p className="mt-1 text-muted-foreground">Von {summary.completedByLabel}</p>
      )}

      {summary.isAutoResolved && summary.autoResolvedReason && (
        <p className="mt-2 text-foreground/90">{summary.autoResolvedReason}</p>
      )}

      {summary.isSuperseded && summary.supersededReason && (
        <p className="mt-2 text-foreground/90">{summary.supersededReason}</p>
      )}

      {summary.resolutionCodeLabel && !summary.isAutoResolved && !summary.isSuperseded && (
        <p className="mt-2 text-muted-foreground">Abschluss-Code: {summary.resolutionCodeLabel}</p>
      )}

      {summary.resolutionNote && (
        <p className="mt-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-foreground/90">
          {summary.resolutionNote}
        </p>
      )}

      {summary.isSuperseded && summary.supersededByTaskId && onOpenSuccessorTask && (
        <button
          type="button"
          onClick={() => onOpenSuccessorTask(summary.supersededByTaskId!)}
          className={cn(
            'sq-press mt-3 font-semibold text-[color:var(--brand)]',
            mobile ? 'min-h-[44px] text-sm' : 'text-[12px]',
          )}
        >
          Ersatz-Aufgabe öffnen
        </button>
      )}
    </div>
  );
}
