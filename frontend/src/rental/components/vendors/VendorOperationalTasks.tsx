import { useEffect, useMemo, useState } from 'react';
import { EmptyState, PriorityBadge, SkeletonCard, StatusChip } from '../../../components/patterns';
import { api, type ApiTask } from '../../../lib/api';
import { formatTaskDueDate, mapApiPriority, vehicleTaskPriorityLabel } from '../../lib/task-display.utils';
import { taskTypeLabel, TASK_STATUS_LABEL_DE } from '../../lib/service-task-semantics';

interface VendorOperationalTasksProps {
  orgId: string;
  vendorId: string;
  onCreateTask?: () => void;
}

function TaskList({
  tasks,
  emptyTitle,
  emptyDescription,
}: {
  tasks: ApiTask[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (tasks.length === 0) {
    return <EmptyState compact title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="rounded-xl border border-border/45 px-3 py-2.5 bg-card/50"
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <StatusChip tone={task.status === 'DONE' ? 'success' : task.isOverdue ? 'critical' : 'info'}>
              {TASK_STATUS_LABEL_DE[task.status]}
            </StatusChip>
            <PriorityBadge
              priority={mapApiPriority(task.priority)}
              label={vehicleTaskPriorityLabel(mapApiPriority(task.priority))}
            />
          </div>
          <p className="text-[12px] font-semibold text-foreground">{task.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {taskTypeLabel(task)}
            {task.dueDate ? ` · Fällig ${formatTaskDueDate(task.dueDate)}` : ''}
            {task.completedAt ? ` · Erledigt ${formatTaskDueDate(task.completedAt)}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

export function VendorOperationalTasks({ orgId, vendorId, onCreateTask }: VendorOperationalTasksProps) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.tasks.forVendor(orgId, vendorId)
      .then((rows) => {
        if (!cancelled) setTasks(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, vendorId]);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'WAITING'),
    [tasks],
  );
  const completedTasks = useMemo(
    () =>
      [...tasks]
        .filter((t) => t.status === 'DONE')
        .sort((a, b) => {
          const ad = new Date(a.completedAt ?? a.updatedAt ?? 0).getTime();
          const bd = new Date(b.completedAt ?? b.updatedAt ?? 0).getTime();
          return bd - ad;
        })
        .slice(0, 10),
    [tasks],
  );

  const lastActivity = useMemo(() => {
    const dates = tasks
      .map((t) => t.completedAt ?? t.updatedAt ?? t.createdAt)
      .filter(Boolean)
      .map((d) => new Date(d!).getTime())
      .filter(Number.isFinite);
    if (!dates.length) return null;
    return new Date(Math.max(...dates));
  }, [tasks]);

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lastActivity && (
        <p className="text-[10px] text-muted-foreground">
          Letzte Aktivität: {lastActivity.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}

      <section className="sq-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-semibold text-foreground">Offene Partner-Aufgaben</h3>
          {onCreateTask && (
            <button
              type="button"
              onClick={onCreateTask}
              className="text-[10px] font-semibold text-[color:var(--brand-ink)] hover:underline"
            >
              + Service-Aufgabe
            </button>
          )}
        </div>
        <TaskList
          tasks={openTasks}
          emptyTitle="Keine offenen Aufgaben"
          emptyDescription="Service- und Reparaturaufgaben für diesen Partner erscheinen hier, sobald sie zugeordnet sind."
        />
      </section>

      <section className="sq-card rounded-xl p-4 space-y-3">
        <h3 className="text-[12px] font-semibold text-foreground">Zuletzt erledigt</h3>
        <TaskList
          tasks={completedTasks}
          emptyTitle="Noch keine erledigten Aufgaben"
          emptyDescription="Abgeschlossene Service-Fälle werden aus dem Task-System angezeigt — keine separate Service-History."
        />
      </section>
    </div>
  );
}

export function useVendorTaskStats(orgId: string | null, vendorId: string | null) {
  const [stats, setStats] = useState<{ open: number; completed: number; lastActivity: Date | null }>({
    open: 0,
    completed: 0,
    lastActivity: null,
  });

  useEffect(() => {
    if (!orgId || !vendorId) return;
    let cancelled = false;
    api.tasks.forVendor(orgId, vendorId)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        const open = list.filter((t) => ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(t.status)).length;
        const completed = list.filter((t) => t.status === 'DONE').length;
        const dates = list
          .map((t) => t.completedAt ?? t.updatedAt ?? t.createdAt)
          .filter(Boolean)
          .map((d) => new Date(d!).getTime())
          .filter(Number.isFinite);
        setStats({
          open,
          completed,
          lastActivity: dates.length ? new Date(Math.max(...dates)) : null,
        });
      })
      .catch(() => {
        if (!cancelled) setStats({ open: 0, completed: 0, lastActivity: null });
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, vendorId]);

  return stats;
}
