import { useEffect, useMemo, useState } from 'react';
import { api, type ApiServiceCase, type ApiTask, type ApiTaskType, type Vendor } from '../../../lib/api';
import { DetailDrawer, EmptyState, SkeletonCard } from '../../../components/patterns';
import { Filter } from 'lucide-react';
import {
  applyUnifiedServiceHistoryFilters,
  buildUnifiedServiceHistory,
  DEFAULT_UNIFIED_SERVICE_HISTORY_FILTERS,
  groupUnifiedHistoryByDate,
  paginateUnifiedServiceHistory,
  SERVICE_HISTORY_EVENT_KIND_LABEL,
  type ServiceHistoryEventKind,
  type UnifiedServiceHistoryFilters,
} from '../../lib/unified-service-history.utils';
import {
  buildVehicleLabel,
  SERVICE_MAINTENANCE_TYPES,
  TASK_TYPE_LABEL_DE,
} from '../../lib/service-task-semantics';
import { sc } from './service-center-ui';
import { UnifiedServiceHistoryTimelineRow } from './UnifiedServiceHistoryTimelineRow';
import { useServiceTaskLookups } from './useServiceTaskLookups';
import { useUnifiedServiceHistoryData } from './useUnifiedServiceHistoryData';
import { VehicleTaskDetailDrawer } from '../tasks/VehicleTaskDetailDrawer';
import { Button } from '../../../components/ui/button';

interface ServiceHistoryPanelProps {
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenVendor?: (vendorId: string) => void;
  initialVehicleId?: string;
  /** When false, falls back to legacy task-only filtering (tests / compatibility). */
  unified?: boolean;
}

const HISTORY_TYPES: ApiTaskType[] = [
  ...SERVICE_MAINTENANCE_TYPES,
  'VEHICLE_INSPECTION',
  'REPAIR',
];

const HISTORY_KIND_OPTIONS: Array<ServiceHistoryEventKind | 'ALL'> = [
  'ALL',
  'task_completed',
  'task_cancelled',
  'case_completed',
  'case_cancelled',
  'case_status_change',
  'service_event',
  'linked_document',
  'linked_invoice',
];

export function ServiceHistoryPanel({
  tasks,
  vendors,
  loading,
  onOpenVehicle,
  onOpenVendor,
  initialVehicleId,
  unified = true,
}: ServiceHistoryPanelProps) {
  const lookups = useServiceTaskLookups(vendors);
  const [filters, setFilters] = useState<UnifiedServiceHistoryFilters>(DEFAULT_UNIFIED_SERVICE_HISTORY_FILTERS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDrawerOpen, setCaseDrawerOpen] = useState(false);
  const [caseDetail, setCaseDetail] = useState<ApiServiceCase | null>(null);
  const [caseDetailLoading, setCaseDetailLoading] = useState(false);
  const [localTasks, setLocalTasks] = useState(tasks);
  const [pageLimit, setPageLimit] = useState(50);

  const historyData = useUnifiedServiceHistoryData(lookups.orgId, localTasks, {
    enabled: unified,
    vehicleId: filters.vehicleId === 'ALL' ? undefined : filters.vehicleId,
  });

  useEffect(() => {
    if (!initialVehicleId) return;
    setFilters((prev) => ({ ...prev, vehicleId: initialVehicleId }));
  }, [initialVehicleId]);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    setPageLimit(50);
  }, [filters, localTasks, historyData.serviceCases, historyData.serviceEvents]);

  useEffect(() => {
    if (!caseDrawerOpen || !selectedCaseId || !lookups.orgId) {
      setCaseDetail(null);
      return;
    }
    let cancelled = false;
    setCaseDetailLoading(true);
    api.serviceCases
      .get(lookups.orgId, selectedCaseId)
      .then((detail) => {
        if (!cancelled) setCaseDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setCaseDetail(null);
      })
      .finally(() => {
        if (!cancelled) setCaseDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseDrawerOpen, selectedCaseId, lookups.orgId]);

  const allEntries = useMemo(() => {
    if (!unified) {
      return buildUnifiedServiceHistory({ tasks: localTasks, serviceCases: [], serviceEvents: [] });
    }
    return buildUnifiedServiceHistory({
      tasks: localTasks,
      serviceCases: historyData.serviceCases,
      serviceEvents: historyData.serviceEvents,
      invoicesById: historyData.invoicesById,
    });
  }, [unified, localTasks, historyData.serviceCases, historyData.serviceEvents, historyData.invoicesById]);

  const filtered = useMemo(
    () => applyUnifiedServiceHistoryFilters(allEntries, filters),
    [allEntries, filters],
  );

  const page = useMemo(
    () => paginateUnifiedServiceHistory(filtered, { offset: 0, limit: pageLimit }),
    [filtered, pageLimit],
  );

  const groups = useMemo(() => groupUnifiedHistoryByDate(page.items), [page.items]);

  const vehicleOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const task of localTasks) {
      if (task.vehicleId) ids.add(task.vehicleId);
    }
    for (const serviceCase of historyData.serviceCases) {
      if (serviceCase.vehicleId) ids.add(serviceCase.vehicleId);
    }
    return [...ids]
      .map((id) => ({ id, label: buildVehicleLabel(lookups.vehicleMap.get(id) ?? null) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [localTasks, historyData.serviceCases, lookups.vehicleMap]);

  const isLoading = Boolean(loading || (unified && historyData.loading));
  const selectClass =
    'rounded-lg border border-border surface-premium px-2 py-1.5 text-[10px] text-foreground min-w-0';

  const resolveVehicleLabel = (vehicleId: string | null | undefined) => {
    if (!vehicleId) return '—';
    return buildVehicleLabel(lookups.vehicleMap.get(vehicleId) ?? null);
  };

  const resolveVendorName = (vendorId: string | null | undefined) => {
    if (!vendorId) return null;
    return vendors.find((vendor) => vendor.id === vendorId)?.name ?? null;
  };

  return (
    <div className={sc.panel}>
      <p className={sc.sectionEyebrow}>Verlauf</p>
      <h3 className={`${sc.sectionTitle} mb-1`}>Servicehistorie</h3>
      <p className="text-[11px] text-muted-foreground mb-4 max-w-2xl leading-relaxed">
        Vereinheitlichte Chronologie aus erledigten Aufgaben, abgeschlossenen Servicefällen,
        dokumentierten Serviceereignissen sowie stabil verknüpften Dokumenten und Rechnungen.
        Ereignisse stammen ausschließlich aus gespeicherten Zeitstempeln — keine erfundene Reihenfolge.
      </p>

      {historyData.error ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-3">{historyData.error}</p>
      ) : null}

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
            value={filters.kind}
            onChange={(e) =>
              setFilters((f) => ({ ...f, kind: e.target.value as UnifiedServiceHistoryFilters['kind'] }))
            }
            className={selectClass}
          >
            {HISTORY_KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === 'ALL' ? 'Alle Ereignistypen' : SERVICE_HISTORY_EVENT_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as UnifiedServiceHistoryFilters['type'] }))}
            className={selectClass}
          >
            <option value="ALL">Alle Aufgabentypen</option>
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

      {isLoading && filtered.length === 0 ? (
        <div className="space-y-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Noch keine Servicehistorie"
          description="Abgeschlossene Aufgaben, Servicefälle und dokumentierte Serviceereignisse erscheinen hier chronologisch."
        />
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([day, dayEntries]) => (
            <section key={day}>
              <h4 className="text-[11px] font-semibold text-muted-foreground mb-3 sticky top-0 surface-frosted py-1 z-[1]">
                {day}
              </h4>
              <div className="border-l border-border/50 ml-1.5">
                {dayEntries.map((entry) => (
                  <UnifiedServiceHistoryTimelineRow
                    key={entry.id}
                    entry={entry}
                    vehicleLabel={resolveVehicleLabel(entry.vehicleId)}
                    vendorName={resolveVendorName(entry.vendorId)}
                    onOpenTask={(id) => {
                      setSelectedTaskId(id);
                      setTaskDrawerOpen(true);
                    }}
                    onOpenServiceCase={(id) => {
                      setSelectedCaseId(id);
                      setCaseDrawerOpen(true);
                    }}
                    onOpenVehicle={onOpenVehicle}
                    onOpenVendor={onOpenVendor}
                  />
                ))}
              </div>
            </section>
          ))}

          {page.hasMore ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPageLimit((prev) => prev + 50)}
              >
                Weitere Einträge laden ({page.items.length} von {page.total})
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <VehicleTaskDetailDrawer
        open={taskDrawerOpen}
        onOpenChange={setTaskDrawerOpen}
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

      <DetailDrawer
        open={caseDrawerOpen}
        onOpenChange={setCaseDrawerOpen}
        title={caseDetail?.title ?? 'Servicefall'}
        description="Abgeschlossener oder stornierter Servicefall"
      >
        {caseDetailLoading ? (
          <SkeletonCard />
        ) : caseDetail ? (
          <div className="space-y-3 text-[12px]">
            <p className="text-muted-foreground">{caseDetail.description || '—'}</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{caseDetail.status}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Quelle</p>
                <p className="font-medium">{caseDetail.source}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Eröffnet</p>
                <p className="font-medium">{caseDetail.openedAt ?? caseDetail.createdAt}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Abgeschlossen</p>
                <p className="font-medium">{caseDetail.completedAt ?? caseDetail.cancelledAt ?? '—'}</p>
              </div>
            </div>
            {caseDetail.completionNotes ? (
              <p className="text-[11px] text-muted-foreground border-l-2 border-border/60 pl-2">
                {caseDetail.completionNotes}
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState title="Servicefall nicht verfügbar" description="Der Servicefall konnte nicht geladen werden." />
        )}
      </DetailDrawer>
    </div>
  );
}
