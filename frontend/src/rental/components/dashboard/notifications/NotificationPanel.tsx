import { useCallback, useMemo, useState } from 'react';
import { cn } from '../../../../components/ui/utils';
import { panelShellClass } from '../dashboardShell';
import type { ActionQueueItem, DashboardViewModel } from '../dashboardTypes';
import { navigateNotificationV2Action } from '../../../lib/notifications/notification-v2-action-router';
import { useLanguage } from '../../../i18n/LanguageContext';
import { buildNotificationCardViewModel } from './notificationCardViewModel';
import { NotificationCard } from './NotificationCard';
import { NotificationCardSkeleton } from './NotificationCardSkeleton';
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

const VISIBLE_CAP = 8;

interface NotificationPanelHandlers {
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
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
  if (item.vehicleId && handlers.onOpenVehicleById) handlers.onOpenVehicleById(item.vehicleId);
  else handlers.onOpenRentalView?.('bookings');
}

export function NotificationPanel({
  vm,
  handlers,
}: {
  vm: DashboardViewModel;
  handlers: NotificationPanelHandlers;
}) {
  const { t, locale } = useLanguage();
  const de = locale === 'de';
  const [primaryTab, setPrimaryTab] = useState<NotificationPrimaryTab>('all');
  const [domainFilter, setDomainFilter] = useState<NotificationDomainFilter | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = 'dashboard-notification-panel-content';

  const referenceNowMs = useMemo(() => Date.now(), [vm.actionQueue, vm.isRefreshing]);

  const primaryTabCounts = vm.notificationPrimaryTabCounts ?? {
    all: 0,
    critical: 0,
    warning: 0,
    resolved: 0,
  };

  const filteredItems = useMemo(
    () => filterNotificationPanelItems(vm.actionQueue, primaryTab, domainFilter),
    [vm.actionQueue, primaryTab, domainFilter],
  );

  const cards = useMemo(() => {
    return filteredItems
      .map((item) => buildNotificationCardViewModel(item, locale, referenceNowMs))
      .filter((card): card is NonNullable<typeof card> => card != null);
  }, [filteredItems, locale, referenceNowMs]);

  const visibleCards = isExpanded ? cards.slice(0, VISIBLE_CAP) : cards.slice(0, 3);
  const hiddenCount = Math.max(0, cards.length - visibleCards.length);
  const statusTone = headerStatusTone(vm.actionQueue, primaryTabCounts);

  const handlePrimaryTab = useCallback(
    (tab: NotificationPrimaryTab) => {
      setPrimaryTab(tab);
      if (tab === 'resolved') vm.setNotificationListMode?.('resolved');
      else vm.setNotificationListMode?.('active');
    },
    [vm],
  );

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
    if (!vm.actionQueueLoading && cards.length === 0) {
      return emptyVariantForTab(primaryTab, domainFilter != null);
    }
    return null;
  }, [vm.actionQueueError, vm.actionQueueLoading, cards.length, primaryTab, domainFilter]);

  const snoozeDefaultUntil = () => new Date(Date.now() + 60 * 60_000).toISOString();

  return (
    <section
      className={cn(panelShellClass('tertiary'), 'w-full min-w-0')}
      aria-label={t('notification.panelTitle')}
    >
      <NotificationPanelHeader
        vm={vm}
        statusTone={statusTone}
        totalCount={cards.length}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((v) => !v)}
        controlsId={contentId}
        t={t}
      />

      <div className="border-b border-border/35 px-2 py-1.5 sm:px-2.5">
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
        className={isExpanded ? 'animate-fade-up motion-reduce:animate-none' : undefined}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {vm.actionQueueLoading ? (
          <NotificationCardSkeleton rows={3} />
        ) : emptyVariant ? (
          <NotificationEmptyState variant={emptyVariant} t={t} />
        ) : (
          <ul className="flex flex-col gap-2 px-2 py-2 sm:px-2.5" role="list">
            {visibleCards.map((card) => {
              const item = filteredItems.find((i) => i.id === card.id);
              if (!item) return null;
              return (
                <li key={card.id} className="list-none">
                  <NotificationCard
                    card={card}
                    t={t}
                    unread={card.readStatus === 'unread'}
                    onOpen={() => vm.openDrilldown({ type: 'action-item', itemId: card.id })}
                    onCta={() => runItemCta(item, vm, handlers)}
                    onMarkRead={
                      vm.notificationMutations?.markRead
                        ? () => void vm.notificationMutations?.markRead(card.id)
                        : undefined
                    }
                    onAcknowledge={
                      vm.notificationMutations?.acknowledge
                        ? () => void vm.notificationMutations?.acknowledge(card.id)
                        : undefined
                    }
                    onSnooze={
                      vm.notificationMutations?.snooze
                        ? () => void vm.notificationMutations?.snooze(card.id, snoozeDefaultUntil())
                        : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}

        {hiddenCount > 0 && !vm.actionQueueLoading ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'border-t border-border/35 px-4 py-2.5 text-center')}>
            {t('notification.more.expanded', { count: hiddenCount })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
