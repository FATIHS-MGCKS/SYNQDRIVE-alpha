import { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import type { ApiTask, ApiTaskPriority, ApiTaskStatus } from '../../lib/api';
import { taskTypeLabel, TASK_STATUS_LABEL_DE, TASK_PRIORITY_LABEL_DE } from '../lib/service-task-semantics';

/**
 * Reusable embeddable task list for entity detail pages (Vehicle / Booking /
 * Vendor / Customer). Read-only by design — the central Task page owns
 * mutations. `isOverdue` is taken straight from the server read model so the
 * badge never disagrees with the canonical truth.
 */
interface EntityTasksSectionProps {
  isDark?: boolean;
  title: string;
  emptyHint: string;
  /** Returns the tasks for this entity (e.g. () => api.tasks.forVendor(orgId, vendorId)). */
  fetchTasks: () => Promise<ApiTask[]>;
  /** Re-fetch when these change (e.g. [orgId, vendorId]). */
  deps: ReadonlyArray<unknown>;
  onOpenTask?: (taskId: string) => void;
  /** Show only active (non-terminal) tasks. */
  activeOnly?: boolean;
}

const STATUS_LABEL: Record<ApiTaskStatus, string> = TASK_STATUS_LABEL_DE;

function statusTone(status: ApiTaskStatus, isDark: boolean): string {
  switch (status) {
    case 'IN_PROGRESS':
      return isDark ? 'bg-status-watch-soft text-status-watch border-status-watch/20' : 'bg-amber-100 text-amber-700 border-amber-200';
    case 'WAITING':
      return isDark ? 'bg-status-ai-soft text-status-ai border-status-ai/20' : 'bg-violet-100 text-violet-700 border-violet-200';
    case 'DONE':
      return isDark ? 'bg-status-positive-soft text-status-positive border-status-positive/20' : 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'CANCELLED':
      return isDark ? 'bg-muted text-muted-foreground border-border' : 'bg-gray-100 text-gray-500 border-gray-200';
    default:
      return isDark ? 'bg-status-info-soft text-status-info border-status-info/20' : 'bg-status-info-soft text-status-info border-border';
  }
}

function priorityTone(priority: ApiTaskPriority): string {
  switch (priority) {
    case 'CRITICAL':
      return 'text-red-600';
    case 'HIGH':
      return 'text-orange-600';
    case 'LOW':
      return 'text-gray-500';
    case 'NORMAL':
    default:
      return 'text-amber-600';
  }
}

function priorityLabel(priority: ApiTaskPriority): string {
  return TASK_PRIORITY_LABEL_DE[priority] ?? priority;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
}

function fmtCents(cents: number | null): string | null {
  if (cents == null) return null;
  return `${(cents / 100).toFixed(2)} €`;
}

export function EntityTasksSection({ isDark = false, title, emptyHint, fetchTasks, deps, onOpenTask, activeOnly }: EntityTasksSectionProps) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    fetchTasks()
      .then((rows) => {
        if (cancelled) return;
        const arr = Array.isArray(rows) ? rows : [];
        setTasks(activeOnly ? arr.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED') : arr);
      })
      .catch(() => {
        if (!cancelled) {
          setTasks([]);
          setErrored(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const cardClass = `rounded-2xl border shadow-sm ${isDark ? 'surface-premium border-border' : 'bg-white border-gray-200'}`;
  const textPrimary = isDark ? 'text-foreground' : 'text-gray-900';
  const textSecondary = isDark ? 'text-muted-foreground' : 'text-gray-500';

  return (
    <div className={`${cardClass} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-xs font-semibold flex items-center gap-2 ${isDark ? 'text-muted-foreground' : 'text-gray-600'}`}>
          <Icon name="list-todo" className="w-3.5 h-3.5" /> {title} ({tasks.length})
        </h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Icon name="loader-2" className={`w-5 h-5 animate-spin ${isDark ? 'text-muted-foreground' : 'text-gray-300'}`} />
        </div>
      ) : errored ? (
        <p className={`text-[11px] ${isDark ? 'text-muted-foreground' : 'text-muted-foreground'}`}>Tasks konnten nicht geladen werden.</p>
      ) : tasks.length === 0 ? (
        <p className={`text-[11px] ${isDark ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{emptyHint}</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const cost = fmtCents(t.actualCostCents ?? t.estimatedCostCents);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTask?.(t.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  isDark ? 'bg-muted/30 border-border/60 hover:bg-muted/50' : 'bg-gray-50/80 border-gray-200/50 hover:bg-gray-100'
                } ${onOpenTask ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold truncate ${textPrimary}`}>{t.title}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusTone(t.status, isDark)}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                      {t.isOverdue && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-100 text-red-700 border-red-200">
                          Überfällig
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold ${priorityTone(t.priority)}`}>· {priorityLabel(t.priority)}</span>
                    </div>
                    <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] ${textSecondary}`}>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="calendar" className="w-3 h-3" /> Fällig {fmt(t.dueDate)}
                      </span>
                      <span>{taskTypeLabel(t)}</span>
                      {cost && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="euro" className="w-3 h-3" /> {cost}
                        </span>
                      )}
                    </div>
                  </div>
                  {onOpenTask && <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-1" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
