import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Columns3, List, Plus } from 'lucide-react';
import { EmptyState, ErrorState } from '../../../components/patterns';
import { api, type ApiTask, type ApiTaskPriority, type ApiTaskStatus, type ApiTaskType, type Vendor } from '../../../lib/api';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import {
  applyServiceTaskFilters,
  DEFAULT_SERVICE_TASK_FILTERS,
  type ServiceTaskAdvancedFilters,
  type ServiceTaskViewMode,
} from '../../lib/service-task-filters';
import {
  SERVICE_MAINTENANCE_TYPES,
  TASK_PRIORITY_LABEL_DE,
  TASK_STATUS_LABEL_DE,
  TASK_TYPE_LABEL_DE,
} from '../../lib/service-task-semantics';
import { VehicleTaskDetailDrawer } from '../tasks/VehicleTaskDetailDrawer';
import { Icon } from '../ui/Icon';
import { sc } from './service-center-ui';
import type { ServiceTaskFilter } from './service-center.types';
import { ServiceTaskCard } from './ServiceTaskCard';
import { ServiceTaskCreateModal } from './ServiceTaskCreateModal';
import { ServiceTasksBoard } from './ServiceTasksBoard';
import { ServiceTasksCalendar } from './ServiceTasksCalendar';

interface ServiceTasksPanelProps {
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  error?: string | null;
  filter: ServiceTaskFilter;
  onFilterChange: (filter: ServiceTaskFilter) => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  onReload?: () => void;
  focusTaskId?: string | null;
  initialAdvancedFilters?: Partial<ServiceTaskAdvancedFilters>;
}

const VIEW_MODES: Array<{ id: ServiceTaskViewMode; label: string; icon: typeof List }> = [
  { id: 'list', label: 'Liste', icon: List },
  { id: 'board', label: 'Board', icon: Columns3 },
  { id: 'calendar', label: 'Kalender', icon: CalendarDays },
];

export function ServiceTasksPanel({
  tasks,
  vendors,
  loading,
  error,
  filter,
  onFilterChange,
  onOpenGlobalTasks,
  onReload,
  focusTaskId,
  initialAdvancedFilters,
}: ServiceTasksPanelProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [localTasks, setLocalTasks] = useState(tasks);
  const [viewMode, setViewMode] = useState<ServiceTaskViewMode>('list');
  const [advanced, setAdvanced] = useState<ServiceTaskAdvancedFilters>(DEFAULT_SERVICE_TASK_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    setAdvanced((prev) => ({ ...prev, kpiFilter: filter }));
  }, [filter]);

  useEffect(() => {
    if (!initialAdvancedFilters || Object.keys(initialAdvancedFilters).length === 0) return;
    setAdvanced((prev) => ({ ...prev, ...initialAdvancedFilters }));
  }, [initialAdvancedFilters]);

  useEffect(() => {
    if (!focusTaskId) return;
    setSelectedTaskId(focusTaskId);
    setDrawerOpen(true);
  }, [focusTaskId]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    api.users.listByOrg(orgId)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : [];
        setOrgMembers(
          list.map((u) => ({
            id: u.id,
            name: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setOrgMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const vehicleMap = useMemo(() => new Map(fleetVehicles.map((v) => [v.id, v])), [fleetVehicles]);
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const stationMap = useMemo(
    () => new Map(fleetVehicles.map((v) => [v.id, v.stationId ?? v.homeStationId])),
    [fleetVehicles],
  );
  const stations = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of fleetVehicles) {
      const sid = v.stationId ?? v.homeStationId;
      if (sid && v.station) map.set(sid, v.station);
    }
    return map;
  }, [fleetVehicles]);

  const effectiveFilters = useMemo((): ServiceTaskAdvancedFilters => {
    if (viewMode === 'board') {
      return { ...advanced, status: 'ALL' };
    }
    return advanced;
  }, [advanced, viewMode]);

  const filtered = useMemo(() => {
    const list = applyServiceTaskFilters(localTasks, effectiveFilters, stationMap);
    if (effectiveFilters.status === 'ALL') {
      return list.filter((t) => t.status !== 'CANCELLED');
    }
    return list;
  }, [localTasks, effectiveFilters, stationMap]);

  const resolveVehicle = useCallback(
    (task: ApiTask) => (task.vehicleId ? vehicleMap.get(task.vehicleId) ?? null : null),
    [vehicleMap],
  );
  const resolveVendorName = useCallback(
    (task: ApiTask) => (task.vendorId ? vendorMap.get(task.vendorId) ?? null : null),
    [vendorMap],
  );
  const resolveAssigneeName = useCallback(
    (task: ApiTask) => {
      if (!task.assignedUserId) return null;
      return orgMembers.find((m) => m.id === task.assignedUserId)?.name ?? null;
    },
    [orgMembers],
  );

  const runMutation = useCallback(
    async (taskId: string, fn: () => Promise<ApiTask>, message: string) => {
      if (!orgId) return;
      setMutatingId(taskId);
      try {
        const updated = await fn();
        setLocalTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success(message);
        onReload?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Aktion fehlgeschlagen');
      } finally {
        setMutatingId(null);
      }
    },
    [orgId, onReload],
  );

  const handleStart = useCallback(
    (task: ApiTask) => {
      if (!orgId) return;
      void runMutation(task.id, () => api.tasks.start(orgId, task.id), 'Aufgabe gestartet');
    },
    [orgId, runMutation],
  );
  const handleWaiting = useCallback(
    (task: ApiTask) => {
      if (!orgId) return;
      void runMutation(task.id, () => api.tasks.waiting(orgId, task.id), 'Auf Wartend gesetzt');
    },
    [orgId, runMutation],
  );
  const handleComplete = useCallback(
    (task: ApiTask) => {
      if (!orgId) return;
      setSelectedTaskId(task.id);
      setDrawerOpen(true);
    },
    [orgId],
  );

  const openTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setDrawerOpen(true);
  }, []);

  const selectedVehicle = useMemo(() => {
    const task = localTasks.find((t) => t.id === selectedTaskId);
    return task ? resolveVehicle(task) : null;
  }, [localTasks, selectedTaskId, resolveVehicle]);

  const selectClass =
    'rounded-lg border border-border bg-[color:var(--input-background)] px-2 py-1.5 text-[10px] outline-none focus:border-[color:var(--brand)]';

  if (error) {
    return (
      <ErrorState title="Aufgaben konnten nicht geladen werden" description={error} onRetry={onReload} />
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${sc.panel} space-y-3`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <p className={sc.sectionEyebrow}>Instandhaltung</p>
            <h3 className={sc.sectionTitle}>Service- & Wartungsaufgaben</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border/50 p-0.5 bg-muted/20">
              {VIEW_MODES.map((mode) => {
                const IconCmp = mode.icon;
                const active = viewMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setViewMode(mode.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
                      active ? 'surface-premium shadow-sm text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <IconCmp className="w-3.5 h-3.5" />
                    {mode.label}
                  </button>
                );
              })}
            </div>
            {onReload && (
              <button
                type="button"
                onClick={onReload}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-semibold border border-border/60 hover:bg-muted/40"
              >
                <Icon name="refresh-cw" className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]"
            >
              <Plus className="w-3.5 h-3.5" />
              Aufgabe anlegen
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          <select
            value={advanced.status}
            onChange={(e) =>
              setAdvanced((p) => ({ ...p, status: e.target.value as ServiceTaskAdvancedFilters['status'] }))
            }
            className={selectClass}
          >
            <option value="ACTIVE">Status: Aktiv</option>
            <option value="ALL">Status: Alle</option>
            {(Object.keys(TASK_STATUS_LABEL_DE) as ApiTaskStatus[]).map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABEL_DE[s]}</option>
            ))}
          </select>
          <select
            value={advanced.priority}
            onChange={(e) =>
              setAdvanced((p) => ({ ...p, priority: e.target.value as ApiTaskPriority | 'ALL' }))
            }
            className={selectClass}
          >
            <option value="ALL">Priorität: Alle</option>
            {(Object.keys(TASK_PRIORITY_LABEL_DE) as ApiTaskPriority[]).map((p) => (
              <option key={p} value={p}>{TASK_PRIORITY_LABEL_DE[p]}</option>
            ))}
          </select>
          <select
            value={advanced.type}
            onChange={(e) =>
              setAdvanced((p) => ({ ...p, type: e.target.value as ApiTaskType | 'ALL' }))
            }
            className={selectClass}
          >
            <option value="ALL">Typ: Alle</option>
            {SERVICE_MAINTENANCE_TYPES.map((t) => (
              <option key={t} value={t}>{TASK_TYPE_LABEL_DE[t]}</option>
            ))}
          </select>
          <select
            value={advanced.vehicleId}
            onChange={(e) => setAdvanced((p) => ({ ...p, vehicleId: e.target.value }))}
            className={selectClass}
          >
            <option value="ALL">Fahrzeug: Alle</option>
            {fleetVehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.license}</option>
            ))}
          </select>
          <select
            value={advanced.vendorId}
            onChange={(e) => setAdvanced((p) => ({ ...p, vendorId: e.target.value }))}
            className={selectClass}
          >
            <option value="ALL">Partner: Alle</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select
            value={advanced.assignedUserId}
            onChange={(e) => setAdvanced((p) => ({ ...p, assignedUserId: e.target.value }))}
            className={selectClass}
          >
            <option value="ALL">Zugewiesen: Alle</option>
            {orgMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {stations.size > 0 && (
            <select
              value={advanced.stationId}
              onChange={(e) => setAdvanced((p) => ({ ...p, stationId: e.target.value }))}
              className={selectClass}
            >
              <option value="ALL">Station: Alle</option>
              {Array.from(stations.entries()).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <label className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={advanced.overdueOnly}
              onChange={(e) => setAdvanced((p) => ({ ...p, overdueOnly: e.target.checked }))}
            />
            Überfällig
          </label>
          <label className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={advanced.dueSoonOnly}
              onChange={(e) => setAdvanced((p) => ({ ...p, dueSoonOnly: e.target.checked }))}
            />
            Bald fällig
          </label>
          <label className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={advanced.urgentOnly}
              onChange={(e) => setAdvanced((p) => ({ ...p, urgentOnly: e.target.checked }))}
            />
            Kritisch / Blockiert
          </label>
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => onFilterChange('all')}
              className="text-[10px] font-semibold text-[color:var(--brand-ink)] hover:underline"
            >
              KPI-Filter zurücksetzen
            </button>
          )}
        </div>

        <input
          value={advanced.search}
          onChange={(e) => setAdvanced((p) => ({ ...p, search: e.target.value }))}
          placeholder="Suchen nach Titel, Fahrzeug, Typ…"
          className="w-full rounded-xl border border-border bg-[color:var(--input-background)] px-3 py-2 text-[12px] outline-none focus:border-[color:var(--brand)]"
        />
      </div>

      <div className={viewMode === 'board' ? '' : sc.panel}>
        {loading && filtered.length === 0 ? (
          <p className="text-[11px] text-muted-foreground animate-pulse p-4">Aufgaben werden geladen…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Keine Aufgaben in dieser Ansicht"
            description="Passen Sie die Filter an oder legen Sie eine neue Serviceaufgabe an."
          />
        ) : viewMode === 'board' ? (
          <ServiceTasksBoard
            tasks={filtered}
            resolveVehicle={resolveVehicle}
            resolveVendorName={resolveVendorName}
            resolveAssigneeName={resolveAssigneeName}
            mutatingId={mutatingId}
            onOpen={openTask}
            onStart={handleStart}
            onWaiting={handleWaiting}
            onComplete={handleComplete}
          />
        ) : viewMode === 'calendar' ? (
          <ServiceTasksCalendar tasks={filtered} resolveVehicle={resolveVehicle} onOpen={openTask} />
        ) : (
          <div className="space-y-2">
            {filtered.map((task) => (
              <ServiceTaskCard
                key={task.id}
                task={task}
                vehicle={resolveVehicle(task)}
                vendorName={resolveVendorName(task)}
                assigneeName={resolveAssigneeName(task)}
                mutating={mutatingId === task.id}
                onOpen={openTask}
                onStart={handleStart}
                onWaiting={handleWaiting}
                onComplete={handleComplete}
              />
            ))}
          </div>
        )}
      </div>

      <ServiceTaskCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        vendors={vendors}
        onCreated={(created) => {
          setLocalTasks((prev) => [created, ...prev]);
          onReload?.();
        }}
      />

      <VehicleTaskDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        orgId={orgId}
        taskId={selectedTaskId}
        vehicle={selectedVehicle}
        orgMembers={orgMembers}
        onTaskUpdated={(updated) => {
          setLocalTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          onReload?.();
        }}
        onOpenInGlobalTasks={onOpenGlobalTasks}
      />
    </div>
  );
}
