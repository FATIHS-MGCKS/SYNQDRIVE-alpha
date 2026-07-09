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
        {secondary ? (
          <span className="text-muted-foreground/80">({secondary.split(' ').slice(0, 2).join(' ')})</span>
        ) : null}
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

export function TaskWorkItemCard({ task, isFlashing, onClick, rowRef }: TaskWorkItemCardProps) {
  const cardTone = isFlashing
    ? 'ring-1 ring-[color:var(--brand-soft)] bg-[color:var(--brand-soft)]'
    : task.status === 'Overdue'
      ? 'border-[color:var(--status-critical-soft)] bg-[color:var(--status-critical-soft)]/30'
      : 'border-border surface-premium';

  return (
    <button
      type="button"
      onClick={onClick}
      ref={rowRef}
      className={`surface-premium sq-press w-full rounded-2xl border p-3 text-left shadow-[var(--shadow-1)] transition-all md:p-3.5 ${cardTone}`}
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
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <TaskStatusChip status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
            </div>
          </div>

          {/* Desktop: horizontal meta row */}
          <div className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1 text-[11px] md:flex">
            <MetaInline
              label="Fahrzeug"
              value={task.vehicleLicense}
              secondary={task.vehicleModel}
            />
            <MetaInline label="Station" value={task.station} />
            <MetaInline label="Zugewiesen an" value={task.assignedUserName} withAvatar />
            <MetaInline label="Erstellt von" value={task.createdByUserName} withAvatar />
            <MetaInline
              label="Fällig am"
              value={task.dueDate}
              critical={task.status === 'Overdue'}
            />
            {task.estimatedDuration && task.estimatedDuration !== '—' ? (
              <MetaInline label="Dauer" value={task.estimatedDuration} muted />
            ) : null}
            <MetaInline label="Erstellt" value={task.createdDate} muted />
          </div>

          {/* Mobile: stacked meta grid */}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] md:hidden">
            <MetaStacked label="Fahrzeug" value={task.vehicleLicense || '—'} />
            <MetaStacked label="Station" value={task.station || '—'} />
            <MetaStacked label="Zugewiesen an" value={task.assignedUserName} />
            <MetaStacked label="Erstellt von" value={task.createdByUserName} />
            <div className="col-span-2">
              <MetaStacked
                label="Fällig am"
                value={task.dueDate || '—'}
                critical={task.status === 'Overdue'}
              />
            </div>
          </div>
        </div>

        <Icon
          name="chevron-right"
          className="hidden h-5 w-5 shrink-0 self-center text-muted-foreground/50 md:block"
        />
      </div>
    </button>
  );
}
