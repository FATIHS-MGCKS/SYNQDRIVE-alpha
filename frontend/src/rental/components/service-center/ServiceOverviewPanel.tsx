import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Activity, ChevronRight } from 'lucide-react';
import { EmptyState } from '../../../components/patterns';
import { api, type ApiTask, type Vendor } from '../../../lib/api';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import type { VehicleData } from '../../data/vehicles';
import { formatTaskDueDate } from '../../lib/task-display.utils';
import { VehicleTaskDetailDrawer } from '../tasks/VehicleTaskDetailDrawer';
import { sc } from './service-center-ui';
import {
  groupTasksByDueDate,
  selectActionRequiredTasks,
  selectRecentlyCompleted,
  selectUpcomingTasks,
  selectVendorWaitingTasks,
} from './service-center.utils';
import { ServiceOverviewTaskRow } from './ServiceOverviewTaskRow';

interface ServiceOverviewPanelProps {
  activeTasks: ApiTask[];
  historyTasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  onOpenTasks?: () => void;
  onOpenSchedule?: () => void;
  onCreateTask?: () => void;
  onReload?: () => void;
}

function buildMmy(vehicle: VehicleData): string {
  const parts = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
  const year = vehicle.year ? String(vehicle.year) : '';
  return [parts || vehicle.model, year].filter(Boolean).join(' ');
}

export function ServiceOverviewPanel({
  activeTasks,
  historyTasks,
  vendors,
  loading,
  onOpenTasks,
  onOpenSchedule,
  onCreateTask,
  onReload,
}: ServiceOverviewPanelProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles, healthMap, healthLoading } = useFleetVehicles();
  const [localTasks, setLocalTasks] = useState(activeTasks);
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  useEffect(() => {
    setLocalTasks(activeTasks);
  }, [activeTasks]);

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

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const vehicleMap = useMemo(() => new Map(fleetVehicles.map((v) => [v.id, v])), [fleetVehicles]);

  const actionRequired = useMemo(() => selectActionRequiredTasks(localTasks, 10), [localTasks]);
  const upcoming = useMemo(() => selectUpcomingTasks(localTasks, 12), [localTasks]);
  const upcomingGroups = useMemo(() => groupTasksByDueDate(upcoming), [upcoming]);
  const vendorWaiting = useMemo(() => selectVendorWaitingTasks(localTasks, 8), [localTasks]);
  const recentlyCompleted = useMemo(
    () => selectRecentlyCompleted(historyTasks.length ? historyTasks : localTasks, 6),
    [historyTasks, localTasks],
  );

  const healthServiceAlerts = useMemo(() => {
    if (healthLoading || healthMap.size === 0) return [];
    return fleetVehicles
      .filter((v) => {
        const h = healthMap.get(v.id);
        if (!h) return false;
        const mod = h.modules?.service_compliance?.state;
        return mod === 'warning' || mod === 'critical' || h.rental_blocked;
      })
      .slice(0, 6);
  }, [fleetVehicles, healthMap, healthLoading]);

  const resolveVehicle = useCallback(
    (task: ApiTask) => (task.vehicleId ? vehicleMap.get(task.vehicleId) ?? null : null),
    [vehicleMap],
  );

  const resolveAssignee = useCallback(
    (task: ApiTask) => {
      if (!task.assignedUserId) return null;
      return orgMembers.find((m) => m.id === task.assignedUserId)?.name ?? null;
    },
    [orgMembers],
  );

  const openTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setDrawerOpen(true);
  }, []);

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
      void runMutation(task.id, () => api.tasks.complete(orgId, task.id), 'Aufgabe abgeschlossen');
    },
    [orgId, runMutation],
  );

  const selectedVehicle = useMemo(() => {
    const task = localTasks.find((t) => t.id === selectedTaskId);
    return task ? resolveVehicle(task) : null;
  }, [localTasks, selectedTaskId, resolveVehicle]);

  return (
    <div className="space-y-4">
      {healthMap.size > 0 && (
        <section className={`${sc.controlBar} !p-3 sm:!p-3.5`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                <Activity className="w-3.5 h-3.5" />
              </span>
              <div>
                <p className={sc.sectionEyebrow}>Health-Signale</p>
                <h3 className={sc.sectionTitle}>Fahrzeuge mit Service-/Compliance-Hinweis</h3>
              </div>
            </div>
            {healthLoading && (
              <span className="text-[10px] text-muted-foreground animate-pulse">Health lädt…</span>
            )}
          </div>
          {healthServiceAlerts.length === 0 && !healthLoading ? (
            <p className="text-[11px] text-muted-foreground">
              Keine Fahrzeuge mit kritischem Service-Compliance- oder Mietblock-Signal.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {healthServiceAlerts.map((v) => {
                const h = healthMap.get(v.id);
                const mod = h?.modules?.service_compliance?.state;
                const tone =
                  mod === 'critical' || h?.rental_blocked
                    ? 'border-red-500/30 bg-red-500/[0.04] text-red-700 dark:text-red-300'
                    : 'border-amber-500/30 bg-amber-500/[0.04] text-amber-800 dark:text-amber-300';
                return (
                  <div
                    key={v.id}
                    className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-medium ${tone}`}
                  >
                    <span className="font-semibold">{v.license}</span>
                    <span className="mx-1 opacity-60">·</span>
                    {buildMmy(v)}
                    {h?.rental_blocked && <span className="ml-1 opacity-80">· Miete blockiert</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className={sc.panel}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <p className={sc.sectionEyebrow}>Sofort handeln</p>
            <h3 className={sc.sectionTitle}>Action Required</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Überfällig, kritisch, blockierend oder bald fällig
            </p>
          </div>
          {onOpenTasks && (
            <button
              type="button"
              onClick={onOpenTasks}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--brand-ink)] hover:underline"
            >
              Alle Aufgaben
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loading && actionRequired.length === 0 ? (
          <p className="text-[11px] text-muted-foreground animate-pulse">Aufgaben werden geladen…</p>
        ) : actionRequired.length === 0 ? (
          <EmptyState
            title="Keine überfälligen Service-Aufgaben"
            description="Aktuell gibt es keinen dringenden Handlungsbedarf in der Service-Warteschlange."
            action={
              onCreateTask ? (
                <button
                  type="button"
                  onClick={onCreateTask}
                  className="text-[11px] font-semibold px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted/40"
                >
                  Aufgabe anlegen
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {actionRequired.map((task) => (
              <ServiceOverviewTaskRow
                key={task.id}
                task={task}
                vehicle={resolveVehicle(task)}
                vendorName={task.vendorId ? vendorMap.get(task.vendorId) ?? null : null}
                assigneeName={resolveAssignee(task)}
                mutating={mutatingId === task.id}
                onOpen={openTask}
                onWaiting={handleWaiting}
                onComplete={handleComplete}
                onSchedule={(task) => openTask(task.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className={sc.panel}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className={sc.sectionEyebrow}>Terminplan</p>
              <h3 className={sc.sectionTitle}>Upcoming Service Schedule</h3>
            </div>
            {onOpenSchedule && (
              <button
                type="button"
                onClick={onOpenSchedule}
                className="text-[11px] font-semibold text-[color:var(--brand-ink)] hover:underline"
              >
                Vollansicht
              </button>
            )}
          </div>

          {loading && upcoming.length === 0 ? (
            <p className="text-[11px] text-muted-foreground animate-pulse">Termine werden geladen…</p>
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="Keine anstehenden Termine"
              description="Offene Aufgaben haben aktuell kein nahes Fälligkeitsdatum."
            />
          ) : (
            <div className="space-y-3">
              {Array.from(upcomingGroups.entries()).map(([day, dayTasks]) => (
                <div key={day}>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    {day}
                  </h4>
                  <div className="space-y-1.5">
                    {dayTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => openTask(task.id)}
                        className="w-full text-left rounded-lg border border-border/40 px-2.5 py-2 hover:bg-muted/25 transition-colors"
                      >
                        <p className="text-[11px] font-medium truncate">{task.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {resolveVehicle(task)?.license ?? '—'}
                          {task.dueDate ? ` · ${formatTaskDueDate(task.dueDate)}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={sc.panel}>
          <div className="mb-3">
            <p className={sc.sectionEyebrow}>Partner</p>
            <h3 className={sc.sectionTitle}>Vendor Waiting</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Wartet auf Rückmeldung oder Abschluss durch Partner
            </p>
          </div>

          {loading && vendorWaiting.length === 0 ? (
            <p className="text-[11px] text-muted-foreground animate-pulse">Partner-Aufgaben laden…</p>
          ) : vendorWaiting.length === 0 ? (
            <EmptyState
              title="Keine wartenden Partner-Fälle"
              description="Derzeit warten keine Aufgaben auf einen Dienstleister."
            />
          ) : (
            <div className="space-y-2">
              {vendorWaiting.map((task) => (
                <ServiceOverviewTaskRow
                  key={task.id}
                  task={task}
                  vehicle={resolveVehicle(task)}
                  vendorName={task.vendorId ? vendorMap.get(task.vendorId) ?? 'Partner' : null}
                  assigneeName={resolveAssignee(task)}
                  compact
                  mutating={mutatingId === task.id}
                  onOpen={openTask}
                  onWaiting={handleWaiting}
                  onSchedule={(task) => openTask(task.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={sc.panel}>
        <div className="mb-3">
          <p className={sc.sectionEyebrow}>Verlauf</p>
          <h3 className={sc.sectionTitle}>Recently Completed</h3>
        </div>

        {loading && recentlyCompleted.length === 0 ? (
          <p className="text-[11px] text-muted-foreground animate-pulse">Verlauf wird geladen…</p>
        ) : recentlyCompleted.length === 0 ? (
          <EmptyState
            title="Noch keine abgeschlossenen Fälle"
            description="Erledigte Service-, Reparatur- und Prüfaufgaben erscheinen hier."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {recentlyCompleted.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => openTask(task.id)}
                className="text-left rounded-xl border border-border/40 px-3 py-2.5 hover:bg-muted/25 transition-colors"
              >
                <p className="text-[11px] font-semibold truncate">{task.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {resolveVehicle(task)?.license ?? '—'}
                  {task.completedAt
                    ? ` · ${formatTaskDueDate(task.completedAt)}`
                    : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

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
      />
    </div>
  );
}
