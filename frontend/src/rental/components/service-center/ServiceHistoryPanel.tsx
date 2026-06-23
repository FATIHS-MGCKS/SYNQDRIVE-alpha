import { useEffect, useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { EmptyState, SkeletonCard } from '../../../components/patterns';
import type { ApiTask, ApiTaskType, Vendor } from '../../../lib/api';
import {
  applyServiceHistoryFilters,
  DEFAULT_SERVICE_HISTORY_FILTERS,
  groupHistoryByDate,
  type ServiceHistoryFilters,
} from '../../lib/service-history.utils';
import {
  buildVehicleLabel,
  SERVICE_MAINTENANCE_TYPES,
  TASK_TYPE_LABEL_DE,
} from '../../lib/service-task-semantics';
import { sc } from './service-center-ui';
import { ServiceHistoryTimelineRow } from './ServiceHistoryTimelineRow';
import { useServiceTaskLookups } from './useServiceTaskLookups';
import { VehicleTaskDetailDrawer } from '../tasks/VehicleTaskDetailDrawer';

interface ServiceHistoryPanelProps {
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenVendor?: (vendorId: string) => void;
  initialVehicleId?: string;
}

const HISTORY_TYPES: ApiTaskType[] = [
  ...SERVICE_MAINTENANCE_TYPES,
  'VEHICLE_INSPECTION',
  'REPAIR',
];

export function ServiceHistoryPanel({
  tasks,
  vendors,
  loading,
  onOpenVehicle,
  onOpenVendor,
  initialVehicleId,
}: ServiceHistoryPanelProps) {
  const lookups = useServiceTaskLookups(vendors);
  const [filters, setFilters] = useState<ServiceHistoryFilters>(DEFAULT_SERVICE_HISTORY_FILTERS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [localTasks, setLocalTasks] = useState(tasks);

  useEffect(() => {
    if (!initialVehicleId) return;
    setFilters((prev) => ({ ...prev, vehicleId: initialVehicleId }));
  }, [initialVehicleId]);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const filtered = useMemo(
    () => applyServiceHistoryFilters(localTasks, filters),
    [localTasks, filters],
  );
  const groups = useMemo(() => groupHistoryByDate(filtered), [filtered]);

  const vehicleOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of localTasks) {
      if (t.vehicleId) ids.add(t.vehicleId);
    }
    return [...ids]
      .map((id) => ({ id, label: buildVehicleLabel(lookups.vehicleMap.get(id) ?? null) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [localTasks, lookups.vehicleMap]);

  const selectClass =
    'rounded-lg border border-border bg-card px-2 py-1.5 text-[10px] text-foreground min-w-0';

  return (
    <div className={sc.panel}>
      <p className={sc.sectionEyebrow}>Verlauf</p>
      <h3 className={`${sc.sectionTitle} mb-1`}>Erledigte Wartungsaufgaben</h3>
      <p className="text-[11px] text-muted-foreground mb-4 max-w-2xl leading-relaxed">
        Abgeschlossene Service-, Reparatur- und Inspektionsaufgaben aus dem Task-System — keine separate
        Service-Case-Historie.
      </p>

      <div className="mb-4 rounded-xl border border-border/45 bg-muted/15 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Filter className="w-3 h-3" />
          Filter
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <select
            value={filters.vehicleId}
            onChange={(e) => setFilters((f) => ({ ...f, vehicleId: e.target.value }))}
            className={selectClass}
          >
            <option value="ALL">Alle Fahrzeuge</option>
            {vehicleOptions.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
          <select
            value={filters.vendorId}
            onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}
            className={selectClass}
          >
            <option value="ALL">Alle Partner</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as ServiceHistoryFilters['type'] }))}
            className={selectClass}
          >
            <option value="ALL">Alle Typen</option>
            {HISTORY_TYPES.map((t) => (
              <option key={t} value={t}>{TASK_TYPE_LABEL_DE[t]}</option>
            ))}
          </select>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            className={selectClass}
            aria-label="Von Datum"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            className={selectClass}
            aria-label="Bis Datum"
          />
          <label className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
            <input
              type="checkbox"
              checked={filters.includeCancelled}
              onChange={(e) => setFilters((f) => ({ ...f, includeCancelled: e.target.checked }))}
              className="rounded border-border"
            />
            Stornierte einbeziehen
          </label>
        </div>
      </div>

      {loading && filtered.length === 0 ? (
        <div className="space-y-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Noch keine erledigten Wartungsaufgaben"
          description="Abgeschlossene Service- und Reparaturaufgaben erscheinen hier chronologisch."
        />
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([day, dayTasks]) => (
            <section key={day}>
              <h4 className="text-[11px] font-semibold text-muted-foreground mb-3 sticky top-0 bg-card/90 backdrop-blur-sm py-1 z-[1]">
                {day}
              </h4>
              <div className="border-l border-border/50 ml-1.5">
                {dayTasks.map((task) => (
                  <ServiceHistoryTimelineRow
                    key={task.id}
                    task={task}
                    vehicleLabel={buildVehicleLabel(lookups.resolveVehicle(task))}
                    vendorName={lookups.resolveVendorName(task)}
                    assigneeName={lookups.resolveAssigneeName(task)}
                    onOpenTask={(id) => {
                      setSelectedTaskId(id);
                      setDrawerOpen(true);
                    }}
                    onOpenVehicle={onOpenVehicle}
                    onOpenVendor={onOpenVendor}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <VehicleTaskDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        orgId={lookups.orgId}
        taskId={selectedTaskId}
        vehicle={
          selectedTaskId
            ? lookups.resolveVehicle(
                localTasks.find((t) => t.id === selectedTaskId) ?? ({ vehicleId: null } as ApiTask),
              )
            : null
        }
        orgMembers={lookups.orgMembers}
        onTaskUpdated={(task) => {
          setLocalTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
        }}
      />
    </div>
  );
}
