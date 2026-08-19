import {
  Camera,
  CircleDot,
  Eye,
  FileText,
  Shield,
  Sparkles,
  Timer,
  Wrench,
} from 'lucide-react';

import { PriorityBadge, StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { TaskCategory } from '../../lib/task-create.utils';
import type { TaskListRow } from '../../lib/task-list.utils';
import { userInitials } from '../../lib/task-list.utils';
import {
  taskCategoryLabel,
  taskListPriorityLabel,
  taskListStatusLabel,
  tt,
} from '../tasks-settings/tasks-i18n';

const categoryIcons: Record<TaskCategory, typeof Wrench> = {
  Cleaning: Sparkles,
  Maintenance: Wrench,
  Repair: Wrench,
  Inspection: Eye,
  Damage: Camera,
  'TÜV': Shield,
  Insurance: FileText,
  Documents: FileText,
  'Tire Change': CircleDot,
  'Oil Change': Timer,
};

function taskStatusTone(status: TaskListRow['status']): StatusTone {
  switch (status) {
    case 'In Progress':
      return 'info';
    case 'Completed':
      return 'success';
    case 'Overdue':
      return 'critical';
    case 'Waiting':
      return 'watch';
    default:
      return 'watch';
  }
}

export function TaskStatusChip({ status }: { status: TaskListRow['status'] }) {
  const { locale } = useLanguage();
  return (
    <StatusChip tone={taskStatusTone(status)} dot>
      {taskListStatusLabel(locale, status)}
    </StatusChip>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskListRow['priority'] }) {
  const { locale } = useLanguage();
  return (
    <PriorityBadge
      priority={priority === 'Critical' ? 'urgent' : priority.toLowerCase()}
      label={taskListPriorityLabel(locale, priority)}
    />
  );
}

export function TaskCategoryChip({ category }: { category: TaskCategory }) {
  const { locale } = useLanguage();
  const CatIcon = categoryIcons[category];
  return (
    <StatusChip tone="neutral" icon={<CatIcon className="h-3 w-3" />}>
      {taskCategoryLabel(locale, category)}
    </StatusChip>
  );
}

export function AssigneeAvatar({ name }: { name: string }) {
  const { locale } = useLanguage();
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
      {userInitials(locale, name)}
    </div>
  );
}

export function priorityStripClass(priority: TaskListRow['priority']): string {
  switch (priority) {
    case 'Critical':
      return 'bg-[color:var(--status-critical)]';
    case 'High':
      return 'bg-[color:var(--status-warning)]';
    case 'Medium':
      return 'bg-[color:var(--status-watch)]';
    default:
      return 'bg-[color:var(--status-nodata)]';
  }
}

/** Fields rendered in list rows — used for parity / UUID visibility tests. */
export function getTaskListDisplayFields(locale: string, task: TaskListRow): string[] {
  return [
    task.title,
    task.displaySource,
    taskCategoryLabel(locale, task.category),
    task.vehicleLicense,
    task.vehicleModel,
    task.station,
    task.assignedUserName,
    task.createdByUserName,
    task.dueDate,
    task.createdDate,
    task.estimatedDuration,
    taskListStatusLabel(locale, task.status),
    taskListPriorityLabel(locale, task.priority),
  ].filter(Boolean);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function taskListDisplayAvoidsRawUuid(locale: string, task: TaskListRow): boolean {
  return !getTaskListDisplayFields(locale, task).some((field) => field === task.id || UUID_PATTERN.test(field));
}

export function taskEmDash(locale: string): string {
  return tt(locale, 'tasks.display.emDash');
}
