import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../../../components/ui/utils';
import { api, type Vendor } from '../../../../lib/api';
import { panelShellClass, DASHBOARD_LAYOUT } from '../dashboardShell';
import type { ActionQueueItem, DashboardViewModel } from '../dashboardTypes';
import {
  countAtomicActions,
  groupActionQueueEntries,
} from '../actionQueueGrouping';
import { navigateNotificationV2Action } from '../../../lib/notifications/notification-v2-action-router';
import { enrichNotificationGroupingList } from '../../../lib/notifications/enrich-notification-grouping';
import { ensureNotificationPanelQueueItems } from '../notificationQueueEnricher';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useRentalOrg } from '../../../RentalContext';
import { ServiceTaskCreateModal } from '../../service-center/ServiceTaskCreateModal';
import type { HealthTaskPrefill } from '../../../lib/health-task-bridge.utils';
import { NotificationEntryCard } from './NotificationEntryCard';
import { NotificationGroupCard } from './NotificationGroupCard';
import { NotificationCardSkeleton } from './NotificationCardSkeleton';
import { buildNotificationTaskPrefill } from './notification-task-bridge';
import { NotificationDomainFilter as NotificationDomainFilterControl } from './NotificationDomainFilter';
import { NotificationEmptyState } from './NotificationEmptyState';
import {
  filterNotificationPanelItems,
  headerStatusTone,
} from './notificationPanelFilters';
import { NotificationPanelErrorBanner, NotificationPanelHeader } from './NotificationPanelHeader';
import { NotificationPrimaryTabs } from './NotificationPrimaryTabs';
import type {
  NotificationDomainFilter,
  NotificationEmptyVariant,
  NotificationPrimaryTab,
} from './notificationPanelTypes';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import { isOverdueHandoverNotification, resolveHandoverCustomerId } from './notification-handover-copy';

const VISIBLE_ENTRY_CAP = 8;

export type NotificationPanelLayout = 'default' | 'sidebar';

interface NotificationPanelHandlers {
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenCustomerById?: (customerId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
  onOpenPriceTariffs?: () => void;
}

function emptyVariantForTab(tab: NotificationPrimaryTab, hasDomainFilter: boolean): NotificationEmptyVariant {
  if (hasDomainFilter) return 'filter-empty';
  if (tab === 'critical') return 'none-critical';
  if (tab === 'warning') return 'none-warning';
  if (tab === 'resolved') return 'none-resolved';
  return 'none-active';
}

function runItemCta(item: ActionQueueItem, vm: DashboardViewModel, handlers: NotificationPanelHandlers) {
  if (
    navigateNotificationV2Action(item, {
      onOpenVehicleById: handlers.onOpenVehicleById,
      onOpenBookingById: handlers.onOpenBookingById,
      onOpenRentalView: handlers.onOpenRentalView,
      onStartHandoverPickup: (bookingId) => {
        const pickup = vm.pickupItems.find((p) => p.bookingId === bookingId);
        if (pickup) vm.handleConfirmPickup(pickup);
      },
      onStartHandoverReturn: (bookingId) => {
        const ret = vm.returnItems.find((r) => r.bookingId === bookingId);
        if (ret) vm.handleConfirmReturn(ret);
      },
    })
  ) {
    return;
  }
  if (item.cta === 'open-price-tariffs') {
    handlers.onOpenPriceTariffs?.();
    return;
  }
  if (item.cta === 'open-stations') {
    handlers.onOpenRentalView?.('stations');
    return;
  }
  if (
    item.bookingId
    && handlers.onOpenBookingById
    && (item.cta === 'open-booking' || isOverdueHandoverNotification(item))
  ) {
    handlers.onOpenBookingById(item.bookingId);
    return;
  }
  if (item.cta === 'start-handover-pickup' && item.bookingId) {
    const pickup = vm.pickupItems.find((p) => p.bookingId === item.bookingId);
    if (pickup) {
      vm.handleConfirmPickup(pickup);
      return;
    }
  }
  if (item.cta === 'start-handover-return' && item.bookingId) {
    const ret = vm.returnItems.find((r) => r.bookingId === item.bookingId);
    if (ret) {
      vm.handleConfirmReturn(ret);
      return;
    }
  }
  if (item.vehicleId && handlers.onOpenVehicleById) handlers.onOpenVehicleById(item.vehicleId);
  else handlers.onOpenRentalView?.('bookings');
}

export function NotificationPanel({
  vm,
  handlers,
  layout = 'default',
}: {
  vm: DashboardViewModel;
  handlers: NotificationPanelHandlers;
  layout?: NotificationPanelLayout;
}) {
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const de = locale === 'de';
  const [primaryTab, setPrimaryTab] = useState<NotificationPrimaryTab>('all');
  const [domainFilter, setDomainFilter] = useState<NotificationDomainFilter | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [taskPrefill, setTaskPrefill] = useState<HealthTaskPrefill | null>(null);
  const [taskVehicleId, setTaskVehicleId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const contentId = 'dashboard-notification-panel-content';

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    api.vendors.list(orgId)
      .then((rows) => {
        if (!cancelled) setVendors(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setVendors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const referenceNowMs = useMemo(() => Date.now(), [vm.actionQueue, vm.isRefreshing]);

  const primaryTabCounts = useMemo(() => {
    const base = vm.notificationPrimaryTabCounts ?? {
      all: 0,
      critical: 0,
      warning: 0,
      resolved: 0,
    };
    if (primaryTab === 'resolved') {
      return { ...base, all: 0, critical: 0, warning: 0 };
    }
    return base;
  }, [vm.notificationPrimaryTabCounts, primaryTab]);

  const filteredItems = useMemo(
    () => filterNotificationPanelItems(vm.actionQueue, primaryTab, domainFilter),
    [vm.actionQueue, primaryTab, domainFilter],
  );

  const enrichedItems = useMemo(
    () => {
      const withQueue = ensureNotificationPanelQueueItems(filteredItems, {
        locale,
        referenceNowMs,
        t,
      });
      return enrichNotificationGroupingList(withQueue, locale, referenceNowMs);
    },
    [filteredItems, locale, referenceNowMs, t],
  );

  const entries = useMemo(
    () => groupActionQueueEntries(enrichedItems, locale),
    [enrichedItems, locale],
  );

  const itemsById = useMemo(() => {
    const map = new Map<string, ActionQueueItem>();
    for (const item of enrichedItems) map.set(item.id, item);
    return map;
  }, [enrichedItems]);

  const atomicCount = useMemo(() => countAtomicActions(entries), [entries]);
  const isSidebar = layout === 'sidebar';
  const visibleEntries = isSidebar
    ? entries
    : isExpanded
      ? entries.slice(0, VISIBLE_ENTRY_CAP)
      : entries.slice(0, 3);
  const hiddenAtomicCount = useMemo(() => {
    if (isSidebar) return 0;
    const hidden = entries.slice(visibleEntries.length);
    return countAtomicActions(hidden);
  }, [entries, visibleEntries.length, isSidebar]);

  const statusTone = headerStatusTone(vm.actionQueue, primaryTabCounts);

  const handlePrimaryTab = useCallback(
    (tab: NotificationPrimaryTab) => {
      setPrimaryTab(tab);
      if (tab === 'resolved') vm.setNotificationListMode?.('resolved');
      else vm.setNotificationListMode?.('active');
    },
    [vm],
  );

  useEffect(() => {
    if (primaryTab === 'resolved') vm.setNotificationListMode?.('resolved');
    else vm.setNotificationListMode?.('active');
  }, [primaryTab, vm.setNotificationListMode]);

  const resolvedTabPending =
    primaryTab === 'resolved' && vm.notificationListMode !== 'resolved';
  const panelLoading = vm.actionQueueLoading || resolvedTabPending;

  const errorBanner = useMemo(() => {
    if (!vm.actionQueueError) return null;
    const code = vm.notificationsV2ErrorCode;
    if (code === 'api_disabled') {
      return de
        ? 'Benachrichtigungs-API ist deaktiviert.'
        : 'Notification API is disabled.';
    }
    if (code === 'permission_denied') {
      return de ? 'Keine Berechtigung für Benachrichtigungen.' : 'Permission denied.';
    }
    if (code === 'network') {
      return de
        ? 'Verbindung fehlgeschlagen. Bitte erneut versuchen.'
        : 'Connection failed. Please try again.';
    }
    return t('notification.empty.apiError');
  }, [vm.actionQueueError, vm.notificationsV2ErrorCode, de, t]);

  const emptyVariant: NotificationEmptyVariant | null = useMemo(() => {
    if (vm.actionQueueError) return 'api-error';
    if (!vm.actionQueueLoading && entries.length === 0) {
      return emptyVariantForTab(primaryTab, domainFilter != null);
    }
    return null;
  }, [vm.actionQueueError, panelLoading, entries.length, primaryTab, domainFilter]);

  const snoozeDefaultUntil = () => new Date(Date.now() + 60 * 60_000).toISOString();

  const runCta = useCallback(
    (item: ActionQueueItem) => runItemCta(item, vm, handlers),
    [vm, handlers],
  );

  const runContactCustomer = useCallback(
    (item: ActionQueueItem) => {
      const customerId = resolveHandoverCustomerId(item);
      if (customerId) handlers.onOpenCustomerById?.(customerId);
    },
    [handlers],
  );

  const openCreateTask = useCallback(
    (item: ActionQueueItem) => {
      const prefill = buildNotificationTaskPrefill(item, vendors, orgId ?? '');
      if (!prefill || !item.vehicleId) return;
      setTaskPrefill(prefill);
      setTaskVehicleId(item.vehicleId);
      setTaskModalOpen(true);
    },
    [vendors],
  );

  const mutationHandlers = useCallback(
    (itemId: string) => ({
      onMarkRead: vm.notificationMutations?.markRead
        ? () => void vm.notificationMutations?.markRead(itemId)
        : undefined,
      onAcknowledge: vm.notificationMutations?.acknowledge
        ? () => void vm.notificationMutations?.acknowledge(itemId)
        : undefined,
      onSnooze: vm.notificationMutations?.snooze
        ? () => void vm.notificationMutations?.snooze(itemId, snoozeDefaultUntil())
        : undefined,
    }),
    [vm.notificationMutations],
  );

  return (
    <section
      className={cn(
        panelShellClass('tertiary'),
        'w-full min-w-0',
        isSidebar && 'flex h-full max-h-full min-h-0 flex-col overflow-hidden max-lg:max-h-[min(480px,55vh)]',
      )}
      aria-label={t('notification.panelTitle')}
    >
      <NotificationPanelHeader
        vm={vm}
        statusTone={statusTone}
        totalCount={atomicCount}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((v) => !v)}
        controlsId={contentId}
        t={t}
      />

      <div className="shrink-0 border-b border-border/35 px-2 py-1.5 sm:px-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <NotificationPrimaryTabs
              activeTab={primaryTab}
              counts={primaryTabCounts}
              t={t}
              onSelect={handlePrimaryTab}
            />
          </div>
          <NotificationDomainFilterControl value={domainFilter} t={t} onChange={setDomainFilter} />
        </div>
      </div>

      {errorBanner ? <NotificationPanelErrorBanner message={errorBanner} /> : null}

      <div
        id={contentId}
        hidden={!isExpanded}
        className={cn(
          isExpanded && 'animate-fade-up motion-reduce:animate-none',
          isSidebar && 'flex min-h-0 flex-1 flex-col overflow-hidden',
        )}
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div
          className={cn(
            isSidebar && DASHBOARD_LAYOUT.notificationsPanelScroll,
            !isSidebar && 'max-lg:max-h-[min(420px,50vh)] max-lg:overflow-y-auto max-lg:scrollbar-thin',
          )}
        >
          {panelLoading ? (
            <NotificationCardSkeleton rows={3} />
          ) : emptyVariant ? (
            <NotificationEmptyState variant={emptyVariant} t={t} />
          ) : (
            <ul className="flex flex-col gap-2 px-2 py-2 sm:px-2.5" role="list">
              {visibleEntries.map((entry) => {
                if (entry.kind === 'group') {
                  return (
                    <li key={entry.id} className="list-none">
                      <NotificationGroupCard
                        group={entry}
                        itemsById={itemsById}
                        locale={locale}
                        referenceNowMs={referenceNowMs}
                        t={t}
                        onItemCta={runCta}
                        onCreateTask={openCreateTask}
                      />
                    </li>
                  );
                }

                const item = itemsById.get(entry.id);
                if (!item) return null;
                const mutations = mutationHandlers(entry.id);

                return (
                  <li key={entry.id} className="list-none">
                    <NotificationEntryCard
                      item={item}
                      locale={locale}
                      referenceNowMs={referenceNowMs}
                      t={t}
                      onPrimaryCta={() => runCta(item)}
                      onSecondaryCta={() => runContactCustomer(item)}
                      onCreateTask={() => openCreateTask(item)}
                      {...mutations}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {hiddenAtomicCount > 0 && !panelLoading ? (
            <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'border-t border-border/35 px-4 py-2.5 text-center')}>
              {t('notification.more.expanded', { count: hiddenAtomicCount })}
            </p>
          ) : null}
        </div>
      </div>

      <ServiceTaskCreateModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        vendors={vendors}
        defaultVehicleId={taskVehicleId}
        defaultVendorId={taskPrefill?.vendorId ?? null}
        healthPrefill={taskPrefill}
        onCreated={() => {
          setTaskModalOpen(false);
          setTaskPrefill(null);
        }}
      />
    </section>
  );
}
