import { useMemo, useState, memo } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  countAtomicActions,
  filterActionQueueEntries,
  groupActionQueueEntries,
  toChildSeverity,
} from './actionQueueGrouping';
import { attentionCountLabel } from './dashboardAttentionBuilder';
import {
  attentionExpandLabel,
  composeAttentionChildCopy,
  composeAttentionGroupCopy,
  composeAttentionItemCopy,
  enrichAttentionCopyWithObdUnplugged,
} from './attentionItemDisplay';
import { AttentionItemRow, AttentionRowAction } from './AttentionItemRow';
import { DataTrustHint } from './DataTrustHint';
import { useRentalOrg } from '../../RentalContext';
import { useFleetObdPlugIndex } from '../../hooks/useFleetObdPlugIndex';
import { sectionTrustHint } from './dataTrustBuilder';
import {
  ACTION_QUEUE_LIST_CAP,
  panelShellClass,
} from './dashboardShell';
import type {
  ActionQueueChildAction,
  ActionQueueCta,
  ActionQueueFilterTab,
  ActionQueueGroupItem,
  ActionQueueItem,
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
const COLLAPSED_PREVIEW_COUNT = 3;

function ctaLabel(cta: ActionQueueCta, de: boolean, override?: string): string {
  if (override) return override;
  if (cta === 'open-vehicle') return de ? 'Fahrzeug öffnen' : 'Open vehicle';
  if (cta === 'open-booking') return de ? 'Buchung öffnen' : 'Open booking';
  if (cta === 'start-handover-pickup') return de ? 'Übergabe starten' : 'Start handover';
  if (cta === 'start-handover-return') return de ? 'Rückgabe starten' : 'Start return';
  if (cta === 'open-stations') return de ? 'Stationen öffnen' : 'Open stations';
  return de ? 'Vermietung öffnen' : 'Open rental';
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
  obdPlugByVehicleId,
}: {
  item: ActionQueueItem;
  de: boolean;
  vm: DashboardViewModel;
  handlers: ActionQueueHandlers;
  pinned?: boolean;
  focusMode?: boolean;
  obdPlugByVehicleId: Map<string, boolean | null>;
}) {
  const copy = enrichAttentionCopyWithObdUnplugged(
    composeAttentionItemCopy(item),
    item,
    obdPlugByVehicleId,
  );
  return (
    <li className="list-none">
      <AttentionItemRow
        severity={toChildSeverity(item)}
        category={item.category}
        module={item.module}
        groupType={item.groupType}
        copy={copy}
        timeLabel={item.timeLabel}
        ctaLabel={ctaLabel(item.cta, de, item.ctaLabel)}
        de={de}
        pinned={pinned}
        onRowClick={() => vm.openDrilldown({ type: 'action-item', itemId: item.id })}
        onCtaClick={() => runCta(item, vm, handlers)}
      />
    </li>
  );
});

function ActionQueueChildRow({
  child,
  de,
  vm,
  handlers,
  obdPlugByVehicleId,
}: {
  child: ActionQueueChildAction;
  de: boolean;
  vm: DashboardViewModel;
  handlers: ActionQueueHandlers;
  obdPlugByVehicleId: Map<string, boolean | null>;
}) {
  const copy = enrichAttentionCopyWithObdUnplugged(
    composeAttentionChildCopy(child),
    {
      title: child.title,
      vehicleId: child.vehicleId,
      reason: child.detail,
    },
    obdPlugByVehicleId,
  );
  return (
    <li className="list-none">
      <AttentionItemRow
        severity={child.severity}
        category={child.category}
        module={child.module}
        copy={copy}
        timeLabel={child.timeLabel}
        ctaLabel={ctaLabel(child.cta, de, child.ctaLabel)}
        de={de}
        nested
        onRowClick={() => vm.openDrilldown({ type: 'action-item', itemId: child.itemId })}
        onCtaClick={() => runChildCta(child, handlers)}
      />
    </li>
  );
}

function ActionQueueGroupRow({
  group,
  de,
  vm,
  handlers,
  obdPlugByVehicleId,
}: {
  group: ActionQueueGroupItem;
  de: boolean;
  vm: DashboardViewModel;
  handlers: ActionQueueHandlers;
  obdPlugByVehicleId: Map<string, boolean | null>;
}) {
  const criticalLike = group.severity === 'critical' || group.severity === 'overdue';
  const [expanded, setExpanded] = useState(false);
  const groupContentId = `aq-group-${group.id}`;

  return (
    <li className="list-none">
      <div
        className={cn(
          'overflow-hidden rounded-lg transition-colors',
          expanded && 'border border-border/35 bg-muted/[0.03]',
        )}
      >
        <AttentionItemRow
          severity={group.severity}
          category={group.category}
          groupType={group.groupType}
          copy={composeAttentionGroupCopy(group)}
          de={de}
          pinned={criticalLike}
          onRowClick={() => setExpanded((value) => !value)}
          trailing={(
            <AttentionRowAction
              label={expanded ? (de ? 'Einklappen' : 'Collapse') : (de ? 'Details' : 'Details')}
              icon="chevron-down"
              expanded={expanded}
              ariaExpanded={expanded}
              ariaControls={groupContentId}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((value) => !value);
              }}
            />
          )}
        />

        {expanded ? (
          <ul
            id={groupContentId}
            className="border-t border-border/25 animate-fade-up"
          >
            {group.children.map((child) => (
              <ActionQueueChildRow
                key={child.id}
                child={child}
                de={de}
                vm={vm}
                handlers={handlers}
                obdPlugByVehicleId={obdPlugByVehicleId}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function ActionQueueCollapsedPreview({
  items,
  totalCount,
  loading,
  de,
  vm,
  handlers,
  obdPlugByVehicleId,
}: {
  items: ActionQueueItem[];
  totalCount: number;
  loading: boolean;
  de: boolean;
  vm: DashboardViewModel;
  handlers: ActionQueueHandlers;
  obdPlugByVehicleId: Map<string, boolean | null>;
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
      <div className="px-3.5 py-3 text-[12px] text-muted-foreground">
        {de ? 'Keine offenen Meldungen.' : 'No open alerts.'}
      </div>
    );
  }

  const hiddenCount = Math.max(0, totalCount - items.length);

  return (
    <div className="px-1 pb-1.5 sm:px-2">
      <ul className="divide-y divide-border/30 overflow-hidden rounded-lg">
        {items.map((item) => (
          <ActionQueueLeafRow
            key={item.id}
            item={item}
            de={de}
            vm={vm}
            handlers={handlers}
            pinned={item.pinned}
            obdPlugByVehicleId={obdPlugByVehicleId}
          />
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p className="px-1 text-center text-[11px] text-muted-foreground">
          {de
            ? `+ ${hiddenCount} weitere Meldungen`
            : `+ ${hiddenCount} more alerts`}
        </p>
      ) : null}
    </div>
  );
}

function ActionQueueSkeleton({ de }: { de: boolean }) {
  return (
    <div className="px-3 py-2" aria-busy aria-label={de ? 'Meldungen laden' : 'Loading alerts'}>
      <SkeletonRows rows={3} />
    </div>
  );
}

function ActionQueueEmpty({ vm }: { vm: DashboardViewModel }) {
  const { actionQueueEmptySummary: summary, locale } = vm;
  const de = locale === 'de';

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-7 text-center">
      <div className="sq-tone-success flex h-10 w-10 items-center justify-center rounded-xl">
        <Icon name="check-circle" className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-foreground">
          {de ? 'Keine offenen Meldungen' : 'No open alerts'}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {de ? 'Alles im grünen Bereich' : 'Everything looks clear'}
        </p>
      </div>
      {summary.readyCount > 0 ? (
        <p className="text-[11px] text-muted-foreground">{summary.readyLabel}</p>
      ) : null}
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
    ? de ? 'Kritische Aktionen' : 'Critical actions'
    : 'Notifications';
  const subtitle = operatorFocusMode
    ? de ? 'Dringende Schritte' : 'Urgent steps'
    : de ? 'Priorisierte Meldungen' : 'Prioritized notifications';

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
            {attentionCountLabel(totalCount, de)}
          </span>
        ) : null}
        <DataTrustHint
          hint={sectionTrustHint('operations', vm.dataTrust)}
          locale={locale}
          className="hidden text-right sm:block"
        />
        {hasItems ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={controlsId}
            className="sq-btn sq-btn-secondary min-h-9 px-2.5 text-[11px]"
          >
            {attentionExpandLabel(totalCount, de, isExpanded)}
            <Icon
              name="chevron-down"
              className={cn('h-3.5 w-3.5 opacity-70 transition-transform duration-200', !isExpanded && '-rotate-90')}
            />
          </button>
        ) : null}
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
  const { orgId } = useRentalOrg();
  const obdPlugByVehicleId = useFleetObdPlugIndex(orgId);
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
    () => [...pinnedItems, ...groupableItems].slice(0, operatorFocusMode ? 3 : COLLAPSED_PREVIEW_COUNT),
    [operatorFocusMode, pinnedItems, groupableItems],
  );

  const hiddenCount = Math.max(
    0,
    countAtomicActions(filteredEntries) - countAtomicActions(visibleEntries),
  );
  const handlers = { onOpenVehicleById, onOpenBookingById, onOpenRentalView };
  const hasItems = actionQueue.length > 0;
  const showEmpty = !actionQueueLoading && !hasItems;

  return (
    <section
      className={cn(
        panelShellClass(
          operatorFocusMode ? 'secondary' : 'tertiary',
          operatorFocusMode
            ? 'shadow-none ring-1 ring-border/30'
            : 'border-solid border-border/55 bg-card/55 shadow-none',
        ),
        'h-full',
      )}
      aria-label="Notifications"
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
          handlers={handlers}
          obdPlugByVehicleId={obdPlugByVehicleId}
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
            <div className="border-b border-border/35 px-1 pb-1.5 pt-1.5 sm:px-2">
              <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {de ? 'Sofort handeln' : 'Act now'}
              </p>
              <ul className="divide-y divide-border/30 overflow-hidden rounded-lg border border-border/35">
                {pinnedItems.map((item) => (
                  <ActionQueueLeafRow
                    key={item.id}
                    item={item}
                    de={de}
                    vm={vm}
                    handlers={handlers}
                    pinned
                    obdPlugByVehicleId={obdPlugByVehicleId}
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
              <ul className="divide-y divide-border/30 px-1 pb-1.5 sm:px-2">
                {visibleEntries.map((entry) =>
                  entry.kind === 'group' ? (
                    <ActionQueueGroupRow
                      key={entry.id}
                      group={entry}
                      de={de}
                      vm={vm}
                      handlers={handlers}
                      obdPlugByVehicleId={obdPlugByVehicleId}
                    />
                  ) : (
                    <ActionQueueLeafRow
                      key={entry.id}
                      item={entry}
                      de={de}
                      vm={vm}
                      handlers={handlers}
                      obdPlugByVehicleId={obdPlugByVehicleId}
                    />
                  ),
                )}
              </ul>
              {hiddenCount > 0 && (
                <p className="border-t border-border/35 px-4 py-2.5 text-center text-[11px] text-muted-foreground">
                  {de
                    ? `${hiddenCount} weitere Meldungen — Filter eingrenzen oder „Alle anzeigen“ nutzen`
                    : `${hiddenCount} more alerts — narrow filters or show all`}
                </p>
              )}
            </>
          ) : pinnedItems.length === 0 ? (
            <ActionQueueEmpty vm={vm} />
          ) : (
            <p className="px-4 py-3 text-center text-[12px] text-muted-foreground">
              {de ? 'Keine weiteren Meldungen in diesem Filter.' : 'No more alerts in this filter.'}
            </p>
          )}
      </div>
    </section>
  );
}
