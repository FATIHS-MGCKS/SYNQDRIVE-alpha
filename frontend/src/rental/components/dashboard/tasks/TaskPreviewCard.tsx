import { memo, useState } from 'react';
import { cn } from '../../../../components/ui/utils';
import type { ApiTask } from '../../../../lib/api';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { VehicleData } from '../../../data/vehicles';
import {
  resolveTaskPreviewPriority,
  taskPreviewCardSurfaceClass,
} from './dashboardTaskPreviewDisplay.utils';
import { TaskQuickDetailPanel } from './TaskQuickDetailPanel';
import { TaskSummaryRow } from './TaskSummaryRow';

export interface TaskPreviewCardProps {
  task: ApiTask;
  vehicleById: Map<string, VehicleData>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locale: string;
  onOpenTask: (taskId: string) => void;
}

export const TaskPreviewCard = memo(function TaskPreviewCard({
  task,
  vehicleById,
  t,
  locale,
  onOpenTask,
}: TaskPreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `dashboard-task-preview-${task.id}`;
  const priority = resolveTaskPreviewPriority(task);

  return (
    <article
      className={cn(
        'overflow-hidden rounded-md border transition-colors motion-reduce:transition-none',
        taskPreviewCardSurfaceClass(priority),
        expanded && 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]',
      )}
      data-testid="dashboard-task-preview-card"
      data-expanded={expanded ? 'true' : 'false'}
      data-priority={priority}
    >
      <div className="px-3 py-2.5">
        <TaskSummaryRow
          task={task}
          t={t}
          locale={locale}
          expanded={expanded}
          controlsId={contentId}
          onToggle={() => setExpanded((value) => !value)}
        />
      </div>

      <div id={contentId} hidden={!expanded}>
        {expanded ? (
          <TaskQuickDetailPanel
            task={task}
            vehicleById={vehicleById}
            t={t}
            onOpenTask={() => onOpenTask(task.id)}
          />
        ) : null}
      </div>
    </article>
  );
});
