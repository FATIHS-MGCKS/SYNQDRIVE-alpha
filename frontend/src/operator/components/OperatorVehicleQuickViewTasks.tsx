import { Plus } from 'lucide-react';
import { PriorityBadge, SkeletonRows, StatusChip } from '../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { ApiTask } from '../../lib/api';
import { taskStatusTone } from '../../rental/lib/task-detail.utils';
import {
  operatorVehicleQuickViewTaskOpenAriaLabel,
  operatorVehicleQuickViewTaskPriorityLabel,
  operatorVehicleQuickViewTasksEmptyLabel,
  operatorVehicleQuickViewTasksNewLabel,
  operatorVehicleQuickViewTasksSectionTitle,
  operatorVehicleQuickViewTaskStatusLabel,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorGlassCard } from './OperatorGlassCard';

export interface OperatorVehicleQuickViewTasksProps {
  tasks: ApiTask[];
  loading: boolean;
  onCreateTask: () => void;
  onOpenTask: (task: ApiTask) => void;
}

export function OperatorVehicleQuickViewTasks({
  tasks,
  loading,
  onCreateTask,
  onOpenTask,
}: OperatorVehicleQuickViewTasksProps) {
  const { locale } = useLanguage();

  return (
    <OperatorGlassCard className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {operatorVehicleQuickViewTasksSectionTitle(locale)}
        </h3>
        <button
          type="button"
          onClick={onCreateTask}
          className="sq-press inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[10px] font-semibold"
        >
          <Plus className="h-3 w-3" />
          {operatorVehicleQuickViewTasksNewLabel(locale)}
        </button>
      </div>

      {loading && tasks.length === 0 ? (
        <SkeletonRows rows={2} />
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {operatorVehicleQuickViewTasksEmptyLabel(locale)}
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.slice(0, 6).map((task) => (
            <OperatorVehicleQuickViewTaskRow
              key={task.id}
              task={task}
              locale={locale}
              onOpen={() => onOpenTask(task)}
            />
          ))}
        </div>
      )}
    </OperatorGlassCard>
  );
}

function OperatorVehicleQuickViewTaskRow({
  task,
  locale,
  onOpen,
}: {
  task: ApiTask;
  locale: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={operatorVehicleQuickViewTaskOpenAriaLabel(locale, task.title)}
      className="sq-press w-full rounded-xl border border-border/50 px-3 py-2 text-left"
    >
      <p className="text-sm font-semibold text-foreground">{task.title}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <StatusChip tone={taskStatusTone(task.status, task.isOverdue)} dot>
          {operatorVehicleQuickViewTaskStatusLabel(locale, task.status, task.isOverdue)}
        </StatusChip>
        <PriorityBadge
          priority={task.priority}
          label={operatorVehicleQuickViewTaskPriorityLabel(locale, task.priority)}
        />
      </div>
    </button>
  );
}
