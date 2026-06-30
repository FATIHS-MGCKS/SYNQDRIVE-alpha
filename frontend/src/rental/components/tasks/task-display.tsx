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
import type { TaskCategory } from '../../lib/task-create.utils';
import {
  taskPriorityLabelDe,
  taskStatusLabelDe,
  userInitials,
  type TaskListPriority,
  type TaskListRow,
  type TaskListStatus,
} from '../../lib/task-list.utils';

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

function taskStatusTone(status: TaskListStatus): StatusTone {
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

export function TaskStatusChip({ status }: { status: TaskListStatus }) {
  return (
    <StatusChip tone={taskStatusTone(status)} dot>
      {taskStatusLabelDe(status)}
    </StatusChip>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskListPriority }) {
  return (
    <PriorityBadge
      priority={priority === 'Critical' ? 'urgent' : priority.toLowerCase()}
      label={taskPriorityLabelDe(priority)}
    />
  );
}

export function TaskCategoryChip({ category }: { category: TaskCategory }) {
  const CatIcon = categoryIcons[category];
  return (
    <StatusChip tone="neutral" icon={<CatIcon className="h-3 w-3" />}>
      {category}
    </StatusChip>
  );
}

export function AssigneeAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
      {userInitials(name)}
    </div>
  );
}

export function priorityStripClass(priority: TaskListPriority): string {
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
export function getTaskListDisplayFields(task: TaskListRow): string[] {
  return [
    task.title,
    task.displaySource,
    task.category,
    task.vehicleLicense,
    task.vehicleModel,
    task.station,
    task.assignedUserName,
    task.createdByUserName,
    task.dueDate,
    task.createdDate,
    task.estimatedDuration,
    taskStatusLabelDe(task.status),
    taskPriorityLabelDe(task.priority),
  ].filter(Boolean);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function taskListDisplayAvoidsRawUuid(task: TaskListRow): boolean {
  return !getTaskListDisplayFields(task).some((field) => field === task.id || UUID_PATTERN.test(field));
}
