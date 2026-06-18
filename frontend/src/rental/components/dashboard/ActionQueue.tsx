import { useMemo, useState, memo } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip, SkeletonRows } from '../../../components/patterns';
import { filterActionQueue } from './actionQueueBuilder';
import { DataTrustHint } from './DataTrustHint';
import { sectionTrustHint } from './dataTrustBuilder';
import {
  ACTION_QUEUE_LIST_CAP,
  DashboardPanelHeader,
  INTERACTIVE_ROW_CLASS,
  INTERACTIVE_TAB_CLASS,
  panelShellClass,
} from './dashboardShell';
import type {
  ActionQueueCta,
  ActionQueueFilterTab,
  ActionQueueItem,
  ActionQueueSeverity,
  DashboardViewModel,
} from './dashboardTypes';

interface ActionQueueHandlers {
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

interface ActionQueueProps {
  vm: DashboardViewModel;
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

const FILTER_TABS: ActionQueueFilterTab[] = [
  'all',
  'critical',
  'operations',
  'vehicle',
  'financial',
  'notifications',
];

function severityLabel(severity: ActionQueueSeverity, de: boolean): string {
  if (severity === 'critical') return de ? 'Kritisch' : 'Critical';
  if (severity === 'warning') return de ? 'Warnung' : 'Warning';
  if (severity === 'attention') return de ? 'Aufmerksamkeit' : 'Attention';
  return 'Info';
}

function categoryLabel(category: ActionQueueItem['category'], de: boolean): string {
  const map: Record<ActionQueueItem['category'], [string, string]> = {
    vehicle: ['Vehicle', 'Fahrzeug'],
    booking: ['Booking', 'Buchung'],
    financial: ['Financial', 'Finanzen'],
    notification: ['Notification', 'Benachrichtigung'],
    handover: ['Handover', 'Übergabe'],
    health: ['Health', 'Gesundheit'],
    operations: ['Operations', 'Betrieb'],
    task: ['Task', 'Aufgabe'],
  };
  const [en, d] = map[category];
  return de ? d : en;
}

function ctaLabel(cta: ActionQueueCta, de: boolean): string {
  if (cta === 'open-vehicle') return de ? 'Fahrzeug öffnen' : 'Open vehicle';
  if (cta === 'open-booking') return de ? 'Buchung öffnen' : 'Open booking';
  if (cta === 'start-handover-pickup') return de ? 'Übergabe starten' : 'Start handover';
  if (cta === 'start-handover-return') return de ? 'Rückgabe starten' : 'Start return';
  if (cta === 'open-stations') return de ? 'Stationen öffnen' : 'Open stations';
  return de ? 'Vermietung öffnen' : 'Open rental';
}

function categoryIcon(category: ActionQueueItem['category']) {
  if (category === 'handover') return 'key';
  if (category === 'health') return 'heart';
  if (category === 'financial') return 'wallet';
  if (category === 'notification') return 'bell';
  if (category === 'operations') return 'calendar-clock';
  return 'car';
}

function severityTone(severity: ActionQueueSeverity) {
  if (severity === 'critical') return 'critical' as const;
  if (severity === 'warning') return 'watch' as const;
  if (severity === 'attention') return 'info' as const;
  return 'neutral' as const;
}

function confidenceLabel(confidence: 'high' | 'medium' | 'low', de: boolean): string {
  if (confidence === 'high') return de ? 'Evidenz: hoch' : 'Evidence: high';
  if (confidence === 'medium') return de ? 'Evidenz: mittel' : 'Evidence: medium';
  return de ? 'Evidenz: niedrig' : 'Evidence: low';
}

function tabLabel(tab: ActionQueueFilterTab, de: boolean): string {
  const labels: Record<ActionQueueFilterTab, [string, string]> = {
    all: ['All', 'Alle'],
    critical: ['Critical', 'Kritisch'],
    operations: ['Operations', 'Betrieb'],
    vehicle: ['Vehicle', 'Fahrzeug'],
    financial: ['Financial', 'Finanzen'],
    notifications: ['Notifications', 'Hinweise'],
  };
  return de ? labels[tab][1] : labels[tab][0];
}

function runCta(
  item: ActionQueueItem,
  vm: DashboardViewModel,
  handlers: ActionQueueHandlers,
) {
  const { onOpenVehicleById, onOpenBookingById, onOpenRentalView } = handlers;
  switch (item.cta) {
    case 'start-handover-pickup':
      if (item.pickupItem) vm.handleConfirmPickup(item.pickupItem);
      break;
    case 'start-handover-return':
      if (item.returnItem) vm.handleConfirmReturn(item.returnItem);
      break;
    case 'open-vehicle':
      if (item.vehicleId && onOpenVehicleById) onOpenVehicleById(item.vehicleId);
      break;
    case 'open-booking':
      if (item.bookingId && onOpenBookingById) onOpenBookingById(item.bookingId);
      else if (onOpenRentalView) onOpenRentalView('bookings');
      break;
    case 'open-stations':
      onOpenRentalView?.('stations');
      break;
    case 'open-rental':
    default:
      onOpenRentalView?.('bookings');
      break;
  }
}

const ActionQueueRow = memo(function ActionQueueRow({
  item,
  de,
  vm,
  handlers,
  pinned,
  focusMode,
}: {
  item: ActionQueueItem;
  de: boolean;
  vm: DashboardViewModel;
  handlers: ActionQueueHandlers;
  pinned?: boolean;
  focusMode?: boolean;
}) {
  return (
    <li
      className={[
        'group relative flex flex-col gap-2 border-b border-border/40 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3.5',
        INTERACTIVE_ROW_CLASS,
        pinned ? 'bg-muted/30' : 'hover:bg-muted/20',
        'cursor-pointer',
      ].join(' ')}
      onClick={() => vm.openDrilldown({ type: 'action-item', itemId: item.id })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          vm.openDrilldown({ type: 'action-item', itemId: item.id });
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
        <div
          className={[
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-[1.03] sm:mt-0',
            pinned ? 'sq-tone-critical' : 'sq-tone-neutral bg-muted/60',
          ].join(' ')}
        >
          <Icon name={categoryIcon(item.category)} className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip tone={severityTone(item.severity)} className="text-[9px] uppercase tracking-wide">
              {severityLabel(item.severity, de)}
            </StatusChip>
            {item.source === 'predictive-operations' ? (
              <StatusChip tone="info" className="text-[9px] uppercase tracking-wide">
                {de ? 'Operatives Risiko' : 'Operational risk'}
              </StatusChip>
            ) : null}
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {categoryLabel(item.category, de)}
            </span>
            {item.predictiveInsight ? (
              <span className="text-[9px] text-muted-foreground">
                {confidenceLabel(item.predictiveInsight.confidence, de)}
              </span>
            ) : null}
            {item.timeLabel && (
              <span className="text-[10px] tabular-nums text-muted-foreground">{item.timeLabel}</span>
            )}
          </div>

          <p
            className={[
              'font-semibold leading-snug text-foreground',
              focusMode ? 'text-[14px]' : 'text-[12px]',
            ].join(' ')}
          >
            {item.title}
          </p>

          {item.predictiveInsight ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {item.predictiveInsight.explanation}
            </p>
          ) : null}

          {item.predictiveInsight?.sourceData ? (
            <p className="text-[10px] text-muted-foreground/75">{item.predictiveInsight.sourceData}</p>
          ) : null}

          {item.predictiveInsight ? (
            <p className="text-[11px] font-medium text-foreground/85">
              {item.predictiveInsight.recommendedAction}
            </p>
          ) : item.reason ? (
            <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{item.reason}</p>
          ) : null}

          {item.entityLabel && (
            <p className="text-[10px] font-medium text-foreground/80">{item.entityLabel}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          runCta(item, vm, handlers);
        }}
        className="sq-btn sq-btn-secondary min-h-9 shrink-0 self-end text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:self-center"      >
        {ctaLabel(item.cta, de)}
        <Icon name="arrow-right" className="h-3.5 w-3.5 opacity-70" />
      </button>
    </li>
  );
});
function ActionQueueSkeleton({ de }: { de: boolean }) {
  return (
    <div className="px-2 py-2" aria-busy aria-label={de ? 'Aktionsliste lädt' : 'Loading action queue'}>
      <SkeletonRows rows={3} />
    </div>
  );
}

function ActionQueueEmpty({ vm }: { vm: DashboardViewModel }) {
  const { actionQueueEmptySummary: s, locale } = vm;
  const de = locale === 'de';

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
      <div className="sq-tone-success flex h-12 w-12 items-center justify-center rounded-2xl">
        <Icon name="check-circle" className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{s.title}</p>
        <p className="text-[12px] text-muted-foreground">{s.subtitle}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <span className="sq-chip sq-tone-success text-[10px]">{s.readyLabel}</span>
        <span className="sq-chip sq-tone-neutral text-[10px]">{s.handoverLabel}</span>
        <span className="sq-chip sq-tone-info text-[10px]">
          {de ? `Sync: ${s.syncLabel}` : `Sync: ${s.syncLabel}`}
        </span>
      </div>
    </div>
  );
}

export function ActionQueue({
  vm,
  onOpenVehicleById,
  onOpenBookingById,
  onOpenRentalView,
}: ActionQueueProps) {
  const {
    actionQueue,
    actionQueueLoading,
    actionQueueError,
    criticalOnly,
    operatorFocusMode,
    locale,
  } = vm;
  const de = locale === 'de';
  const [filterTab, setFilterTab] = useState<ActionQueueFilterTab>('all');

  const effectiveTab: ActionQueueFilterTab =
    operatorFocusMode || criticalOnly ? 'critical' : filterTab;

  const pinnedItems = useMemo(
    () => actionQueue.filter((i) => i.pinned).slice(0, 5),
    [actionQueue],
  );

  const pinnedIds = useMemo(() => new Set(pinnedItems.map((i) => i.id)), [pinnedItems]);

  const filteredItems = useMemo(() => {
    const filtered = filterActionQueue(actionQueue, effectiveTab);
    return filtered.filter((i) => !pinnedIds.has(i.id));
  }, [actionQueue, effectiveTab, pinnedIds]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, ACTION_QUEUE_LIST_CAP),
    [filteredItems],
  );
  const hiddenCount = Math.max(0, filteredItems.length - visibleItems.length);
  const handlers = { onOpenVehicleById, onOpenBookingById, onOpenRentalView };
  const hasItems = actionQueue.length > 0;
  const showEmpty = !actionQueueLoading && !hasItems;

  return (
    <section
      className={panelShellClass('primary', operatorFocusMode ? 'ring-1 ring-border/30' : undefined)}
      aria-label={de ? 'Aktionsliste' : 'Action queue'}
    >
      <DashboardPanelHeader
        icon={<Icon name="list-todo" className="h-4 w-4" />}
        iconToneClass="sq-tone-watch"
        title={
          operatorFocusMode
            ? de
              ? 'Kritische Aktionen'
              : 'Critical actions'
            : de
              ? 'Was braucht jetzt Aufmerksamkeit?'
              : 'What needs your attention now?'
        }
        subtitle={
          operatorFocusMode
            ? de
              ? 'Nur dringende operative Schritte'
              : 'Urgent operational steps only'
            : de
              ? 'Priorisierte Ops-Aktionen'
              : 'Prioritized operational actions'
        }
        trailing={
          <div className="flex flex-col items-end gap-1">
            {hasItems ? (
              <StatusChip tone={pinnedItems.length > 0 ? 'critical' : 'watch'}>
                {actionQueue.length}
              </StatusChip>
            ) : null}
            <DataTrustHint
              hint={sectionTrustHint('operations', vm.dataTrust)}
              locale={locale}
              className="text-right"
            />
          </div>
        }
      />
      {actionQueueError && (
        <div className="border-b border-border/40 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          {de
            ? 'Einige Insights konnten nicht geladen werden. Angezeigte Daten können unvollständig sein.'
            : 'Some insights could not be loaded. Displayed data may be incomplete.'}
        </div>
      )}

      {hasItems && !criticalOnly && !operatorFocusMode && (
        <div
          className="flex gap-1 overflow-x-auto border-b border-border/40 px-3 py-2"
          role="tablist"
          aria-label={de ? 'Filter' : 'Filter'}
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={effectiveTab === tab}
              onClick={() => setFilterTab(tab)}
              className={[
                INTERACTIVE_TAB_CLASS,
                effectiveTab === tab
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              ].join(' ')}            >
              {tabLabel(tab, de)}
            </button>
          ))}
        </div>
      )}

      {pinnedItems.length > 0 && (
        <div className="border-b border-border/50">
          <p className="px-4 pb-1 pt-2.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            {de ? 'Sofort handeln' : 'Act now'}
          </p>
          <ul>
            {pinnedItems.map((item) => (
              <ActionQueueRow
                key={item.id}
                item={item}
                de={de}
                vm={vm}
                handlers={handlers}
                pinned
                focusMode={operatorFocusMode}
              />
            ))}
          </ul>
        </div>
      )}

      {actionQueueLoading ? (
        <ActionQueueSkeleton de={de} />
      ) : showEmpty ? (
        <ActionQueueEmpty vm={vm} />
      ) : filteredItems.length > 0 ? (
        <>
          <ul>
            {visibleItems.map((item) => (
              <ActionQueueRow
                key={item.id}
                item={item}
                de={de}
                vm={vm}
                handlers={handlers}
                focusMode={operatorFocusMode}
              />
            ))}
          </ul>
          {hiddenCount > 0 && (
            <p className="border-t border-border/40 px-4 py-2.5 text-center text-[11px] text-muted-foreground">
              {de
                ? `${hiddenCount} weitere Einträge — Filter eingrenzen`
                : `${hiddenCount} more items — narrow filters`}
            </p>
          )}
        </>      ) : pinnedItems.length === 0 ? (
        <ActionQueueEmpty vm={vm} />
      ) : (
        <p className="px-4 py-3 text-center text-[11px] text-muted-foreground">
          {de ? 'Keine weiteren Items in diesem Filter.' : 'No more items in this filter.'}
        </p>
      )}
    </section>
  );
}
