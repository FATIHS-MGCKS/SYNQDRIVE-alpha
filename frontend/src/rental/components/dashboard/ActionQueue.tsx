import { useMemo, useState, memo } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  computeActionQueueTabCounts,
  prepareActionQueueRenderModel,
  toChildSeverity,
} from './actionQueueGrouping';
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
import {
  ACTION_QUEUE_FILTER_TABS,
  type ActionQueueChildAction,
  type ActionQueueCta,
  type ActionQueueEntry,
  type ActionQueueFilterTab,
  type ActionQueueGroupItem,
  type ActionQueueItem,
  type DashboardViewModel,
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

const STANDARD_VISIBLE_ITEMS = 8;
const COLLAPSED_PREVIEW_COUNT = 3;
const ENTRY_LIST_CLASS = 'flex flex-col gap-1 px-1 pb-1.5 sm:px-2';
const ENTRY_LIST_ITEM_CLASS = 'list-none';

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
    <li className={ENTRY_LIST_ITEM_CLASS}>
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
    <li className={ENTRY_LIST_ITEM_CLASS}>
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
    <li className={ENTRY_LIST_ITEM_CLASS}>
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border/30 transition-colors',
          expanded && 'border-border/40 bg-muted/[0.03]',
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
  pinnedItems,
  entries,
  atomicCount,
  visibleAtomicCount,
  loading,
  de,
  vm,
  handlers,
  obdPlugByVehicleId,
}: {
  pinnedItems: ActionQueueItem[];
  entries: ActionQueueEntry[];
  atomicCount: number;
  visibleAtomicCount: number;
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

  if (pinnedItems.length === 0 && entries.length === 0) {
    return (
      <div className="px-3.5 py-3 text-[12px] text-muted-foreground">
        {de ? 'Keine offenen Meldungen.' : 'No open alerts.'}
      </div>
    );
  }

  const hiddenAtomicCount = Math.max(0, atomicCount - visibleAtomicCount);

  return (
    <div className="px-1 pb-1.5 sm:px-2">
      {pinnedItems.length > 0 ? (
        <ul className={cn(ENTRY_LIST_CLASS, 'mb-1')}>
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
      ) : null}
      <ul className={ENTRY_LIST_CLASS}>
        {entries.map((entry) =>
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
              pinned={entry.pinned}
              obdPlugByVehicleId={obdPlugByVehicleId}
            />
          ),
        )}
      </ul>
      {hiddenAtomicCount > 0 ? (
        <p className="px-1 text-center text-[11px] text-muted-foreground">
          {de
            ? `+ ${hiddenAtomicCount} weitere Meldungen`
            : `+ ${hiddenAtomicCount} more alerts`}
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

function tabBadgeTone(
  tab: ActionQueueFilterTab,
  count: number,
): string {
  if (count <= 0) return 'bg-muted/50 text-muted-foreground';
  switch (tab) {
    case 'critical':
      return 'bg-[color:color-mix(in_srgb,var(--status-critical)_14%,transparent)] text-[color:var(--status-critical)]';
    case 'operations':
      return 'bg-[color:color-mix(in_srgb,var(--status-watch)_14%,transparent)] text-[color:var(--status-watch)]';
    case 'vehicle':
      return 'bg-[color:color-mix(in_srgb,var(--status-info)_12%,transparent)] text-[color:var(--status-info)]';
    case 'notifications':
      return 'bg-muted/60 text-muted-foreground';
    default:
      return 'bg-[color:color-mix(in_srgb,var(--brand)_10%,transparent)] text-[color:var(--brand)]';
  }
}

function ActionQueueFilterTabBar({
  effectiveTab,
  tabCounts,
  de,
  onSelectTab,
}: {
  effectiveTab: ActionQueueFilterTab;
  tabCounts: Record<ActionQueueFilterTab, number>;
  de: boolean;
  onSelectTab: (tab: ActionQueueFilterTab) => void;
}) {
  return (
    <div
      className="sq-tab-bar flex w-full items-center p-1"
      role="tablist"
      aria-label={de ? 'Filter' : 'Filter'}
    >
      <div className="flex min-w-0 flex-1 flex-nowrap gap-0.5 overflow-x-auto scrollbar-thin [scrollbar-width:thin]">
        {ACTION_QUEUE_FILTER_TABS.map((tab) => {
          const isActive = effectiveTab === tab;
          const count = tabCounts[tab] ?? 0;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectTab(tab)}
              className={cn(
                'inline-flex min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-[11px] font-semibold leading-[16.2px] tracking-[-0.003em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isActive
                  ? 'surface-premium text-foreground shadow-[var(--shadow-1)]'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              )}
            >
              <span className="truncate">{tabLabel(tab, de)}</span>
              <span
                className={cn(
                  'inline-flex min-w-[1.125rem] shrink-0 items-center justify-center rounded-full px-1 py-px text-[9.5px] font-semibold tabular-nums leading-none',
                  tabBadgeTone(tab, count),
                )}
                aria-hidden
              >
                {count}
              </span>
            </button>
          );
        })}
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
    ? de ? 'Kritische Aktionen' : 'Critical actions'
    : 'Notifications';

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/35 px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            pinnedCount > 0 ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--status-watch)]',
          )}
          aria-hidden
        />
        <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground text-balance">
          {title}
        </h2>
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
            className="sq-press inline-flex min-h-8 shrink-0 items-center rounded-md px-2 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
          >
            {attentionExpandLabel(totalCount, de, isExpanded)}
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

  const visibleEntryCap = operatorFocusMode ? ACTION_QUEUE_LIST_CAP : STANDARD_VISIBLE_ITEMS;
  const collapsedPreviewCap = operatorFocusMode ? 3 : COLLAPSED_PREVIEW_COUNT;

  const renderModel = useMemo(
    () => prepareActionQueueRenderModel({
      items: actionQueue,
      locale,
      tab: effectiveTab,
      visibleEntryCap,
    }),
    [actionQueue, locale, effectiveTab, visibleEntryCap],
  );

  const collapsedPreviewModel = useMemo(
    () => prepareActionQueueRenderModel({
      items: actionQueue,
      locale,
      tab: effectiveTab,
      visibleEntryCap: collapsedPreviewCap,
    }),
    [actionQueue, locale, effectiveTab, collapsedPreviewCap],
  );

  const tabCounts = useMemo(
    () => computeActionQueueTabCounts(actionQueue, locale),
    [actionQueue, locale],
  );

  const {
    pinnedItems,
    visibleEntries,
    filteredEntries,
    atomicCount,
    visibleAtomicCount,
  } = renderModel;

  const hiddenAtomicCount = Math.max(0, atomicCount - visibleAtomicCount);
  const handlers = { onOpenVehicleById, onOpenBookingById, onOpenRentalView };
  const hasItems = atomicCount > 0;
  const showEmpty = !actionQueueLoading && !hasItems;

  return (
    <section
      className={cn(
        panelShellClass(
          operatorFocusMode ? 'secondary' : 'tertiary',
          operatorFocusMode
            ? 'shadow-none ring-1 ring-border/30'
            : '',
        ),
        'w-full min-w-0',
      )}
      aria-label="Notifications"
    >
      <ActionQueueHeader
        vm={vm}
        hasItems={hasItems}
        pinnedCount={pinnedItems.length}
        totalCount={atomicCount}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((current) => !current)}
        controlsId={contentId}
      />
      {!isExpanded && (
        <ActionQueueCollapsedPreview
          pinnedItems={collapsedPreviewModel.pinnedItems}
          entries={collapsedPreviewModel.visibleEntries}
          atomicCount={collapsedPreviewModel.atomicCount}
          visibleAtomicCount={collapsedPreviewModel.visibleAtomicCount}
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
            <div className="border-b border-border/35 px-2 py-1.5 sm:px-2.5">
              <ActionQueueFilterTabBar
                effectiveTab={effectiveTab}
                tabCounts={tabCounts}
                de={de}
                onSelectTab={setFilterTab}
              />
            </div>
          )}

          {pinnedItems.length > 0 && (
            <div className="border-b border-border/35 px-1 pb-1.5 pt-1.5 sm:px-2">
              <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {de ? 'Sofort handeln' : 'Act now'}
              </p>
              <ul className={ENTRY_LIST_CLASS}>
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
              <ul className={ENTRY_LIST_CLASS}>
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
              {hiddenAtomicCount > 0 && (
                <p className="border-t border-border/35 px-4 py-2.5 text-center text-[11px] text-muted-foreground">
                  {de
                    ? `${hiddenAtomicCount} weitere Meldungen — Filter eingrenzen oder „Alle anzeigen“ nutzen`
                    : `${hiddenAtomicCount} more alerts — narrow filters or show all`}
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
