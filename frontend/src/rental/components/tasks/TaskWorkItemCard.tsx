import { Icon } from '../ui/Icon';
import type { TaskListRow } from '../../lib/task-list.utils';
import {
  AssigneeAvatar,
  priorityStripClass,
  TaskCategoryChip,
  TaskPriorityBadge,
  TaskStatusChip,
} from './task-display';

export interface TaskWorkItemCardProps {
  task: TaskListRow;
  isFlashing?: boolean;
  onClick: () => void;
  rowRef?: (el: HTMLButtonElement | null) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}

export function TaskWorkItemCard({
  task,
  isFlashing,
  onClick,
  rowRef,
  selectable = false,
  selected = false,
  onSelectedChange,
}: TaskWorkItemCardProps) {
  const terminal = task.status === 'Completed';
  const cardTone = isFlashing
    ? 'ring-1 ring-[color:var(--brand-soft)] bg-[color:var(--brand-soft)]'
    : task.isOverdue
      ? 'border-[color:var(--status-critical-soft)] bg-[color:var(--status-critical-soft)]/30'
      : 'border-border surface-premium';

  return (
    <div className="flex items-stretch gap-2">
      {selectable && !terminal ? (
        <label className="flex items-center px-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange?.(event.target.checked)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`${task.title} auswählen`}
            data-testid="task-select-checkbox"
            className="h-4 w-4 rounded border-border"
          />
        </label>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        ref={rowRef}
        data-testid="task-work-item-card"
        className={`surface-premium sq-press min-w-0 flex-1 rounded-2xl border p-3 text-left shadow-[var(--shadow-1)] transition-all md:p-3.5 ${cardTone}`}
      >
      <div className="flex items-stretch gap-3">
        <div
          className={`w-1 shrink-0 rounded-full ${priorityStripClass(task.priority)}`}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="line-clamp-2 text-sm font-semibold text-foreground md:line-clamp-1">
                  {task.title}
                </p>
                {task.priority === 'Critical' ? (
                  <Icon
                    name="alert-triangle"
                    className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-critical)]"
                  />
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <TaskCategoryChip category={task.category} />
                <span className="text-[11px] text-muted-foreground">· {task.displaySource}</span>
                {task.completionModeLabel ? (
                  <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {task.completionModeLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <TaskStatusChip status={task.status} />
              {!terminal ? <TaskPriorityBadge priority={task.priority} /> : null}
            </div>
          </div>

          <div className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1 text-[11px] md:flex">
            <MetaInline
              label="Verknüpft"
              value={task.linkedObjectLabel}
              secondary={task.linkedObjectSecondary ?? undefined}
            />
            <MetaInline label="Zuständig" value={task.assignedUserName} withAvatar />
            <MetaInline
              label="Fällig"
              value={task.dueDate || '—'}
              critical={task.isOverdue}
            />
            {task.checklistProgressLabel ? (
              <MetaInline label="Fortschritt" value={task.checklistProgressLabel} />
            ) : null}
            {terminal && task.completedDate ? (
              <MetaInline label="Abgeschlossen" value={task.completedDate} muted />
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] md:hidden">
            <MetaStacked label="Verknüpft" value={task.linkedObjectLabel} />
            <MetaStacked label="Zuständig" value={task.assignedUserName} />
            <MetaStacked
              label="Fällig"
              value={task.dueDate || '—'}
              critical={task.isOverdue}
            />
            {task.checklistProgressLabel ? (
              <MetaStacked label="Fortschritt" value={task.checklistProgressLabel} />
            ) : null}
          </div>

          {task.checklistProgressPercent != null && !terminal ? (
            <div className="mt-2.5">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={task.checklistProgressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[color:var(--brand)] transition-all"
                  style={{ width: `${task.checklistProgressPercent}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <Icon
          name="chevron-right"
          className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground/50 md:block"
        />
      </div>
    </button>
    </div>
  );
}

function MetaInline({
  label,
  value,
  secondary,
  critical,
  muted,
  withAvatar,
}: {
  label: string;
  value: string;
  secondary?: string;
  critical?: boolean;
  muted?: boolean;
  withAvatar?: boolean;
}) {
  if (!value || value === '—') return null;

  return (
    <div className={`min-w-0 ${muted ? 'opacity-80' : ''}`}>
      <span className="text-muted-foreground">{label}: </span>
      <span className="inline-flex items-center gap-1.5">
        {withAvatar ? <AssigneeAvatar name={value} /> : null}
        <span
          className={`font-medium ${
            critical ? 'text-[color:var(--status-critical)]' : 'text-foreground'
          }`}
        >
          {value}
        </span>
        {secondary ? <span className="text-muted-foreground/80">({secondary})</span> : null}
      </span>
    </div>
  );
}

function MetaStacked({
  label,
  value,
  critical,
}: {
  label: string;
  value: string;
  critical?: boolean;
}) {
  if (!value || value === '—') return null;

  return (
    <div className="min-w-0">
      <span className="text-muted-foreground">{label}</span>
      <p
        className={`truncate font-medium ${
          critical ? 'text-[color:var(--status-critical)]' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
