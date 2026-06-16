import { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import type { ApiTask, ApiTaskPriority, ApiTaskStatus } from '../../lib/api';

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

const STATUS_LABEL: Record<ApiTaskStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING: 'Waiting',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

function statusTone(status: ApiTaskStatus): string {
  switch (status) {
    case 'IN_PROGRESS':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'WAITING':
      return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'DONE':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'CANCELLED':
      return 'bg-gray-100 text-gray-500 border-gray-200';
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200';
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

  const cardClass = `rounded-2xl border shadow-sm ${isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`${cardClass} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-xs font-semibold flex items-center gap-2 ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>
          <Icon name="list-todo" className="w-3.5 h-3.5" /> {title} ({tasks.length})
        </h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Icon name="loader-2" className={`w-5 h-5 animate-spin ${isDark ? 'text-neutral-500' : 'text-gray-300'}`} />
        </div>
      ) : errored ? (
        <p className={`text-[11px] ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>Tasks konnten nicht geladen werden.</p>
      ) : tasks.length === 0 ? (
        <p className={`text-[11px] ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>{emptyHint}</p>
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
                  isDark ? 'bg-neutral-800/50 border-neutral-700/50 hover:bg-neutral-800' : 'bg-gray-50/80 border-gray-200/50 hover:bg-gray-100'
                } ${onOpenTask ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold truncate ${textPrimary}`}>{t.title}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusTone(t.status)}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                      {t.isOverdue && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-100 text-red-700 border-red-200">
                          Überfällig
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold ${priorityTone(t.priority)}`}>· {t.priority}</span>
                    </div>
                    <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] ${textSecondary}`}>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="calendar" className="w-3 h-3" /> Fällig {fmt(t.dueDate)}
                      </span>
                      <span>{t.type.replace(/_/g, ' ')}</span>
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
