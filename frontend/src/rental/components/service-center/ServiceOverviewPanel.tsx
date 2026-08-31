import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { EmptyState } from '../../../components/patterns';
import { api, type ApiTask, type ApiTaskDetail, type Vendor } from '../../../lib/api';
import { TaskDetailCompleteDialog } from '../../../lib/tasks/components/TaskDetailCompleteDialog';
import type { CompleteTaskPayload } from '../../../lib/tasks/types';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
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
import { useLanguage } from '../../../i18n/LanguageContext';
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
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [localTasks, setLocalTasks] = useState(activeTasks);
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completeDetail, setCompleteDetail] = useState<ApiTaskDetail | null>(null);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

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
      setCompleteError(null);
      setCompleteLoading(true);
      setCompleteDialogOpen(true);
      void api.tasks
        .get(orgId, task.id)
        .then((detail) => setCompleteDetail(detail))
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Aufgabe konnte nicht geladen werden';
          setCompleteError(message);
          toast.error(t('rental.service.toast.cannotComplete'), { description: message });
          setCompleteDialogOpen(false);
        })
        .finally(() => setCompleteLoading(false));
    },
    [orgId, t],
  );

  const submitComplete = useCallback(
    async (payload: CompleteTaskPayload) => {
      if (!orgId || !completeDetail) return;
      setCompleteLoading(true);
      setCompleteError(null);
      try {
        const updated = await api.tasks.complete(orgId, completeDetail.summary.id, payload);
        setLocalTasks((prev) =>
          prev.map((t) =>
            t.id === updated.summary.id
              ? {
                  ...t,
                  status: updated.summary.status,
                  completedAt: updated.timing.completedAt ?? t.completedAt,
                }
              : t,
          ),
        );
        toast.success(t('rental.service.toast.taskCompleted'));
        setCompleteDialogOpen(false);
        setCompleteDetail(null);
        onReload?.();
      } catch (err) {
        setCompleteError(err instanceof Error ? err.message : 'Abschluss fehlgeschlagen');
        throw err;
      } finally {
        setCompleteLoading(false);
      }
    },
    [orgId, completeDetail, onReload, t],
  );

  const selectedVehicle = useMemo(() => {
    const task = localTasks.find((t) => t.id === selectedTaskId);
    return task ? resolveVehicle(task) : null;
  }, [localTasks, selectedTaskId, resolveVehicle]);

  return (
    <div className="space-y-4">
      <section className={sc.panel}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <p className={sc.sectionEyebrow}>{t('serviceCenter.overview.actionRequired.eyebrow')}</p>
            <h3 className={sc.sectionTitle}>{t('serviceCenter.overview.actionRequired.title')}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t('serviceCenter.overview.actionRequired.subtitle')}
            </p>
          </div>
          {onOpenTasks && (
            <button
              type="button"
              onClick={onOpenTasks}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--brand-ink)] hover:underline"
            >
              {t('serviceCenter.overview.allTasks')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loading && actionRequired.length === 0 ? (
          <p className="text-[11px] text-muted-foreground animate-pulse">{t('serviceCenter.overview.tasksLoading')}</p>
        ) : actionRequired.length === 0 ? (
          <EmptyState
            title={t('serviceCenter.overview.noOverdueTasks')}
            description={t('serviceCenter.overview.noOverdueTasksDesc')}
            action={
              onCreateTask ? (
                <button
                  type="button"
                  onClick={onCreateTask}
                  className="text-[11px] font-semibold px-3 py-2 rounded-xl border border-border surface-premium hover:bg-muted/40"
                >
                  {t('serviceCenter.overview.createTask')}
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
              <p className={sc.sectionEyebrow}>{t('serviceCenter.overview.schedule.eyebrow')}</p>
              <h3 className={sc.sectionTitle}>{t('serviceCenter.overview.schedule.title')}</h3>
            </div>
            {onOpenSchedule && (
              <button
                type="button"
                onClick={onOpenSchedule}
                className="text-[11px] font-semibold text-[color:var(--brand-ink)] hover:underline"
              >
                {t('serviceCenter.overview.fullView')}
              </button>
            )}
          </div>

          {loading && upcoming.length === 0 ? (
            <p className="text-[11px] text-muted-foreground animate-pulse">{t('serviceCenter.overview.scheduleLoading')}</p>
          ) : upcoming.length === 0 ? (
            <EmptyState
              title={t('serviceCenter.overview.noUpcoming')}
              description={t('serviceCenter.overview.noUpcomingDesc')}
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
            <p className={sc.sectionEyebrow}>{t('serviceCenter.overview.vendor.eyebrow')}</p>
            <h3 className={sc.sectionTitle}>{t('serviceCenter.overview.vendor.title')}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t('serviceCenter.overview.vendor.subtitle')}
            </p>
          </div>

          {loading && vendorWaiting.length === 0 ? (
            <p className="text-[11px] text-muted-foreground animate-pulse">{t('serviceCenter.overview.vendorLoading')}</p>
          ) : vendorWaiting.length === 0 ? (
            <EmptyState
              title={t('serviceCenter.overview.noVendorWaiting')}
              description={t('serviceCenter.overview.noVendorWaitingDesc')}
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
          <p className={sc.sectionEyebrow}>{t('serviceCenter.overview.history.eyebrow')}</p>
          <h3 className={sc.sectionTitle}>{t('serviceCenter.overview.recentlyCompleted')}</h3>
        </div>

        {loading && recentlyCompleted.length === 0 ? (
          <p className="text-[11px] text-muted-foreground animate-pulse">{t('serviceCenter.overview.historyLoading')}</p>
        ) : recentlyCompleted.length === 0 ? (
          <EmptyState
            title={t('serviceCenter.overview.noCompleted')}
            description={t('serviceCenter.overview.noCompletedDesc')}
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
                  {task.completedAt ? ` · ${formatTaskDueDate(task.completedAt)}` : ''}
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

      <TaskDetailCompleteDialog
        open={completeDialogOpen}
        onOpenChange={(open) => {
          setCompleteDialogOpen(open);
          if (!open) {
            setCompleteDetail(null);
            setCompleteError(null);
          }
        }}
        detail={completeDetail}
        loading={completeLoading}
        submitError={completeError}
        onSubmit={submitComplete}
      />
    </div>
  );
}
