import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Car,
  ListTodo,
  Plus,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { useFleetVehicles } from '../../rental/FleetContext';
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

function OperatorTodayStaleBanner({
  offline,
  onRetry,
}: {
  offline: boolean;
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.08] px-3 py-2.5"
      role="status"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-watch)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">
          {offline ? t('operator.today.stale.offlineTitle') : t('operator.today.stale.staleTitle')}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {offline ? t('operator.today.stale.offlineBody') : t('operator.today.stale.staleBody')}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="sq-press inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        {t('operator.today.stale.refresh')}
      </button>
    </div>
  );
}

export function OperatorTodayView() {
  const { t, formattingLocale } = useLanguage();
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
  } = useOperatorToday(formattingLocale);
  const { openHandover } = useOperatorHandover();
  const { openSheet, setActiveTab, setPendingTasksBookingId, setSelectedVehicleId } = useOperatorShell();
  const { fleetVehicles } = useFleetVehicles();
  const { alerts: operationalAlerts } = useOperatorOperationalAlerts(5);
  const isTablet = useOperatorTabletLayout();
  const [detailItem, setDetailItem] = useState<OperatorTodayBookingItem | null>(null);
  const [plannedOpen, setPlannedOpen] = useState(false);

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
    (task: ApiTask, options?: { focusComment?: boolean }) => {
      openSheet({
        type: 'task-detail',
        taskId: task.id,
        task,
        focusComment: Boolean(options?.focusComment),
        onUpdated: () => void reload(),
      });
    },
    [openSheet, reload],
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
            {t('operator.today.handover.now')}
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
            {t('operator.today.handover.today')}
          </p>
          {renderHandoverCards(todayHandovers)}
        </div>
      );
    }
    return extras;
  }, [renderHandoverCards, snapshot.dueNow, snapshot.pickupsToday, snapshot.returnsToday, t]);

  if (!orgLoading && !orgId) {
    return (
      <EmptyState
        compact
        icon={<Car className="h-5 w-5" />}
        title={t('operator.today.noOrg.title')}
        description={t('operator.today.noOrg.description')}
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
        {t('operator.today.createBooking')}
      </button>

      {showStaleBanner && <OperatorTodayStaleBanner offline={offline} onRetry={() => void reload()} />}

      {initialLoading && <SkeletonRows rows={4} />}

      {fatalError && (
        <ErrorState
          compact
          title={t('operator.today.error.fatalTitle')}
          error={error}
          onRetry={() => void reload()}
          retryLabel={t('common.retry')}
        />
      )}
      {bookingsError && !bookingsLoading && !fatalError && (
        <ErrorState
          compact
          title={t('operator.today.error.bookingsTitle')}
          error={bookingsError}
          onRetry={() => void reload()}
          retryLabel={t('common.retry')}
        />
      )}

      {!initialLoading && !fatalError && (
        <>
          {fullyEmpty && (
            <EmptyState
              compact
              icon={<ListTodo className="h-5 w-5" />}
              title={t('operator.today.empty.title')}
              description={t('operator.today.empty.description')}
              action={
                snapshot.totalOpenTasksCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('tasks')}
                    className="sq-btn sq-btn-secondary min-h-[44px] px-4 text-xs font-semibold"
                  >
                    {t('operator.today.empty.allOpenTasks', { count: snapshot.totalOpenTasksCount })}
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
                    {t('operator.today.header.title')}
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('operator.today.header.subtitle')}</p>
                </div>
                {(showAllOpenNav || snapshot.totalOpenTasksCount > 0) && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('tasks')}
                    className="sq-btn sq-btn-secondary min-h-[44px] shrink-0 px-3 text-[11px] font-semibold"
                  >
                    {showAllOpenNav
                      ? t('operator.today.nav.allOpenWithCount', { count: snapshot.totalOpenTasksCount })
                      : t('operator.today.nav.allTasks')}
                  </button>
                )}
              </header>

              {operationalAlerts.length > 0 && (
                <OperatorTodaySection title={t('operator.today.alerts.sectionTitle')} count={operationalAlerts.length}>
                  <div className="space-y-2">
                    {operationalAlerts.map((alert) => (
                      <OperatorListCard
                        key={alert.id}
                        title={alert.title}
                        subtitle={alert.message}
                        badges={[
                          {
                            kind: 'blocked',
                            label:
                              alert.severity === 'CRITICAL'
                                ? t('operator.today.alert.severity.critical')
                                : t('operator.today.alert.severity.warning'),
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
                plannedOpen={plannedOpen}
                onPlannedOpenChange={setPlannedOpen}
                onOpenTask={openTask}
                onTaskChanged={() => void reload()}
                onReload={() => void reload()}
                sectionExtras={sectionExtras}
              />

              {snapshot.blockedVehicles.length > 0 && (
                <OperatorTodaySection
                  title={t('operator.today.blocked.sectionTitle')}
                  count={snapshot.blockedVehicles.length}
                  variant="critical"
                >
                  <div className="space-y-2">
                    {snapshot.blockedVehicles.map((v) => (
                      <OperatorListCard
                        key={v.vehicleId}
                        title={`${v.label} · ${v.plate}`}
                        subtitle={v.station || undefined}
                        badges={[{ kind: 'blocked', label: t('operator.today.blocked.badge'), tone: 'critical' }]}
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
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center">
              <p className="text-sm text-muted-foreground">{t('operator.today.tablet.placeholder')}</p>
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