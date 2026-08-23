import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../../../components/ui/utils';
import { api, type Vendor } from '../../../../lib/api';
import { navigateNotificationEntity } from '../../../lib/notifications/notification-entity-navigation';
import { useRentalEntityNavigation } from '../../../context/RentalEntityNavigationContext';
import { toast } from 'sonner';
import type { Locale } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import { useRentalOrg } from '../../../RentalContext';
import { ServiceTaskCreateModal } from '../../service-center/ServiceTaskCreateModal';
import type { HealthTaskPrefill } from '../../../lib/health-task-bridge.utils';
import { DashboardPanelScrollBlur } from '../DashboardPanelScrollBlur';
import type {
  ActionQueueEntry,
  ActionQueueItem,
  DashboardViewModel,
} from '../dashboardTypes';
import type { DashboardAttentionMutations } from '../dashboardAttentionTypes';
import { NotificationEntryCard } from '../notifications/NotificationEntryCard';
import { NotificationGroupCard } from '../notifications/NotificationGroupCard';
import { NotificationCardSkeleton } from '../notifications/NotificationCardSkeleton';
import { buildNotificationTaskPrefill } from '../notifications/notification-task-bridge';
import { NotificationEmptyState } from '../notifications/NotificationEmptyState';
import { NotificationPanelErrorBanner } from '../notifications/NotificationPanelHeader';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import type { NotificationEmptyVariant } from '../notifications/notificationPanelTypes';
import { isOverdueHandoverNotification, resolveHandoverCustomerId } from '../notifications/notification-handover-copy';
import { countAtomicActions } from '../actionQueueGrouping';
import { ATTENTION_SCOPED_LIST_SCROLL_MAX_HEIGHT_CLASS } from './attentionScopedListLayout';

export interface AttentionScopedListHandlers {
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenCustomerById?: (customerId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
  onOpenSettingsTab?: (tab: string) => void;
  onOpenPriceTariffs?: () => void;
}

interface AttentionScopedListProps {
  entries: ActionQueueEntry[];
  itemsById: Map<string, ActionQueueItem>;
  loading: boolean;
  error: boolean;
  errorCode: string | null;
  emptyVariant: NotificationEmptyVariant;
  vm: DashboardViewModel;
  handlers: AttentionScopedListHandlers;
  mutations: DashboardAttentionMutations;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locale: Locale;
  referenceNowMs: number;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  listClassName?: string;
  scrollClassName?: string;
}

function runItemCta(
  item: ActionQueueItem,
  vm: DashboardViewModel,
  handlers: AttentionScopedListHandlers,
  orgId: string,
  rentalNav: ReturnType<typeof useRentalEntityNavigation>,
  unavailableMessage: string,
) {
  if (
    navigateNotificationEntity(item, orgId, {
      ...rentalNav,
      onOpenRentalView: handlers.onOpenRentalView,
      onOpenSettingsTab: handlers.onOpenSettingsTab,
      onStartHandoverPickup: (bookingId) => {
        const pickup = vm.pickupItems.find((p) => p.bookingId === bookingId);
        if (pickup) vm.handleConfirmPickup(pickup);
      },
      onStartHandoverReturn: (bookingId) => {
        const ret = vm.returnItems.find((r) => r.bookingId === bookingId);
        if (ret) vm.handleConfirmReturn(ret);
      },
      onEntityUnavailable: () => {
        toast.info(unavailableMessage);
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

function resolveErrorBanner(
  errorCode: string | null,
  de: boolean,
  t: AttentionScopedListProps['t'],
): string {
  if (errorCode === 'api_disabled') {
    return de
      ? 'Benachrichtigungs-API ist deaktiviert.'
      : 'Notification API is disabled.';
  }
  if (errorCode === 'permission_denied') {
    return de ? 'Keine Berechtigung für Benachrichtigungen.' : 'Permission denied.';
  }
  if (errorCode === 'network') {
    return de
      ? 'Verbindung fehlgeschlagen. Bitte erneut versuchen.'
      : 'Connection failed. Please try again.';
  }
  return t('notification.empty.apiError');
}

export function AttentionScopedList({
  entries,
  itemsById,
  loading,
  error,
  errorCode,
  emptyVariant,
  vm,
  handlers,
  mutations,
  t,
  locale,
  referenceNowMs,
  onLoadMore,
  hasMore = false,
  listClassName,
  scrollClassName,
}: AttentionScopedListProps) {
  const { orgId } = useRentalOrg();
  const rentalNav = useRentalEntityNavigation();
  const de = locale === 'de';
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [taskPrefill, setTaskPrefill] = useState<HealthTaskPrefill | null>(null);
  const [taskVehicleId, setTaskVehicleId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    api.vendors
      .list(orgId)
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

  const errorBanner = useMemo(() => {
    if (!error) return null;
    return resolveErrorBanner(errorCode, de, t);
  }, [error, errorCode, de, t]);

  const showEmpty = useMemo(() => {
    if (error) return emptyVariant === 'api-error';
    if (!loading && entries.length === 0) return true;
    return false;
  }, [error, loading, entries.length, emptyVariant]);

  const runCta = useCallback(
    (item: ActionQueueItem) => runItemCta(
      item,
      vm,
      handlers,
      orgId ?? '',
      rentalNav,
      t('notification.entityUnavailable'),
    ),
    [vm, handlers, orgId, rentalNav, t],
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
      const prefill = buildNotificationTaskPrefill(item, vendors);
      if (!prefill || !item.vehicleId) return;
      setTaskPrefill(prefill);
      setTaskVehicleId(item.vehicleId);
      setTaskModalOpen(true);
    },
    [vendors],
  );

  const mutationHandlers = useCallback(
    (itemId: string) => ({
      onMarkRead: mutations.markRead
        ? () => void mutations.markRead(itemId)
        : undefined,
      onAcknowledge: mutations.acknowledge
        ? () => void mutations.acknowledge(itemId)
        : undefined,
      onSnooze: mutations.snooze
        ? () => void mutations.snooze(itemId, new Date(Date.now() + 60 * 60_000).toISOString())
        : undefined,
    }),
    [mutations],
  );

  const hiddenAtomicCount = 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {errorBanner ? <NotificationPanelErrorBanner message={errorBanner} /> : null}

      <DashboardPanelScrollBlur
        className={cn('min-h-0 flex-1', listClassName)}
        scrollClassName={cn(ATTENTION_SCOPED_LIST_SCROLL_MAX_HEIGHT_CLASS, scrollClassName)}
      >
        {loading ? (
          <NotificationCardSkeleton rows={3} />
        ) : showEmpty ? (
          <NotificationEmptyState variant={error ? 'api-error' : emptyVariant} t={t} />
        ) : (
          <ul className="flex flex-col gap-2 px-2 py-2 sm:px-2.5" role="list">
            {entries.map((entry) => {
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
                      resolveItemLifecycleHandlers={mutationHandlers}
                    />
                  </li>
                );
              }

              const item = itemsById.get(entry.id);
              if (!item) return null;
              const itemMutations = mutationHandlers(entry.id);

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
                    {...itemMutations}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !loading && onLoadMore ? (
          <div className="border-t border-border/35 px-4 py-2.5 text-center">
            <button
              type="button"
              onClick={() => void onLoadMore()}
              className={cn(
                NOTIFICATION_PANEL_TYPO.cta,
                'sq-press inline-flex min-h-9 items-center rounded-md px-3 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground',
              )}
            >
              {t('dashboardAttention.loadMore', {
                count: countAtomicActions(entries),
              })}
            </button>
          </div>
        ) : null}

        {hiddenAtomicCount > 0 && !loading ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'border-t border-border/35 px-4 py-2.5 text-center')}>
            {t('notification.more.expanded', { count: hiddenAtomicCount })}
          </p>
        ) : null}
      </DashboardPanelScrollBlur>

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
    </div>
  );
}
