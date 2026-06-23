import { AlertTriangle, ChevronRight, ClipboardList, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, PriorityBadge, StatusChip } from '../../../components/patterns';
import { api, type ApiTask, type Vendor } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import {
  formatTaskDueDate,
  mapApiPriority,
  mapApiTaskToDisplayStatus,
  vehicleTaskPriorityLabel,
  vehicleTaskStatusLabel,
  vehicleTaskStatusTone,
} from '../../lib/task-display.utils';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import {
  selectOpenVehicleMaintenanceTasks,
  summarizeVehicleMaintenanceTasks,
} from '../../lib/vehicle-service-tasks.utils';
import { taskTypeLabel } from '../../lib/service-task-semantics';
import { ServiceTaskCreateModal } from '../service-center/ServiceTaskCreateModal';

interface VehicleServiceContextPanelProps {
  vehicleId: string;
  vehicleLabel: string;
  refreshToken?: number;
  onOpenServiceCenter: (nav?: Partial<ServiceCenterNavState>) => void;
  onOpenTask?: (taskId: string) => void;
}

function statusChipTone(tone: ReturnType<typeof vehicleTaskStatusTone>) {
  if (tone === 'critical') return 'critical' as const;
  if (tone === 'warning') return 'warning' as const;
  if (tone === 'success') return 'success' as const;
  if (tone === 'info') return 'info' as const;
  return 'neutral' as const;
}

function MaintenanceTaskRow({
  task,
  onOpen,
}: {
  task: ApiTask;
  onOpen: () => void;
}) {
  const displayStatus = mapApiTaskToDisplayStatus(task.status);
  const tone = vehicleTaskStatusTone(displayStatus, task.isOverdue);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left rounded-lg border border-border/70 bg-card/40 px-3 py-2.5 transition-colors hover:bg-muted/30 sq-press"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <StatusChip tone={statusChipTone(tone)} className="text-[9px] py-0">
              {vehicleTaskStatusLabel(displayStatus, task.isOverdue)}
            </StatusChip>
            <PriorityBadge
              priority={mapApiPriority(task.priority)}
              label={vehicleTaskPriorityLabel(mapApiPriority(task.priority))}
              className="text-[9px] py-0"
            />
            {task.isOverdue && (
              <StatusChip tone="critical" className="text-[9px] py-0">
                Überfällig
              </StatusChip>
            )}
          </div>
          <p className="text-[12px] font-semibold text-foreground truncate">{task.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {taskTypeLabel(task)}
            {task.dueDate ? ` · Fällig bis ${formatTaskDueDate(task.dueDate)}` : ''}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
      </div>
    </button>
  );
}

export function VehicleServiceContextPanel({
  vehicleId,
  vehicleLabel,
  refreshToken,
  onOpenServiceCenter,
  onOpenTask,
}: VehicleServiceContextPanelProps) {
  const { orgId } = useRentalOrg();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!orgId || !vehicleId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.tasks.forVehicle(orgId, vehicleId).catch(() => []),
      api.vendors.list(orgId).catch(() => []),
    ])
      .then(([rows, vendorList]) => {
        if (cancelled) return;
        setTasks(Array.isArray(rows) ? rows : []);
        setVendors(Array.isArray(vendorList) ? vendorList : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, vehicleId, refreshToken]);

  const summary = useMemo(() => summarizeVehicleMaintenanceTasks(tasks), [tasks]);
  const topTasks = useMemo(() => selectOpenVehicleMaintenanceTasks(tasks, 3), [tasks]);
  const showAlert = summary.overdueCount > 0 || summary.blockingCount > 0 || summary.criticalCount > 0;

  const openTask = (taskId: string) => {
    if (onOpenTask) {
      onOpenTask(taskId);
      return;
    }
    onOpenServiceCenter({ tab: 'tasks', vehicleId, focusTaskId: taskId });
  };

  return (
    <section className="sq-card rounded-xl border border-border/70 bg-card/50 p-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="sq-section-label">Service & Wartung</p>
          <h3 className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">
            Wartungskontext
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{vehicleLabel}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenServiceCenter({ tab: 'tasks', vehicleId })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-[10px] font-semibold hover:bg-muted/40 sq-press"
          >
            <Wrench className="w-3 h-3" />
            Service Center
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--brand-ink)] sq-press"
          >
            <ClipboardList className="w-3 h-3" />
            Service-Aufgabe
          </button>
        </div>
      </div>

      {showAlert && summary.openCount > 0 && (
        <div className="rounded-lg border border-[color:var(--status-critical)]/25 bg-[color:var(--status-critical-soft)] px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[color:var(--status-critical)] mt-0.5" />
          <div className="min-w-0 text-[11px] text-foreground">
            {summary.overdueCount > 0 && (
              <p>
                <span className="font-semibold">{summary.overdueCount}</span> überfällige Wartungsaufgabe
                {summary.overdueCount === 1 ? '' : 'n'}
              </p>
            )}
            {summary.blockingCount > 0 && (
              <p className="text-muted-foreground">
                {summary.blockingCount} blockiert die Vermietung
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                onOpenServiceCenter({
                  tab: 'tasks',
                  vehicleId,
                  taskFilter: summary.overdueCount > 0 ? 'overdue' : 'urgent',
                })
              }
              className="mt-1 font-semibold text-[color:var(--brand-ink)] underline sq-press"
            >
              Im Service Center anzeigen
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          <div className="h-14 rounded-lg bg-muted/40 animate-pulse" />
        </div>
      ) : summary.openCount === 0 ? (
        <EmptyState
          compact
          title="Keine offenen Wartungsaufgaben"
          description="Service-, Reparatur- und Inspektionsaufgaben erscheinen hier und im Service Center."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">
            {summary.openCount} offen
            {summary.overdueCount > 0 ? ` · ${summary.overdueCount} überfällig` : ''}
          </p>
          {topTasks.map((task) => (
            <MaintenanceTaskRow key={task.id} task={task} onOpen={() => openTask(task.id)} />
          ))}
          {summary.openCount > topTasks.length && (
            <button
              type="button"
              onClick={() => onOpenServiceCenter({ tab: 'tasks', vehicleId })}
              className="w-full text-center text-[10px] font-semibold text-[color:var(--brand-ink)] py-1 sq-press"
            >
              Alle {summary.openCount} im Service Center
            </button>
          )}
        </div>
      )}

      <ServiceTaskCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        vendors={vendors}
        defaultVehicleId={vehicleId}
        onCreated={() => {
          if (!orgId) return;
          api.tasks.forVehicle(orgId, vehicleId).then((rows) => {
            setTasks(Array.isArray(rows) ? rows : []);
          }).catch(() => undefined);
        }}
      />
    </section>
  );
}
