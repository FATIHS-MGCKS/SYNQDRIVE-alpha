import { useMemo, useState, memo } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip, SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  countAtomicActions,
  filterActionQueueEntries,
  groupActionQueueEntries,
} from './actionQueueGrouping';
import { DataTrustHint } from './DataTrustHint';
import { sectionTrustHint } from './dataTrustBuilder';
import {
  ACTION_QUEUE_LIST_CAP,
  INTERACTIVE_ROW_CLASS,
  panelShellClass,
} from './dashboardShell';
import type {
  ActionQueueChildAction,
  ActionQueueChildSeverity,
  ActionQueueCta,
  ActionQueueFilterTab,
  ActionQueueGroupItem,
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

const STANDARD_VISIBLE_ITEMS = 8;

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

function ctaLabel(cta: ActionQueueCta, de: boolean, override?: string): string {
  if (override) return override;
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

function childSeverityLabel(severity: ActionQueueChildSeverity, de: boolean): string {
  if (severity === 'critical') return de ? 'Kritisch' : 'Critical';
  if (severity === 'overdue') return de ? 'Überfällig' : 'Overdue';
  if (severity === 'warning') return de ? 'Warnung' : 'Warning';
  if (severity === 'attention') return de ? 'Aufmerksamkeit' : 'Attention';
  return 'Info';
}

function childSeverityTone(severity: ActionQueueChildSeverity) {
  if (severity === 'critical') return 'critical' as const;
  if (severity === 'overdue') return 'watch' as const;
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

/**
 * Navigation-only CTA runner for grouped child actions. Handover confirmation
 * flows stay on leaf rows (single-booking items render as leaves), so children
 * only need the navigation subset here.
 */
function runChildCta(child: ActionQueueChildAction, handlers: ActionQueueHandlers) {
  const { onOpenVehicleById, onOpenBookingById, onOpenRentalView } = handlers;
  switch (child.cta) {
    case 'open-vehicle':
      if (child.vehicleId && onOpenVehicleById) onOpenVehicleById(child.vehicleId);
      break;
    case 'open-booking':
      if (child.bookingId && onOpenBookingById) onOpenBookingById(child.bookingId);
      else if (onOpenRentalView) onOpenRentalView('bookings');
      break;
    case 'open-stations':
      onOpenRentalView?.('stations');
      break;
    default:
      if (child.vehicleId && onOpenVehicleById) onOpenVehicleById(child.vehicleId);
      else onOpenRentalView?.('bookings');
      break;
  }
}

const ActionQueueLeafRow = memo(function ActionQueueLeafRow({
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
  const metaParts = [
    item.entityLabel,
    item.predictiveInsight ? confidenceLabel(item.predictiveInsight.confidence, de) : null,
    item.predictiveInsight?.sourceData,
  ].filter(Boolean);

  return (
    <li
      className={[
        'group relative flex flex-col gap-1.5 border-b border-border/35 px-2.5 py-1.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-2.5 sm:px-3 sm:py-2',
        INTERACTIVE_ROW_CLASS,
        pinned ? 'bg-[color:var(--status-critical)]/[0.025]' : 'hover:bg-muted/20',
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
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <div
          className={[
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-[1.03]',
            pinned ? 'sq-tone-critical' : 'sq-tone-neutral bg-muted/45',
          ].join(' ')}
        >
          <Icon name={categoryIcon(item.category)} className="h-3 w-3" />
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <StatusChip tone={severityTone(item.severity)} className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide">
              {severityLabel(item.severity, de)}
            </StatusChip>
            <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              {categoryLabel(item.category, de)}
            </span>
            {item.source === 'predictive-operations' ? (
              <span className="text-[9.5px] font-semibold uppercase tracking-wide text-[color:var(--status-ai)]">
                {de ? 'Operatives Risiko' : 'Operational risk'}
              </span>
            ) : null}
            {item.timeLabel && (
              <span className="text-[10.5px] tabular-nums text-muted-foreground">{item.timeLabel}</span>
            )}
          </div>

          <p
            className={cn(
              'text-[11px] font-semibold leading-snug tracking-[-0.01em] text-foreground text-pretty',
              focusMode && 'text-[12px]',
            )}
          >
            {item.title}
          </p>

          {item.predictiveInsight ? (
            <p className="line-clamp-1 text-[10px] leading-snug text-muted-foreground text-pretty">
              {item.predictiveInsight.explanation}
            </p>
          ) : item.reason ? (
            <p className="line-clamp-1 text-[10px] leading-snug text-muted-foreground text-pretty">
              {item.reason}
            </p>
          ) : null}

          {item.predictiveInsight ? (
            <p className="line-clamp-1 text-[10px] font-medium leading-snug text-foreground/80 text-pretty">
              {item.predictiveInsight.recommendedAction}
            </p>
          ) : null}

          {metaParts.length > 0 && (
            <p className="text-[10.5px] text-muted-foreground">{metaParts.join(' · ')}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          runCta(item, vm, handlers);
        }}
        className="sq-press inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:w-[116px] sm:self-center"
      >
        {ctaLabel(item.cta, de, item.ctaLabel)}
        <Icon name="arrow-right" className="h-3 w-3 opacity-70" />
      </button>
    </li>
  );
});

function ActionQueueChildRow({
  child,
  de,
  vm,
  handlers,
}: {
  child: ActionQueueChildAction;
  de: boolean;
  vm: DashboardViewModel;
  handlers: ActionQueueHandlers;
}) {
  const moduleLabel = child.moduleLabel ?? categoryLabel(child.category, de);
  return (
    <li
      className={cn(
        'group/child relative flex flex-col gap-1 border-b border-border/25 py-1.5 pl-9 pr-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-2.5 sm:pr-3',
        INTERACTIVE_ROW_CLASS,
        'cursor-pointer hover:bg-muted/15',
      )}
      onClick={() => vm.openDrilldown({ type: 'action-item', itemId: child.itemId })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          vm.openDrilldown({ type: 'action-item', itemId: child.itemId });
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <StatusChip
            tone={childSeverityTone(child.severity)}
            className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
          >
            {childSeverityLabel(child.severity, de)}
          </StatusChip>
          <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {moduleLabel}
          </span>
          {child.timeLabel ? (
            <span className="text-[10.5px] tabular-nums text-muted-foreground">{child.timeLabel}</span>
          ) : null}
        </div>
        <p className="text-[11px] font-semibold leading-snug tracking-[-0.01em] text-foreground text-pretty">
          {child.title}
        </p>
        {child.detail ? (
          <p className="line-clamp-1 text-[10px] leading-snug text-muted-foreground text-pretty">
            {child.detail}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          runChildCta(child, handlers);
        }}
        className="sq-press inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:w-[116px] sm:self-center"
      >
        {ctaLabel(child.cta, de, child.ctaLabel)}
        <Icon name="arrow-right" className="h-3 w-3 opacity-70" />
      </button>
    </li>
  );
}

function ActionQueueGroupRow({
  group,
  de,
  vm,
  handlers,
}: {
  group: ActionQueueGroupItem;
  de: boolean;
  vm: DashboardViewModel;
  handlers: ActionQueueHandlers;
}) {
  const criticalLike = group.severity === 'critical' || group.severity === 'overdue';
  const [expanded, setExpanded] = useState(criticalLike);
  const groupContentId = `aq-group-${group.id}`;

  return (
    <li
      className={cn(
        'border-b border-border/35 last:border-b-0',
        criticalLike ? 'bg-[color:var(--status-critical)]/[0.025]' : 'bg-muted/[0.18]',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={groupContentId}
        className={cn(
          'group/header flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:px-3 sm:py-2',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-transform group-hover/header:scale-[1.03]',
            criticalLike ? 'sq-tone-critical' : 'sq-tone-neutral bg-muted/45',
          )}
          aria-hidden
        >
          <Icon name={categoryIcon(group.category)} className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <StatusChip
              tone={childSeverityTone(group.severity)}
              className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
            >
              {childSeverityLabel(group.severity, de)}
            </StatusChip>
            <span className="block truncate text-[12px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
              {group.title}
            </span>
          </span>
          <span className="block truncate text-[10.5px] leading-snug text-muted-foreground">
            {group.subtitle}
          </span>
        </span>
        <Icon
          name="chevron-down"
          className={cn(
            'mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            !expanded && '-rotate-90',
          )}
          aria-hidden
        />
      </button>

      <ul id={groupContentId} hidden={!expanded} className={expanded ? 'animate-fade-up' : undefined}>
        {group.children.map((child) => (
          <ActionQueueChildRow
            key={child.id}
            child={child}
            de={de}
            vm={vm}
            handlers={handlers}
          />
        ))}
      </ul>
    </li>
  );
}

function ActionQueueCollapsedPreview({
  items,
  totalCount,
  loading,
  de,
  vm,
}: {
  items: ActionQueueItem[];
  totalCount: number;
  loading: boolean;
  de: boolean;
  vm: DashboardViewModel;
}) {
  if (loading) {
    return (
      <div className="px-3 py-2" aria-busy>
        <SkeletonRows rows={2} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-3.5 py-2.5 text-[11px] text-muted-foreground">
        {de ? 'Keine offenen Einträge.' : 'No open items.'}
      </div>
    );
  }

  const hiddenCount = Math.max(0, totalCount - items.length);

  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => vm.openDrilldown({ type: 'action-item', itemId: item.id })}
              className={cn(
                'group flex w-full items-start gap-2 border-b border-border/35 px-2.5 py-1.5 text-left transition-colors last:border-b-0 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:px-3',
                item.pinned && 'bg-[color:var(--status-critical)]/[0.025]',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-[1.03]',
                  item.pinned ? 'sq-tone-critical' : 'sq-tone-neutral bg-muted/45',
                )}
                aria-hidden
              >
                <Icon name={categoryIcon(item.category)} className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <StatusChip
                    tone={severityTone(item.severity)}
                    className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
                  >
                    {severityLabel(item.severity, de)}
                  </StatusChip>
                  <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {categoryLabel(item.category, de)}
                  </span>
                  {item.timeLabel ? (
                    <span className="text-[10.5px] tabular-nums text-muted-foreground">{item.timeLabel}</span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                  {item.title}
                </span>
                {(item.entityLabel || item.reason || item.predictiveInsight?.explanation) ? (
                  <span className="block truncate text-[10px] leading-snug text-muted-foreground">
                    {item.entityLabel ?? item.predictiveInsight?.explanation ?? item.reason}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p className="border-t border-border/25 px-3.5 py-1.5 text-[10.5px] text-muted-foreground">
          {de ? `+ ${hiddenCount} weitere — aufklappen für Details` : `+ ${hiddenCount} more — open for details`}
        </p>
      ) : null}
    </div>
  );
}

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
        <span className="sq-chip sq-tone-success">{s.readyLabel}</span>
        <span className="sq-chip sq-tone-neutral">{s.handoverLabel}</span>
        <span className="sq-chip sq-tone-info">
          {de ? `Sync: ${s.syncLabel}` : `Sync: ${s.syncLabel}`}
        </span>
      </div>
    </div>
  );
}

function ActionQueueHeader({
  vm,
  hasItems,
  pinnedCount,
  totalCount,
  isExpanded,
  onToggle,
  controlsId,
}: {
  vm: DashboardViewModel;
  hasItems: boolean;
  pinnedCount: number;
  totalCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  const { locale, operatorFocusMode } = vm;
  const de = locale === 'de';
  const title = operatorFocusMode
    ? de
      ? 'Kritische Aktionen'
      : 'Critical actions'
    : de
      ? 'Aufmerksamkeit'
      : 'Attention';
  const subtitle = operatorFocusMode
    ? de
      ? 'Dringende Schritte'
      : 'Urgent steps'
    : de
      ? 'Priorisierte Ops-Aktionen'
      : 'Prioritized actions';

  return (
    <div className="flex flex-col gap-2 border-b border-border/35 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            pinnedCount > 0 ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--status-watch)]',
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground text-balance">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        {hasItems ? (
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {totalCount} {de ? 'Einträge' : 'items'}
          </span>
        ) : null}
        <DataTrustHint
          hint={sectionTrustHint('operations', vm.dataTrust)}
          locale={locale}
          className="hidden text-right sm:block"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={controlsId}
          className="sq-press inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {isExpanded ? (de ? 'Zu' : 'Close') : (de ? 'Auf' : 'Open')}
          <Icon
            name="chevron-down"
            className={cn('h-3 w-3 transition-transform duration-200', !isExpanded && '-rotate-90')}
          />
        </button>
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
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = 'dashboard-attention-content';

  const effectiveTab: ActionQueueFilterTab =
    operatorFocusMode || criticalOnly ? 'critical' : filterTab;

  // Pinned "Act now" stays atomic for fast operational triage, but vehicle
  // health is excluded so a vehicle's modules always stay together in their
  // group instead of being split across "Act now" and the group below.
  const pinnedItems = useMemo(
    () => actionQueue.filter((i) => i.pinned && i.groupType !== 'vehicle-health').slice(0, 5),
    [actionQueue],
  );

  const pinnedIds = useMemo(() => new Set(pinnedItems.map((i) => i.id)), [pinnedItems]);

  const groupableItems = useMemo(
    () => actionQueue.filter((i) => !pinnedIds.has(i.id)),
    [actionQueue, pinnedIds],
  );

  const entries = useMemo(
    () => groupActionQueueEntries(groupableItems, locale),
    [groupableItems, locale],
  );

  const filteredEntries = useMemo(
    () => filterActionQueueEntries(entries, effectiveTab),
    [entries, effectiveTab],
  );

  const visibleEntryCap = operatorFocusMode ? ACTION_QUEUE_LIST_CAP : STANDARD_VISIBLE_ITEMS;
  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleEntryCap),
    [filteredEntries, visibleEntryCap],
  );

  const collapsedPreviewItems = useMemo(
    () => [...pinnedItems, ...groupableItems].slice(0, operatorFocusMode ? 3 : 2),
    [operatorFocusMode, pinnedItems, groupableItems],
  );

  // Header / overflow counts are in atomic actions, not visible groups.
  const hiddenCount = Math.max(
    0,
    countAtomicActions(filteredEntries) - countAtomicActions(visibleEntries),
  );
  const handlers = { onOpenVehicleById, onOpenBookingById, onOpenRentalView };
  const hasItems = actionQueue.length > 0;
  const showEmpty = !actionQueueLoading && !hasItems;

  return (
    <section
      className={panelShellClass(
        operatorFocusMode ? 'secondary' : 'tertiary',
        operatorFocusMode
          ? 'shadow-none ring-1 ring-border/30'
          : 'border-solid border-border/55 bg-card/55 shadow-none',
      )}
      aria-label={de ? 'Aktionsliste' : 'Action queue'}
    >
      <ActionQueueHeader
        vm={vm}
        hasItems={hasItems}
        pinnedCount={pinnedItems.length}
        totalCount={actionQueue.length}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((current) => !current)}
        controlsId={contentId}
      />
      {!isExpanded && (
        <ActionQueueCollapsedPreview
          items={collapsedPreviewItems}
          totalCount={actionQueue.length}
          loading={actionQueueLoading}
          de={de}
          vm={vm}
        />
      )}
      <div id={contentId} hidden={!isExpanded} className={isExpanded ? 'animate-fade-up' : undefined}>
          {actionQueueError && (
            <div className="border-b border-border/40 bg-muted/30 px-4 py-2.5 text-[12px] text-muted-foreground">
              {de
                ? 'Einige Insights konnten nicht geladen werden. Angezeigte Daten können unvollständig sein.'
                : 'Some insights could not be loaded. Displayed data may be incomplete.'}
            </div>
          )}

          {hasItems && !criticalOnly && !operatorFocusMode && (
            <div
              className="flex gap-1 overflow-x-auto border-b border-border/35 px-3 py-1.5"
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
                    'shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    effectiveTab === tab
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  ].join(' ')}
                >
                  {tabLabel(tab, de)}
                </button>
              ))}
            </div>
          )}

          {pinnedItems.length > 0 && (
            <div className="border-b border-border/40">
              <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {de ? 'Sofort handeln' : 'Act now'}
              </p>
              <ul>
                {pinnedItems.map((item) => (
                  <ActionQueueLeafRow
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
          ) : filteredEntries.length > 0 ? (
            <>
              <ul>
                {visibleEntries.map((entry) =>
                  entry.kind === 'group' ? (
                    <ActionQueueGroupRow
                      key={entry.id}
                      group={entry}
                      de={de}
                      vm={vm}
                      handlers={handlers}
                    />
                  ) : (
                    <ActionQueueLeafRow
                      key={entry.id}
                      item={entry}
                      de={de}
                      vm={vm}
                      handlers={handlers}
                      focusMode={operatorFocusMode}
                    />
                  ),
                )}
              </ul>
              {hiddenCount > 0 && (
                <p className="border-t border-border/40 px-4 py-3 text-center text-[12px] text-muted-foreground">
                  {de
                    ? `${hiddenCount} weitere Einträge — Filter eingrenzen`
                    : `${hiddenCount} more items — narrow filters`}
                </p>
              )}
            </>
          ) : pinnedItems.length === 0 ? (
            <ActionQueueEmpty vm={vm} />
          ) : (
            <p className="px-4 py-3 text-center text-[12px] text-muted-foreground">
              {de ? 'Keine weiteren Items in diesem Filter.' : 'No more items in this filter.'}
            </p>
          )}
      </div>
    </section>
  );
}
