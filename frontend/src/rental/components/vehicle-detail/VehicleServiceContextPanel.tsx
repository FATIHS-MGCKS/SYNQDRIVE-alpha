import { ChevronRight, ClipboardList } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PriorityBadge, StatusChip } from '../../../components/patterns';
import { api, type ApiTask, type Vendor } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import {
  formatVehicleMaintenanceDueLabel,
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
  const priority = mapApiPriority(task.priority);
  // Status chip already renders "Überfällig" for overdue active tasks, so no
  // second overdue badge here. Priority is only shown when it adds signal.
  const showPriority = priority === 'critical' || priority === 'high';
  const dueLabel = formatVehicleMaintenanceDueLabel(task);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left rounded-lg border border-border/70 surface-premium px-3 py-2.5 transition-colors hover:bg-muted/30 sq-press"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <StatusChip tone={statusChipTone(tone)} className="text-[9px] py-0">
              {vehicleTaskStatusLabel(displayStatus, task.isOverdue)}
            </StatusChip>
            {showPriority && (
              <PriorityBadge
                priority={priority}
                label={vehicleTaskPriorityLabel(priority)}
                className="text-[9px] py-0"
              />
            )}
          </div>
          <p className="text-[12px] font-semibold text-foreground truncate">{task.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {taskTypeLabel(task)}
            {dueLabel ? ` · ${dueLabel}` : ''}
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

  // Compact, single header status — no separate alert banner / summary line.
  // Only escalated states earn a badge; plain open tasks let the rows speak.
  const headerBadge: { tone: 'critical' | 'warning'; label: string } | null =
    summary.blockingCount > 0
      ? { tone: 'critical', label: 'Vermietung blockiert' }
      : summary.overdueCount > 0
        ? { tone: 'critical', label: 'Überfällig' }
        : summary.criticalCount > 0
          ? { tone: 'critical', label: 'Kritisch' }
          : null;

  const openTask = (taskId: string) => {
    if (onOpenTask) {
      onOpenTask(taskId);
      return;
    }
    onOpenServiceCenter({ tab: 'tasks', vehicleId, focusTaskId: taskId });
  };

  const hasModalState = createOpen;

  // Overview rule: only render when there is a real operative service/maintenance
  // context (open / overdue / critical / blocking). Never an empty box, never a
  // skeleton shell while loading. The create modal stays mounted if it was opened.
  if (!hasModalState && (loading || summary.openCount === 0)) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border surface-premium p-3 shadow-sm space-y-3 text-foreground">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[11px] font-bold tracking-[-0.01em] text-foreground">
              Service & Wartung
            </h3>
            {headerBadge && (
              <StatusChip tone={headerBadge.tone} className="text-[9px] py-0">
                {headerBadge.label}
              </StatusChip>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{vehicleLabel}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--brand-ink)] sq-press"
        >
          <ClipboardList className="w-3 h-3" />
          Service-Aufgabe erstellen
        </button>
      </div>

      {topTasks.length > 0 && (
        <div className="space-y-2">
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
