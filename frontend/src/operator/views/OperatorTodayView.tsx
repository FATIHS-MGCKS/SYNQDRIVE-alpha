import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Car,
  ListTodo,
  Plus,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/patterns';
import { useFleetVehicles } from '../../rental/FleetContext';
import { taskRequiresResolutionNote } from '../../rental/lib/task-detail.utils';
import type { ApiTask } from '../../lib/api';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorToday } from '../hooks/useOperatorToday';
import { useOperatorOperationalAlerts } from '../hooks/useOperatorOperationalAlerts';
import { OperatorBookingCard } from '../components/OperatorBookingCard';
import { OperatorBookingDetailSheet } from '../components/OperatorBookingDetailSheet';
import { OperatorListCard } from '../components/OperatorListCard';
import { OperatorTodaySection } from '../components/OperatorTodaySection';
import { OperatorTodayTaskFeed } from '../components/OperatorTodayTaskFeed';
import { OperatorTabletFrame } from '../components/OperatorTabletFrame';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import type { OperatorTodayBookingItem } from '../lib/operatorData';
import { toHandoverBookingSeed } from '../lib/operatorData';
import { buildFleetVehicleById } from '../tasks/operatorTaskDisplay.utils';
import { useOperatorTaskActions } from '../tasks/useOperatorTaskActions';
import {
  countVisibleTaskFeedEntries,
  hasAnyTaskBucketContent,
  hasOperatorTodaySecondaryContent,
  isOperatorTodayFullyEmpty,
  operatorTodayFatalError,
  operatorTodayInitialLoading,
  shouldShowAllOpenTasksNav,
  shouldShowOperatorTodayStaleBanner,
} from './operatorTodayView.utils';

function OperatorTodayStaleBanner({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.08] px-3 py-2.5"
      role="status"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-watch)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">
          {offline ? 'Offline — zwischengespeicherte Daten' : 'Daten möglicherweise veraltet'}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {offline
            ? 'Die Anzeige basiert auf dem letzten erfolgreichen Abruf. Aktionen werden nach Verbindungsaufbau synchronisiert.'
            : 'Der letzte Abruf ist fehlgeschlagen. Angezeigt werden die zuletzt geladenen Aufgaben.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="sq-press inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Aktualisieren
      </button>
    </div>
  );
}

export function OperatorTodayView() {
  const {
    orgId,
    orgLoading,
    snapshot,
    bookingsLoading,
    tasksLoading,
    error,
    bookingsError,
    isStale,
    offline,
    reload,
  } = useOperatorToday('de');
  const { openHandover } = useOperatorHandover();
  const { openSheet, setActiveTab, setPendingTasksBookingId, setSelectedVehicleId } = useOperatorShell();
  const { fleetVehicles } = useFleetVehicles();
  const { alerts: operationalAlerts } = useOperatorOperationalAlerts(5);
  const isTablet = useOperatorTabletLayout();
  const [detailItem, setDetailItem] = useState<OperatorTodayBookingItem | null>(null);
  const [plannedOpen, setPlannedOpen] = useState(false);

  const { mutating, start, complete } = useOperatorTaskActions(() => {
    void reload();
  });

  const vehicleById = useMemo(() => buildFleetVehicleById(fleetVehicles), [fleetVehicles]);

  const hasTaskBuckets = hasAnyTaskBucketContent(
    snapshot.taskFeed,
    snapshot.taskFeed.canViewUnassigned,
  );
  const hasSecondary = hasOperatorTodaySecondaryContent(snapshot);
  const hasRenderableContent = hasTaskBuckets || hasSecondary || operationalAlerts.length > 0;
  const fullyEmpty = isOperatorTodayFullyEmpty(snapshot) && operationalAlerts.length === 0;
  const initialLoading = operatorTodayInitialLoading({
    orgLoading,
    bookingsLoading,
    tasksLoading,
    hasSnapshotContent: hasRenderableContent,
  });
  const fatalError = operatorTodayFatalError({ error, hasRenderableContent });
  const showStaleBanner = shouldShowOperatorTodayStaleBanner({
    offline,
    isStale,
    hasRenderableContent,
  });

  const visibleFeedEntries = countVisibleTaskFeedEntries({
    taskFeed: snapshot.taskFeed,
    canViewUnassigned: snapshot.taskFeed.canViewUnassigned,
    plannedExpanded: plannedOpen,
  });
  const showAllOpenNav = shouldShowAllOpenTasksNav(snapshot.totalOpenTasksCount, visibleFeedEntries);

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

  const renderHandoverCards = useCallback(
    (items: OperatorTodayBookingItem[]) => (
      <div className="space-y-2">
        {items.map((item) => (
          <OperatorBookingCard
            key={`${item.kind}-${item.bookingId}`}
            item={item}
            onPickupStart={() => startHandover(item, 'PICKUP')}
            onReturnStart={() => startHandover(item, 'RETURN')}
            onDetails={() => setDetailItem(item)}
          />
        ))}
      </div>
    ),
    [startHandover],
  );

  const sectionExtras = useMemo(() => {
    const extras: Partial<Record<'NOW' | 'TODAY', ReactNode>> = {};
    if (snapshot.dueNow.length > 0) {
      extras.NOW = (
        <div className="space-y-2">
          <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Übergaben jetzt
          </p>
          {renderHandoverCards(snapshot.dueNow)}
        </div>
      );
    }
    const todayHandovers = [...snapshot.pickupsToday, ...snapshot.returnsToday];
    if (todayHandovers.length > 0) {
      extras.TODAY = (
        <div className="space-y-2">
          <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Übergaben heute
          </p>
          {renderHandoverCards(todayHandovers)}
        </div>
      );
    }
    return extras;
  }, [renderHandoverCards, snapshot.dueNow, snapshot.pickupsToday, snapshot.returnsToday]);

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

  const mainContent = (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain">
      <button
        type="button"
        onClick={() => openSheet({ type: 'booking-create' })}
        className="sq-3d-btn sq-3d-btn--primary flex min-h-[48px] w-full items-center justify-center gap-2 font-semibold"
      >
        <Plus className="h-5 w-5" />
        Buchung aufnehmen
      </button>

      {showStaleBanner && <OperatorTodayStaleBanner offline={offline} onRetry={() => void reload()} />}

      {initialLoading && <SkeletonRows rows={4} />}

      {fatalError && (
        <ErrorState compact title="Heute-Daten nicht verfügbar" error={error} onRetry={() => void reload()} />
      )}
      {bookingsError && !bookingsLoading && !fatalError && (
        <ErrorState compact title="Buchungen nicht verfügbar" error={bookingsError} onRetry={() => void reload()} />
      )}

      {!initialLoading && !fatalError && (
        <>
          {fullyEmpty && (
            <EmptyState
              compact
              icon={<ListTodo className="h-5 w-5" />}
              title="Heute ist alles ruhig"
              description="Keine dringenden Aufgaben, Übergaben oder Blocker für den heutigen Tag."
              action={
                snapshot.totalOpenTasksCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('tasks')}
                    className="sq-btn sq-btn-secondary min-h-[44px] px-4 text-xs font-semibold"
                  >
                    Alle offenen Aufgaben ({snapshot.totalOpenTasksCount})
                  </button>
                ) : undefined
              }
            />
          )}

          {!fullyEmpty && (
            <>
              <header className="flex items-start justify-between gap-3 px-0.5">
                <div className="min-w-0">
                  <h1 className="font-display text-base font-bold tracking-tight text-foreground">
                    Operativer Tagesüberblick
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Priorisiert nach Dringlichkeit — kritisch und überfällig zuerst.
                  </p>
                </div>
                {(showAllOpenNav || snapshot.totalOpenTasksCount > 0) && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('tasks')}
                    className="sq-btn sq-btn-secondary min-h-[44px] shrink-0 px-3 text-[11px] font-semibold"
                  >
                    {showAllOpenNav
                      ? `Alle offenen (${snapshot.totalOpenTasksCount})`
                      : 'Alle Aufgaben'}
                  </button>
                )}
              </header>

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

              <OperatorTodayTaskFeed
                buckets={snapshot.taskFeed.buckets}
                canViewUnassigned={snapshot.taskFeed.canViewUnassigned}
                vehicleById={vehicleById}
                mutating={mutating}
                plannedOpen={plannedOpen}
                onPlannedOpenChange={setPlannedOpen}
                onOpenTask={openTask}
                onStartTask={(taskId) => void start(taskId)}
                onCompleteTask={(task) => void handleQuickComplete(task)}
                onReload={() => void reload()}
                sectionExtras={sectionExtras}
              />

              {snapshot.blockedVehicles.length > 0 && (
                <OperatorTodaySection
                  title="Blockierte Fahrzeuge"
                  count={snapshot.blockedVehicles.length}
                  variant="critical"
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
              )}
            </>
          )}
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
