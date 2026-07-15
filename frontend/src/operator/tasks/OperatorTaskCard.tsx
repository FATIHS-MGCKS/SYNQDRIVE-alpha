import { useMemo, useState } from 'react';
import { PriorityBadge, StatusChip } from '../../components/patterns';
import type { ApiTask } from '../../lib/api';
import { taskStatusLabelDe, taskStatusTone } from '../../rental/lib/task-detail.utils';
import { OperatorGlassCard } from '../components/OperatorGlassCard';
import {
  buildOperatorTaskCardActionPlan,
  buildOperatorTaskCardModel,
  type OperatorTaskCardAction,
  type OperatorTaskCardActionKind,
} from './operatorTaskCard.utils';
import type { FleetVehicleLookup } from './operatorTaskDisplay.utils';

interface Props {
  task: ApiTask;
  vehicleById?: Map<string, FleetVehicleLookup>;
  canOverrideChecklist?: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onAction?: (kind: OperatorTaskCardActionKind) => void | Promise<string | null | void>;
}

function stopCardNavigation(event: React.MouseEvent | React.KeyboardEvent) {
  event.stopPropagation();
}

export function OperatorTaskCard({
  task,
  vehicleById,
  canOverrideChecklist = false,
  disabled,
  onOpen,
  onAction,
}: Props) {
  const [actionError, setActionError] = useState<string | null>(null);
  const model = useMemo(
    () => buildOperatorTaskCardModel(task, { vehicleById }),
    [task, vehicleById],
  );
  const actions = useMemo(
    () => buildOperatorTaskCardActionPlan(task, { canOverrideChecklist }),
    [task, canOverrideChecklist],
  );

  const runAction = async (action: OperatorTaskCardAction) => {
    if (!onAction || disabled || !action.enabled) return;
    setActionError(null);
    const result = await onAction(action.kind);
    if (typeof result === 'string' && result.trim()) {
      setActionError(result);
    }
  };

  return (
    <OperatorGlassCard className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="sq-press w-full px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
        aria-label={`Aufgabe öffnen: ${model.title}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground line-clamp-2">{model.title}</p>
          {model.showPriority && <PriorityBadge priority={model.priority} />}
        </div>

        {model.objectLine && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{model.objectLine}</p>
        )}
        {model.objectUnavailable && (
          <p className="mt-1 text-xs font-medium text-[color:var(--status-watch)]">
            Bezugsobjekt nicht verfügbar
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusChip tone={taskStatusTone(model.status, model.isOverdue)} dot>
            {model.isOverdue ? 'Überfällig' : taskStatusLabelDe(model.status)}
          </StatusChip>
          {model.autoResolved && (
            <StatusChip tone="success" dot>
              Automatisch erledigt
            </StatusChip>
          )}
          {model.timingLabel && (
            <span
              className={`text-[10px] font-medium tabular-nums ${
                model.timingWarn ? 'text-[color:var(--status-critical)]' : 'text-muted-foreground'
              }`}
            >
              {model.timingLabel}
            </span>
          )}
        </div>

        {model.assigneeLabel && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Verantwortlich: <span className="font-medium text-foreground">{model.assigneeLabel}</span>
          </p>
        )}

        {model.checklist && (
          <div className="mt-2.5 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-muted-foreground">
              <span>Checkliste</span>
              <span className="tabular-nums">
                {model.checklist.completedRequiredItems}/{model.checklist.requiredItems} Pflicht
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[color:var(--brand)] transition-all"
                style={{ width: `${model.checklist.progressPercent ?? 0}%` }}
              />
            </div>
            {model.checklist.blocked && model.checklist.blockerLabel && (
              <p className="text-[10px] font-medium text-[color:var(--status-watch)]">
                {model.checklist.blockerLabel}
              </p>
            )}
          </div>
        )}
      </button>

      {actionError && (
        <div
          className="border-t border-[color:var(--status-critical)]/20 bg-[color:var(--status-critical)]/[0.05] px-4 py-2 text-xs text-[color:var(--status-critical)]"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {actions.primary && (
        <div className="border-t border-border/50 p-2">
          <button
            type="button"
            disabled={disabled || !actions.primary.enabled}
            title={actions.primary.disabledReason}
            onClick={(event) => {
              stopCardNavigation(event);
              void runAction(actions.primary!);
            }}
            className="sq-3d-btn sq-3d-btn--primary flex min-h-[48px] w-full items-center justify-center px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40 disabled:opacity-60"
          >
            {actions.primary.label}
          </button>

          {actions.secondaries.length > 0 && (
            <div className="mt-1 flex gap-1">
              {actions.secondaries.map((secondary) => (
                <button
                  key={secondary.kind}
                  type="button"
                  disabled={disabled || !secondary.enabled}
                  title={secondary.disabledReason}
                  onClick={(event) => {
                    stopCardNavigation(event);
                    void runAction(secondary);
                  }}
                  className="sq-press flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-border/60 px-2 text-[11px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/30 disabled:opacity-60"
                >
                  {secondary.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </OperatorGlassCard>
  );
}
