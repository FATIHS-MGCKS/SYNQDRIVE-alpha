import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { SectionHeader } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { TaskDetailChecklistModel } from '../taskDetailChecklist.utils';

export interface TaskDetailChecklistSectionProps {
  checklist: TaskDetailChecklistModel;
  mobile?: boolean;
  pendingItemIds?: ReadonlySet<string>;
  onToggle?: (itemId: string, isDone: boolean) => void;
  onRequestOverride?: () => void;
}

export function TaskDetailChecklistSection({
  checklist,
  mobile = false,
  pendingItemIds,
  onToggle,
  onRequestOverride,
}: TaskDetailChecklistSectionProps) {
  const {
    mode,
    items,
    progressLabel,
    progressPercent,
    blocked,
    blockerLabel,
    openRequiredTitles,
    legacyClosedHint,
    canEditItems,
    showAsInteractive,
    overrideCompletion,
  } = checklist;

  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});

  const toggleDescription = (itemId: string) => {
    setExpandedDescriptions((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  };

  return (
    <section className="py-4" data-section="checklist" data-checklist-mode={mode}>
      <SectionHeader
        as="label"
        title="Checkliste"
        description={progressLabel}
        className="mb-2.5"
      />

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Fortschritt</span>
          <span>{progressPercent}%</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Checklistenfortschritt: ${progressLabel}`}
        >
          <div
            className="h-full rounded-full bg-[color:var(--status-positive)] transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {legacyClosedHint && (
        <p
          className={cn(
            'mb-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-muted-foreground',
            mobile ? 'text-xs' : 'text-[11px]',
          )}
          role="note"
        >
          {legacyClosedHint}
        </p>
      )}

      {blocked && blockerLabel && (
        <div
          className={cn(
            'mb-3 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-[color:var(--status-watch)]',
            mobile ? 'text-xs' : 'text-[11px]',
          )}
          role="status"
        >
          <p className="font-medium">{blockerLabel}</p>
          {openRequiredTitles.length > 1 && (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              {openRequiredTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="space-y-1.5" role="list" aria-label="Checklistenpunkte">
        {items.map((item) => {
          const pending = pendingItemIds?.has(item.id) ?? false;
          const interactive = showAsInteractive && Boolean(onToggle) && canEditItems;
          const inputId = `task-checklist-item-${item.id}`;
          const descriptionExpanded = expandedDescriptions[item.id] ?? false;
          const descriptionId = `${inputId}-description`;

          return (
            <li key={item.id}>
              <div
                className={cn(
                  'rounded-lg border px-3 transition-colors',
                  mobile ? 'py-3' : 'py-2.5',
                  item.isDone ? 'border-border/50 bg-muted/20' : 'border-border bg-muted/10',
                  interactive && !pending ? 'hover:bg-muted/20' : '',
                )}
              >
                <div className={cn('flex items-start gap-2.5', mobile && 'min-h-[44px]')}>
                  {interactive ? (
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={item.isDone}
                      disabled={pending}
                      onChange={(event) => onToggle?.(item.id, event.target.checked)}
                      aria-describedby={
                        item.hasDescription && descriptionExpanded ? descriptionId : undefined
                      }
                      className={cn(
                        'shrink-0 accent-[color:var(--status-positive)]',
                        mobile ? 'mt-1 h-5 w-5' : 'mt-0.5 h-4 w-4',
                      )}
                    />
                  ) : (
                    <span
                      className={cn(
                        'flex shrink-0 items-center justify-center rounded border',
                        mobile ? 'mt-0.5 h-5 w-5' : 'mt-0.5 h-4 w-4',
                        item.isDone
                          ? 'border-[color:var(--status-positive)]/40 bg-[color:var(--status-positive)]/10 text-[color:var(--status-positive)]'
                          : 'border-border/70 bg-muted/30 text-muted-foreground',
                      )}
                      aria-hidden="true"
                    >
                      {item.isDone ? (
                        <Check className={mobile ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={3} />
                      ) : (
                        <Circle className={mobile ? 'h-3 w-3' : 'h-2.5 w-2.5'} />
                      )}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    {interactive ? (
                      <label
                        htmlFor={inputId}
                        className={cn(
                          'block cursor-pointer font-medium',
                          mobile ? 'text-sm' : 'text-[12px]',
                          item.isDone ? 'text-muted-foreground line-through' : 'text-foreground',
                          pending && 'cursor-wait opacity-70',
                        )}
                      >
                        {item.title}
                      </label>
                    ) : (
                      <span
                        className={cn(
                          'block font-medium',
                          mobile ? 'text-sm' : 'text-[12px]',
                          item.isDone ? 'text-muted-foreground line-through' : 'text-foreground',
                        )}
                      >
                        {item.title}
                      </span>
                    )}

                    {item.isRequired ? (
                      <span
                        className={cn(
                          'mt-1 inline-flex items-center rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-muted-foreground',
                          mobile ? 'text-[10px]' : 'text-[10px]',
                        )}
                      >
                        Pflicht
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'mt-1 inline-flex items-center rounded border border-dashed border-border/70 px-1.5 py-0.5 text-muted-foreground',
                          mobile ? 'text-[10px]' : 'text-[10px]',
                        )}
                      >
                        Optional
                      </span>
                    )}

                    {item.hasDescription && (
                      <div className="mt-1.5">
                        <button
                          type="button"
                          onClick={() => toggleDescription(item.id)}
                          className={cn(
                            'inline-flex items-center gap-1 font-medium text-[color:var(--brand)] sq-press',
                            mobile ? 'min-h-[36px] text-xs' : 'text-[11px]',
                          )}
                          aria-expanded={descriptionExpanded}
                          aria-controls={descriptionId}
                        >
                          {descriptionExpanded ? (
                            <>
                              Beschreibung ausblenden
                              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                            </>
                          ) : (
                            <>
                              Beschreibung anzeigen
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                            </>
                          )}
                        </button>
                        {descriptionExpanded && (
                          <p
                            id={descriptionId}
                            className={cn(
                              'mt-1 text-muted-foreground',
                              mobile ? 'text-xs' : 'text-[11px]',
                            )}
                          >
                            {item.description}
                          </p>
                        )}
                      </div>
                    )}

                    {pending && (
                      <span className="sr-only" role="status">
                        Wird gespeichert
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {blocked && overrideCompletion.enabled && onRequestOverride && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onRequestOverride}
            className={cn(
              'sq-press w-full rounded-lg border border-border bg-muted/20 font-semibold text-foreground transition-colors hover:bg-muted/35',
              mobile ? 'min-h-[44px] px-4 text-sm' : 'min-h-[36px] px-3 text-[12px]',
            )}
          >
            Trotzdem abschließen (Manager)
          </button>
          {overrideCompletion.disabledReason && (
            <p className={cn('mt-1 text-muted-foreground', mobile ? 'text-xs' : 'text-[10px]')}>
              {overrideCompletion.disabledReason}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
