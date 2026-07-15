import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Car,
  CalendarClock,
  Clock,
  ListTodo,
  Plus,
  UserX,
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/patterns';
import { useFleetVehicles } from '../../rental/FleetContext';
import { taskRequiresResolutionNote } from '../../rental/lib/task-detail.utils';
import type { ApiTask } from '../../lib/api';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorToday } from '../hooks/useOperatorToday';
import type { OperatorTodayBucketSlice } from '../hooks/operatorTodayFeed.utils';
import { useOperatorOperationalAlerts } from '../hooks/useOperatorOperationalAlerts';
import { OperatorBookingCard } from '../components/OperatorBookingCard';
import { OperatorBookingDetailSheet } from '../components/OperatorBookingDetailSheet';
import { OperatorBookingTaskGroupCard } from '../components/OperatorBookingTaskGroupCard';
import { OperatorListCard } from '../components/OperatorListCard';
import { OperatorTodaySection } from '../components/OperatorTodaySection';
import { OperatorTabletFrame } from '../components/OperatorTabletFrame';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import type { OperatorTodayBookingItem, OperatorTodayTaskEntry } from '../lib/operatorData';
import { toHandoverBookingSeed } from '../lib/operatorData';
import { OperatorTaskCard } from '../tasks/OperatorTaskCard';
import { useOperatorTaskActions } from '../tasks/useOperatorTaskActions';

const TASK_BUCKET_SECTIONS: Array<{
  bucket: 'NOW' | 'TODAY' | 'UPCOMING' | 'PLANNED' | 'UNASSIGNED';
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: ReactNode;
}> = [
  {
    bucket: 'NOW',
    title: 'Jetzt erforderlich',
    emptyTitle: 'Nichts Dringendes',
    emptyDescription: 'Keine überfälligen oder priorisierten Aufgaben.',
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  {
    bucket: 'TODAY',
    title: 'Heute fällig',
    emptyTitle: 'Heute nichts offen',
    emptyDescription: 'Keine Aufgaben mit Fälligkeit im heutigen Org-Tagesfenster.',
    icon: <ListTodo className="h-5 w-5" />,
  },
  {
    bucket: 'UPCOMING',
    title: 'Demnächst',
    emptyTitle: 'Keine anstehenden Aufgaben',
    emptyDescription: 'Nichts in den nächsten 72 Stunden.',
    icon: <Clock className="h-5 w-5" />,
  },
  {
    bucket: 'PLANNED',
    title: 'Geplant',
    emptyTitle: 'Keine geplanten Aufgaben',
    emptyDescription: 'Keine Tasks mit zukünftiger Aktivierung.',
    icon: <CalendarClock className="h-5 w-5" />,
  },
  {
    bucket: 'UNASSIGNED',
    title: 'Unzugewiesen',
    emptyTitle: 'Alles zugewiesen',
    emptyDescription: 'Keine offenen Tasks ohne Bearbeiter.',
    icon: <UserX className="h-5 w-5" />,
  },
];

export function OperatorTodayView() {
  const {
    orgId,
    orgLoading,
    snapshot,
    loading,
    bookingsLoading,
    error,
    bookingsError,
    reload,
  } = useOperatorToday('de');
  const { openHandover } = useOperatorHandover();
  const { openSheet, setActiveTab, setPendingTasksBookingId, setSelectedVehicleId } = useOperatorShell();
  const { fleetVehicles } = useFleetVehicles();
  const { alerts: operationalAlerts } = useOperatorOperationalAlerts(5);
  const isTablet = useOperatorTabletLayout();
  const [detailItem, setDetailItem] = useState<OperatorTodayBookingItem | null>(null);

  const { mutating, start, complete } = useOperatorTaskActions(() => {
    void reload();
  });

  const vehicleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const vehicle of fleetVehicles) {
      map.set(vehicle.id, vehicle.license || vehicle.model);
    }
    return map;
  }, [fleetVehicles]);

  const openTask = useCallback(
    (task: ApiTask, focusComment = false) => {
      openSheet({
        type: 'task-detail',
        taskId: task.id,
        task,
        focusComment,
        onUpdated: () => void reload(),
      });
    },
    [openSheet, reload],
  );

  const openBookingTaskGroup = useCallback(
    (bookingId: string) => {
      setPendingTasksBookingId(bookingId);
      setActiveTab('tasks');
    },
    [setActiveTab, setPendingTasksBookingId],
  );

  const handleQuickComplete = useCallback(
    async (task: ApiTask) => {
      if (taskRequiresResolutionNote(task.type)) {
        openTask(task);
        return;
      }
      await complete(task.id);
    },
    [complete, openTask],
  );

  const startHandover = useCallback(
    (item: OperatorTodayBookingItem, kind: 'PICKUP' | 'RETURN') => {
      openHandover({
        bookingId: item.bookingId,
        kind,
        booking: toHandoverBookingSeed(item),
      });
    },
    [openHandover],
  );

  const renderTaskEntry = useCallback(
    (entry: OperatorTodayTaskEntry) => {
      if (entry.kind === 'booking-group') {
        return (
          <OperatorBookingTaskGroupCard
            key={`group-${entry.bookingId}`}
            bookingId={entry.bookingId}
            tasks={entry.tasks}
            vehicleLabel={entry.vehicleId ? vehicleMap.get(entry.vehicleId) ?? null : null}
            bookingLabel={`Buchung ${entry.bookingId.slice(0, 8)}…`}
            disabled={mutating}
            onOpen={() => openBookingTaskGroup(entry.bookingId)}
          />
        );
      }
      return (
        <OperatorTaskCard
          key={entry.task.id}
          task={entry.task}
          vehicleLabel={entry.task.vehicleId ? vehicleMap.get(entry.task.vehicleId) ?? null : null}
          bookingLabel={
            entry.task.bookingId ? `Buchung ${entry.task.bookingId.slice(0, 8)}…` : null
          }
          disabled={mutating}
          onOpen={() => openTask(entry.task)}
          onStart={() => void start(entry.task.id)}
          onComplete={() => void handleQuickComplete(entry.task)}
          onComment={() => openTask(entry.task, true)}
        />
      );
    },
    [handleQuickComplete, mutating, openBookingTaskGroup, openTask, start, vehicleMap],
  );

  const renderBucketSection = useCallback(
    (slice: OperatorTodayBucketSlice | undefined, meta: (typeof TASK_BUCKET_SECTIONS)[number]) => {
      if (!slice) return null;
      if (meta.bucket === 'UNASSIGNED' && !snapshot.taskFeed.canViewUnassigned) return null;

      const sectionEmpty = (
        <EmptyState compact icon={meta.icon} title={meta.emptyTitle} description={meta.emptyDescription} />
      );

      return (
        <OperatorTodaySection
          key={meta.bucket}
          title={meta.title}
          count={slice.count}
          isEmpty={!slice.loading && !slice.error && slice.entries.length === 0}
          empty={sectionEmpty}
        >
          {slice.loading && <SkeletonRows rows={2} />}
          {!slice.loading && slice.error && (
            <ErrorState compact title={`${meta.title} nicht verfügbar`} error={slice.error} onRetry={() => void reload()} />
          )}
          {!slice.loading && !slice.error && (
            <div className="space-y-2">{slice.entries.map((entry) => renderTaskEntry(entry))}</div>
          )}
        </OperatorTodaySection>
      );
    },
    [reload, renderTaskEntry, snapshot.taskFeed.canViewUnassigned],
  );

  if (!orgLoading && !orgId) {
    return (
      <EmptyState
        compact
        icon={<Car className="h-5 w-5" />}
        title="Keine Organisation"
        description="Melde dich mit einem Miet-Organisationskonto an."
      />
    );
  }

  const sectionEmpty = (icon: ReactNode, title: string, description: string) => (
    <EmptyState compact icon={icon} title={title} description={description} />
  );

  const showAllTasksAction =
    snapshot.totalOpenTasksCount > snapshot.openTaskEntries.length ? (
      <button
        type="button"
        onClick={() => setActiveTab('tasks')}
        className="sq-btn sq-btn-secondary min-h-8 px-2.5 text-[11px]"
      >
        Alle anzeigen ({snapshot.totalOpenTasksCount})
      </button>
    ) : snapshot.totalOpenTasksCount > 0 ? (
      <button
        type="button"
        onClick={() => setActiveTab('tasks')}
        className="sq-btn sq-btn-secondary min-h-8 px-2.5 text-[11px]"
      >
        Alle Aufgaben
      </button>
    ) : null;

  const mainContent = (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pb-4">
      <button
        type="button"
        onClick={() => openSheet({ type: 'booking-create' })}
        className="sq-3d-btn sq-3d-btn--primary flex min-h-[48px] w-full items-center justify-center gap-2 font-semibold"
      >
        <Plus className="h-5 w-5" />
        Buchung aufnehmen
      </button>

      {loading && !bookingsLoading && bookingsError == null && <SkeletonRows rows={4} />}
      {!loading && error && (
        <ErrorState compact title="Heute-Daten nicht verfügbar" error={error} onRetry={() => void reload()} />
      )}
      {bookingsError && !bookingsLoading && (
        <ErrorState compact title="Buchungen nicht verfügbar" error={bookingsError} onRetry={() => void reload()} />
      )}

      {!bookingsLoading && !bookingsError && (
        <>
          {operationalAlerts.length > 0 && (
            <OperatorTodaySection title="Operative Hinweise" count={operationalAlerts.length}>
              <div className="space-y-2">
                {operationalAlerts.map((alert) => (
                  <OperatorListCard
                    key={alert.id}
                    title={alert.title}
                    subtitle={alert.message}
                    badges={[
                      {
                        kind: 'blocked',
                        label: alert.severity === 'CRITICAL' ? 'Kritisch' : 'Warnung',
                        tone: alert.severity === 'CRITICAL' ? 'critical' : 'warning',
                      },
                    ]}
                    onClick={
                      alert.bookingId
                        ? () => {
                            setPendingTasksBookingId(alert.bookingId!);
                            setActiveTab('tasks');
                          }
                        : () => setActiveTab('tasks')
                    }
                  />
                ))}
              </div>
            </OperatorTodaySection>
          )}

          <OperatorTodaySection
            title="Jetzt fällig"
            count={snapshot.dueNow.length}
            isEmpty={snapshot.dueNow.length === 0}
            empty={sectionEmpty(
              <AlertTriangle className="h-5 w-5" />,
              'Nichts Dringendes',
              'Keine überfälligen oder unmittelbar anstehenden Übergaben.',
            )}
          >
            <div className="space-y-2">
              {snapshot.dueNow.map((item) => (
                <OperatorBookingCard
                  key={`${item.kind}-${item.bookingId}`}
                  item={item}
                  onPickupStart={() => startHandover(item, 'PICKUP')}
                  onReturnStart={() => startHandover(item, 'RETURN')}
                  onDetails={() => setDetailItem(item)}
                />
              ))}
            </div>
          </OperatorTodaySection>

          <OperatorTodaySection
            title="Abholungen heute"
            count={snapshot.pickupsToday.length}
            isEmpty={snapshot.pickupsToday.length === 0}
            empty={sectionEmpty(
              <ArrowUpRight className="h-5 w-5" />,
              'Keine Abholungen heute',
              'Sobald Pickups geplant sind, erscheinen sie hier.',
            )}
          >
            <div className="space-y-2">
              {snapshot.pickupsToday.map((item) => (
                <OperatorBookingCard
                  key={item.bookingId}
                  item={item}
                  onPickupStart={() => startHandover(item, 'PICKUP')}
                  onReturnStart={() => startHandover(item, 'RETURN')}
                  onDetails={() => setDetailItem(item)}
                />
              ))}
            </div>
          </OperatorTodaySection>

          <OperatorTodaySection
            title="Rückgaben heute"
            count={snapshot.returnsToday.length}
            isEmpty={snapshot.returnsToday.length === 0}
            empty={sectionEmpty(
              <ArrowDownLeft className="h-5 w-5" />,
              'Keine Rückgaben heute',
              'Sobald Returns geplant sind, erscheinen sie hier.',
            )}
          >
            <div className="space-y-2">
              {snapshot.returnsToday.map((item) => (
                <OperatorBookingCard
                  key={item.bookingId}
                  item={item}
                  onPickupStart={() => startHandover(item, 'PICKUP')}
                  onReturnStart={() => startHandover(item, 'RETURN')}
                  onDetails={() => setDetailItem(item)}
                />
              ))}
            </div>
          </OperatorTodaySection>

          <OperatorTodaySection title="Aufgaben — Übersicht" count={snapshot.totalOpenTasksCount} action={showAllTasksAction}>
            <div className="space-y-6">
              {TASK_BUCKET_SECTIONS.map((meta) =>
                renderBucketSection(snapshot.taskFeed.buckets[meta.bucket], meta),
              )}
            </div>
          </OperatorTodaySection>

          {snapshot.vehicleCheckTasks.length > 0 && (
            <OperatorTodaySection title="Fahrzeugchecks" count={snapshot.vehicleCheckTasks.length}>
              <div className="space-y-2">
                {snapshot.vehicleCheckTasks.map((task) => (
                  <OperatorTaskCard
                    key={`check-${task.id}`}
                    task={task}
                    vehicleLabel={task.vehicleId ? vehicleMap.get(task.vehicleId) ?? null : null}
                    disabled={mutating}
                    onOpen={() => openTask(task)}
                    onStart={() => void start(task.id)}
                    onComplete={() => void handleQuickComplete(task)}
                    onComment={() => openTask(task, true)}
                  />
                ))}
              </div>
            </OperatorTodaySection>
          )}

          <OperatorTodaySection
            title="Blocker"
            count={snapshot.blockedVehicles.length}
            isEmpty={snapshot.blockedVehicles.length === 0}
            empty={sectionEmpty(
              <Car className="h-5 w-5" />,
              'Keine blockierten Fahrzeuge',
              'Alle Fahrzeuge sind aus Rental-Health-Sicht vermietbar.',
            )}
          >
            <div className="space-y-2">
              {snapshot.blockedVehicles.map((v) => (
                <OperatorListCard
                  key={v.vehicleId}
                  title={`${v.label} · ${v.plate}`}
                  subtitle={v.station || undefined}
                  badges={[{ kind: 'blocked', label: 'Blockiert', tone: 'critical' }]}
                  onClick={() => {
                    setSelectedVehicleId(v.vehicleId);
                    setActiveTab('vehicles');
                  }}
                />
              ))}
            </div>
          </OperatorTodaySection>
        </>
      )}
    </div>
  );

  return (
    <>
      {isTablet ? (
        <OperatorTabletFrame
          list={mainContent}
          detail={
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Aufgaben und Buchungen öffnen sich als Vollbild-Sheets auf dem Gerät.
              </p>
            </div>
          }
          showDetail={false}
        />
      ) : (
        mainContent
      )}
      <OperatorBookingDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onPickupStart={(item) => startHandover(item, 'PICKUP')}
        onReturnStart={(item) => startHandover(item, 'RETURN')}
      />
    </>
  );
}
