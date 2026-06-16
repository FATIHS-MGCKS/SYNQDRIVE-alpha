
import { Icon } from './ui/Icon';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import type { VehicleData } from '../data/vehicles';

interface VehicleTasksViewProps {
  isDarkMode: boolean;
  vehicle?: VehicleData | null;
}

type TaskFilter = 'all' | 'open' | 'in-progress' | 'overdue' | 'completed';
type TaskStatus = Exclude<TaskFilter, 'all'>;
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  assignee: string;
  dueAt: Date | null;
  createdAt: Date | null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeStatus(raw: unknown, dueAt: Date | null): TaskStatus {
  const status = String(raw ?? '').toLowerCase().replace(/[_\s]+/g, '-');
  if (status.includes('complete') || status.includes('done') || status.includes('closed')) return 'completed';
  if (status.includes('progress')) return 'in-progress';
  if (status.includes('overdue')) return 'overdue';
  if (dueAt && dueAt.getTime() < Date.now()) return 'overdue';
  return 'open';
}

function normalizePriority(raw: unknown): TaskPriority {
  const priority = String(raw ?? '').toLowerCase();
  if (priority.includes('critical') || priority.includes('urgent')) return 'critical';
  if (priority.includes('high')) return 'high';
  if (priority.includes('low')) return 'low';
  if (priority.includes('normal') || priority.includes('medium')) return 'medium';
  return 'medium';
}

function formatDate(date: Date | null): string {
  if (!date) return 'Kein Fälligkeitsdatum';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function toneClass(tone: 'brand' | 'info' | 'success' | 'warning' | 'critical' | 'neutral') {
  if (tone === 'brand') return 'sq-tone-brand';
  if (tone === 'info') return 'sq-tone-info';
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'warning') return 'sq-tone-warning';
  if (tone === 'critical') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

function statusMeta(status: TaskStatus) {
  if (status === 'overdue') return { label: 'Überfällig', tone: 'critical' as const, icon: 'alert-triangle' };
  if (status === 'in-progress') return { label: 'In Bearbeitung', tone: 'warning' as const, icon: 'clock' };
  if (status === 'completed') return { label: 'Erledigt', tone: 'success' as const, icon: 'check-circle-2' };
  return { label: 'Offen', tone: 'info' as const, icon: 'clipboard-list' };
}

function priorityMeta(priority: TaskPriority) {
  if (priority === 'critical') return { label: 'Critical', className: 'text-red-600' };
  if (priority === 'high') return { label: 'High', className: 'text-orange-600' };
  if (priority === 'low') return { label: 'Low', className: 'text-muted-foreground' };
  return { label: 'Medium', className: 'text-amber-600' };
}

function normalizeTask(raw: any): Task {
  const dueAt = parseDate(raw?.dueDate ?? raw?.dueAt ?? raw?.deadline);
  return {
    id: String(raw?.id ?? crypto.randomUUID?.() ?? Math.random()),
    title: String(raw?.title ?? raw?.name ?? 'Untitled task'),
    description: String(raw?.description ?? raw?.notes ?? ''),
    status: normalizeStatus(raw?.status, dueAt),
    priority: normalizePriority(raw?.priority),
    category: String(raw?.category ?? raw?.type ?? 'General'),
    assignee: String(raw?.assignedUserId ?? raw?.assignedTo ?? raw?.assignee ?? raw?.ownerName ?? 'Unassigned'),
    dueAt,
    createdAt: parseDate(raw?.createdAt ?? raw?.createdDate),
  };
}

export function VehicleTasksView({ isDarkMode: _isDarkMode, vehicle }: VehicleTasksViewProps) {
  const { orgId } = useRentalOrg();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!orgId || !vehicle?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    api.tasks
      .forVehicle(orgId, vehicle.id)
      .then((res) => {
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : [];
        setRows(arr);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setErrored(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orgId, vehicle?.id]);

  const tasks = useMemo(() => {
    if (!vehicle?.id) return [];
    return rows
      .map(normalizeTask)
      .sort((a, b) => {
        const statusRank: Record<TaskStatus, number> = { overdue: 0, open: 1, 'in-progress': 2, completed: 3 };
        const statusDelta = statusRank[a.status] - statusRank[b.status];
        if (statusDelta !== 0) return statusDelta;
        return (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER);
      });
  }, [rows, vehicle?.id]);

  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const openCount = tasks.filter(t => t.status === 'open').length;
  const inProgressCount = tasks.filter(t => t.status === 'in-progress').length;
  const overdueCount = tasks.filter(t => t.status === 'overdue').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const actionableCount = openCount + inProgressCount + overdueCount;
  const vehicleLabel = vehicle
    ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.license
    : 'Kein Fahrzeug ausgewählt';
  const nextTask = tasks.find((task) => task.status === 'overdue') ?? tasks.find((task) => task.status === 'open') ?? tasks.find((task) => task.status === 'in-progress') ?? null;

  return (
    <div className="space-y-5">
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="sq-tone-warning w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <Icon name="list-todo" className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold tracking-[-0.003em] text-foreground">Fahrzeug Task Board</h3>
              <p className="text-[11px] mt-0.5 text-muted-foreground truncate">{vehicleLabel}</p>
              <p className="text-[10px] mt-1 text-muted-foreground">
                {nextTask
                  ? `Nächster Fokus: ${nextTask.title} · fällig ${formatDate(nextTask.dueAt)}`
                  : 'Keine offenen Aufgaben für dieses Fahrzeug.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full xl:w-auto xl:min-w-[520px]">
            <TaskMetric label="Alle" value={tasks.length} tone="neutral" active={filter === 'all'} onClick={() => setFilter('all')} />
            <TaskMetric label="Offen" value={openCount} tone={openCount > 0 ? 'info' : 'neutral'} active={filter === 'open'} onClick={() => setFilter('open')} />
            <TaskMetric label="In Arbeit" value={inProgressCount} tone={inProgressCount > 0 ? 'warning' : 'neutral'} active={filter === 'in-progress'} onClick={() => setFilter('in-progress')} />
            <TaskMetric label="Überfällig" value={overdueCount} tone={overdueCount > 0 ? 'critical' : 'neutral'} active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
            <TaskMetric label="Erledigt" value={completedCount} tone="success" active={filter === 'completed'} onClick={() => setFilter('completed')} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-3 items-start">
        <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="sq-tone-brand w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
                <Icon name="clipboard-list" className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Task Queue</h4>
                <p className="text-[10px] text-muted-foreground">
                  {filter === 'all' ? 'Alle Aufgaben nach Dringlichkeit sortiert.' : `${filteredTasks.length} Aufgaben in dieser Auswahl.`}
                </p>
              </div>
            </div>
            <span className="px-2 py-1 rounded-full text-[10px] font-semibold sq-tone-neutral">
              {actionableCount} aktiv
            </span>
          </div>

          {loading ? (
            <div className="min-h-[240px] flex items-center justify-center">
              <Icon name="loader-2" className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : errored ? (
            <EmptyTaskState title="Tasks konnten nicht geladen werden" subtitle="Die Aufgaben erscheinen wieder, sobald die Anfrage erfolgreich ist." tone="critical" />
          ) : !vehicle?.id ? (
            <EmptyTaskState title="Kein Fahrzeug ausgewählt" subtitle="Wähle ein Fahrzeug aus, um dessen Aufgaben zu sehen." tone="neutral" />
          ) : filteredTasks.length === 0 ? (
            <EmptyTaskState
              title={tasks.length === 0 ? 'Keine Tasks für dieses Fahrzeug' : 'Keine Tasks in dieser Auswahl'}
              subtitle={tasks.length === 0 ? 'Sobald Reinigung, Wartung oder Schäden als Aufgabe erfasst werden, landet alles in dieser Queue.' : 'Wähle eine andere Status-Kachel, um weitere Aufgaben zu sehen.'}
              tone={tasks.length === 0 ? 'success' : 'neutral'}
            />
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>

        <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="sq-tone-info w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
              <Icon name="wrench" className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Operations Fokus</h4>
              <p className="text-[10px] text-muted-foreground">Was Disposition und Werkstatt zuerst sehen sollten.</p>
            </div>
          </div>

          <div className="space-y-2">
            <FocusLine icon="alert-triangle" label="SLA Risiko" value={overdueCount > 0 ? `${overdueCount} überfällig` : 'Keine Überfälligkeit'} tone={overdueCount > 0 ? 'critical' : 'success'} />
            <FocusLine icon="clock" label="In Bearbeitung" value={`${inProgressCount} aktiv`} tone={inProgressCount > 0 ? 'warning' : 'neutral'} />
            <FocusLine icon="clipboard-list" label="Backlog" value={`${openCount} offen`} tone={openCount > 0 ? 'info' : 'neutral'} />
          </div>

          <button
            type="button"
            disabled
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 py-2 text-[10px] font-semibold text-muted-foreground opacity-60 cursor-not-allowed"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Neue Fahrzeugaufgabe
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskMetric({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'info' | 'success' | 'warning' | 'critical' | 'neutral';
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl px-3 py-2 text-left transition-all duration-200 ${toneClass(tone)} ${
        active
          ? 'shadow-[inset_0_0_0_1px_currentColor,0_6px_14px_rgba(15,23,42,0.12)]'
          : 'opacity-75 hover:opacity-100 hover:shadow-sm'
      }`}
    >
      <p className="text-[16px] leading-none font-bold tabular-nums">{value}</p>
      <p className="text-[9px] mt-1 font-semibold uppercase tracking-wider opacity-75 truncate">{label}</p>
    </button>
  );
}

function EmptyTaskState({ title, subtitle, tone }: { title: string; subtitle: string; tone: 'success' | 'critical' | 'neutral' }) {
  return (
    <div className="min-h-[240px] rounded-xl border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center px-4 text-center">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${toneClass(tone)}`}>
        <Icon name={tone === 'critical' ? 'alert-circle' : 'check-circle-2'} className="w-5 h-5" />
      </div>
      <p className="text-[12px] font-semibold text-foreground">{title}</p>
      <p className="text-[10px] text-muted-foreground mt-1 max-w-[320px]">{subtitle}</p>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const s = statusMeta(task.status);
  const p = priorityMeta(task.priority);
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClass(s.tone)}`}>
            <Icon name={s.icon} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[12px] font-semibold text-foreground truncate">{task.title}</p>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${toneClass(s.tone)}`}>{s.label}</span>
              <span className={`text-[10px] font-semibold ${p.className}`}>· {p.label}</span>
            </div>
            {task.description && (
              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Icon name="calendar" className="w-3 h-3" />
                Fällig {formatDate(task.dueAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="user" className="w-3 h-3" />
                {task.assignee}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="filter" className="w-3 h-3" />
                {task.category}
              </span>
            </div>
          </div>
        </div>
        <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-1" />
      </div>
    </div>
  );
}

function FocusLine({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: 'info' | 'success' | 'warning' | 'critical' | 'neutral';
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${toneClass(tone)}`}>
          <Icon name={icon} className="w-3.5 h-3.5" />
        </span>
        <span className="text-[10px] font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <span className="text-[10px] font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}