import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { useFleetVehicles } from '../../FleetContext';
import { ActiveRentalDrawerRowCard } from './ActiveRentalDrawerRowCard';
import { CompactFleetDrawerVehicleRow } from './CompactFleetDrawerVehicleRow';
import {
  dedupeDisplayReasons,
  formatRuntimeReasonLabel,
  runtimeReasonTooltip,
} from './reasonDisplay';
import { buildDashboardGroups } from './dashboardDrilldownGroups';
import {
  composeBookingDrawerRowDisplay,
  filterDashboardDrawerGroups,
  readyToRentDrawerHint,
  resolveHandoverReadinessBadge,
  resolveHandoverVehicleReasonBadge,
  sortReadyToRentDrawerGroupsByLastSignal,
} from './dashboardDrilldownRowDisplay';
import {
  dashboardDrilldownSectionClassName,
  DashboardDrilldownSectionHeader,
  DashboardDrilldownToolbar,
  drawerStationScopeLabel,
} from './dashboardDrilldownUi';
import { drawerHeaderHint } from './dashboardDrawerNormalize';
import type { TodaysOperationsDrilldownGroupId } from './dashboardDrilldownTypes';
import type { DashboardViewModel, DashboardViewProps } from './dashboardTypes';
import type {
  BusinessMetricId,
  BusinessPulseRow,
  BusinessPulseSlice,
  DashboardRuntimeModel,
  DashboardSlice,
  DashboardSliceId,
  DashboardSliceRow,
  VehicleRuntimeState,
} from './runtime';
import { formatDashboardMoney } from './dashboardKpiFormat';
import { resolveTodaysOperationsKpiCounts } from './dashboardSliceAccess';

interface DashboardDrilldownDrawerProps {
  activeTargetId: DashboardSliceId | BusinessMetricId | null;
  focusedGroupId?: TodaysOperationsDrilldownGroupId | null;
  dashboardRuntime: DashboardRuntimeModel;
  businessPulseSlices?: Record<BusinessMetricId, BusinessPulseSlice>;
  loading?: boolean;
  locale: DashboardViewModel['locale'];
  selectedStationName?: string | null;
  onClose: () => void;
  onOpenVehicle?: DashboardViewProps['onOpenVehicleById'];
  onOpenBooking?: DashboardViewProps['onOpenBookingById'];
  onOpenInvoice?: (invoiceId: string) => void;
  onOpenBilling?: () => void;
}

const VEHICLE_DRAWER_SLICE_IDS = new Set<DashboardSliceId>([
  'ready-to-rent',
  'critical-alerts',
  'blocked-maintenance',
]);

function isVehicleDrawerSlice(sliceId: DashboardSliceId): boolean {
  return VEHICLE_DRAWER_SLICE_IDS.has(sliceId);
}

const DASHBOARD_SLICE_IDS = new Set<DashboardSliceId>([
  'ready-to-rent',
  'active-rented',
  'due-soon',
  'overdue-returns',
  'overdue-pickups',
  'blocked-maintenance',
  'critical-alerts',
]);

const BUSINESS_METRIC_IDS = new Set<BusinessMetricId>([
  'revenue',
  'profit',
  'expenses',
  'open-receivables',
  'overdue-receivables',
  'paid-invoices',
  'draft-invoices',
  'failed-payments',
]);

function isDashboardSliceId(id: string): id is DashboardSliceId {
  return DASHBOARD_SLICE_IDS.has(id as DashboardSliceId);
}

function isBusinessMetricId(id: string): id is BusinessMetricId {
  return BUSINESS_METRIC_IDS.has(id as BusinessMetricId);
}

function severityTone(severity: DashboardSliceRow['severity'] | BusinessPulseRow['severity']) {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'watch';
  if (severity === 'success') return 'success';
  if (severity === 'info') return 'info';
  return 'neutral';
}

function readinessTone(tone: DashboardSliceRow['readinessTone'] | undefined) {
  if (tone === 'critical') return 'critical';
  if (tone === 'watch') return 'watch';
  if (tone === 'success') return 'success';
  if (tone === 'info') return 'info';
  return 'neutral';
}

function handoverReasonChipClass(tone: 'success' | 'watch' | 'warning' | 'critical' | 'neutral'): string {
  if (tone === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
  }
  if (tone === 'watch' || tone === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  if (tone === 'success') {
    return 'bg-[color:color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[color:var(--status-success)]';
  }
  return 'bg-muted text-muted-foreground';
}

function formatOperationsDrawerDate(locale: string, now = new Date()): string {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
}

function operationsDrawerStationLabel(
  selectedStationName: string | null | undefined,
  de: boolean,
): string {
  const trimmed = selectedStationName?.trim();
  return trimmed || (de ? 'Alle Stationen' : 'All stations');
}

function formatDate(value: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function reasonsLabel(count: number, de: boolean): string {
  return de ? `+${count} Gründe` : `+${count} reasons`;
}

function vehicleStatesById(states: VehicleRuntimeState[]): Map<string, VehicleRuntimeState> {
  return new Map(states.map((state) => [state.vehicleId, state]));
}

function sliceDisplayTitle(slice: DashboardSlice, de: boolean): string {
  if (slice.id === 'blocked-maintenance') {
    return de ? 'Blockiert / Wartung' : 'Blocked / maintenance';
  }
  return slice.title;
}

function defaultVehicleCta(de: boolean): string {
  return de ? 'Fahrzeug öffnen' : 'Open vehicle';
}

function defaultBookingCta(de: boolean): string {
  return de ? 'Zur Buchung' : 'To booking';
}

function defaultInvoiceCta(de: boolean): string {
  return de ? 'Rechnung öffnen' : 'Open invoice';
}

function operativeEyebrow(sliceId: DashboardSliceId, de: boolean): string {
  if (sliceId === 'ready-to-rent') return de ? 'Mietbereitschaft' : 'Rental readiness';
  if (sliceId === 'critical-alerts') return de ? 'Alerts & Probleme' : 'Alerts & issues';
  if (sliceId === 'blocked-maintenance') return de ? 'Service & Blocker' : 'Service & blockers';
  if (sliceId === 'due-soon') return de ? 'Timeline' : 'Timeline';
  if (sliceId === 'overdue-returns') return de ? 'Rückgaben' : 'Returns';
  if (sliceId === 'overdue-pickups') return de ? 'Übergaben' : 'Pickups';
  return de ? 'Operativ' : 'Operations';
}

function vehicleDrawerEmptyTitle(slice: DashboardSlice, de: boolean): string {
  if (slice.id === 'critical-alerts') {
    return de ? 'Keine kritischen Alerts' : 'No critical alerts';
  }
  if (slice.id === 'blocked-maintenance') {
    return de ? 'Keine blockierten Fahrzeuge' : 'No blocked vehicles';
  }
  return emptyTitle(slice, de);
}

function vehicleDrawerEmptyDescription(slice: DashboardSlice, de: boolean): string {
  if (slice.id === 'critical-alerts') {
    return de
      ? 'In diesem Bereich liegen aktuell keine kritischen Hinweise vor.'
      : 'No critical alerts in this scope right now.';
  }
  if (slice.id === 'blocked-maintenance') {
    return de
      ? 'Aktuell keine Fahrzeuge blockiert oder in Wartung in diesem Bereich.'
      : 'No blocked or maintenance vehicles in this scope right now.';
  }
  return emptyDescription(slice, de);
}

function drawerSearchEmptyTitle(de: boolean): string {
  return de ? 'Keine Treffer' : 'No matches';
}

function drawerSearchEmptyDescription(de: boolean): string {
  return de
    ? 'Passe die Suche an oder wähle eine andere Station.'
    : 'Adjust your search or try a different station.';
}

function emptyTitle(slice: DashboardSlice, de: boolean): string {
  return slice.emptyTitle ?? (de ? 'Keine Fahrzeuge' : 'No vehicles');
}

function emptyDescription(slice: DashboardSlice, de: boolean): string {
  return slice.emptyDescription ?? (de ? 'Aktuell keine Einträge in diesem Bereich.' : 'No items in this area right now.');
}

function BookingDrawerRowCard({
  row,
  de,
  vehicle,
  health,
  runtimeState,
  onOpenVehicle,
  onOpenBooking,
  onClose,
}: {
  row: DashboardSliceRow;
  de: boolean;
  vehicle?: VehicleData;
  health?: VehicleHealthResponse | null;
  runtimeState?: VehicleRuntimeState;
  onOpenVehicle?: DashboardViewProps['onOpenVehicleById'];
  onOpenBooking?: DashboardViewProps['onOpenBookingById'];
  onClose: () => void;
}) {
  const locale = de ? 'de' : 'en';
  const display = composeBookingDrawerRowDisplay(row);
  const reasons = dedupeDisplayReasons(row.reasons ?? []);
  const excluded = new Set(
    [display.subtitle, display.title, row.stationLabel].map((value) => (value ?? '').trim().toLowerCase()),
  );
  const visibleReasons = reasons.filter(
    (reason) => !excluded.has(formatRuntimeReasonLabel(reason, locale).trim().toLowerCase()),
  );
  const primaryReasonText = visibleReasons[0]
    ? formatRuntimeReasonLabel(visibleReasons[0], locale)
    : undefined;
  const metaNormalized = (display.meta ?? '').trim().toLowerCase();
  const showMeta = display.meta
    && !metaNormalized.includes((row.stationLabel ?? '').trim().toLowerCase())
    && (!primaryReasonText || metaNormalized !== primaryReasonText.trim().toLowerCase());
  const showStation = row.stationLabel
    && !metaNormalized.includes(row.stationLabel.trim().toLowerCase());
  const timingText = row.statusLabel
    ?? (row.severity === 'critical'
      ? de ? 'Kritisch' : 'Critical'
      : row.severity === 'warning'
        ? de ? 'Warnung' : 'Warning'
        : row.severity === 'success'
          ? de ? 'Bereit' : 'Ready'
          : null);
  const canOpenBooking = Boolean(row.bookingId && onOpenBooking);
  const canOpenVehicle = Boolean(row.vehicleId && onOpenVehicle);
  const ctaLabel = row.primaryActionLabel ?? (row.bookingId ? defaultBookingCta(de) : defaultVehicleCta(de));
  const canOpen = canOpenBooking || canOpenVehicle;
  const bookingNumberLine = row.bookingRef
    ? `${de ? 'Buchungsnummer' : 'Booking no.'}: ${row.bookingRef}`
    : undefined;
  const handoverReadiness = resolveHandoverReadinessBadge(
    vehicle,
    health,
    runtimeState,
    locale,
    row.readinessLabel,
  );
  const readinessChip = handoverReadiness
    ? { label: handoverReadiness.label, tone: handoverReadiness.tone }
    : row.readinessLabel
      ? { label: row.readinessLabel, tone: readinessTone(row.readinessTone) }
      : null;
  const vehicleReasonBadge = resolveHandoverVehicleReasonBadge(row, vehicle, health, locale);

  return (
    <article className="rounded-lg border border-border/45 surface-premium/45 px-2.5 py-2 shadow-sm shadow-black/[0.02] transition-colors hover:border-border/65 hover:bg-muted/10">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-[-0.01em] text-foreground">
          {display.title}
        </h3>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {timingText ? (
            <StatusChip
              tone={severityTone(row.severity)}
              className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
            >
              {timingText}
            </StatusChip>
          ) : null}
          {readinessChip ? (
            <StatusChip
              tone={
                readinessChip.tone === 'watch'
                  ? 'watch'
                  : readinessChip.tone === 'critical'
                    ? 'critical'
                    : readinessChip.tone === 'success'
                      ? 'success'
                      : readinessChip.tone === 'info'
                        ? 'info'
                        : 'neutral'
              }
              className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
            >
              {readinessChip.label}
            </StatusChip>
          ) : null}
        </div>
      </div>

      <div className="mt-1 space-y-1">
        {display.subtitle ? (
          <p className="truncate text-[10.5px] text-muted-foreground">{display.subtitle}</p>
        ) : null}
        {bookingNumberLine ? (
          <p className="truncate text-[10.5px] text-muted-foreground">{bookingNumberLine}</p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          {showStation ? (
            <p className="flex min-w-0 flex-1 items-center gap-1 text-[10px] text-muted-foreground">
              <Icon name="map-pin" className="h-3 w-3 shrink-0" />
              <span className="truncate">{row.stationLabel}</span>
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {canOpen ? (
            <button
              type="button"
              onClick={() => {
                if (row.bookingId && onOpenBooking) onOpenBooking(row.bookingId);
                else if (row.vehicleId && onOpenVehicle) onOpenVehicle(row.vehicleId);
                onClose();
              }}
              className="sq-btn sq-btn-secondary min-h-8 shrink-0 px-2.5 text-[11px]"
            >
              {ctaLabel}
              <Icon name="arrow-right" className="h-3.5 w-3.5 opacity-70" />
            </button>
          ) : null}
        </div>
        {showMeta ? (
          <p className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground/90 text-pretty">{display.meta}</p>
        ) : null}
        {vehicleReasonBadge ? (
          <span
            className={cn(
              'inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              handoverReasonChipClass(vehicleReasonBadge.tone),
            )}
          >
            <span className="truncate">{vehicleReasonBadge.text}</span>
          </span>
        ) : null}
        {primaryReasonText ? (
          <p className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground/95 text-pretty">
            {primaryReasonText}
          </p>
        ) : null}
        {visibleReasons.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {visibleReasons.slice(1, 3).map((reason) => (
              <span
                key={reason.id}
                title={runtimeReasonTooltip(reason, locale)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  reason.severity === 'critical'
                    ? 'bg-[color:var(--status-critical)]/10 text-[color:var(--status-critical)]'
                    : reason.severity === 'warning'
                      ? 'bg-[color:var(--status-watch)]/10 text-[color:var(--status-watch)]'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {formatRuntimeReasonLabel(reason, locale)}
              </span>
            ))}
            {visibleReasons.length > 3 ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {reasonsLabel(visibleReasons.length - 3, de)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DashboardRowCard({
  row,
  sliceId,
  focusedGroupId,
  state,
  vehicle,
  health,
  de,
  onOpenVehicle,
  onOpenBooking,
  onClose,
}: {
  row: DashboardSliceRow;
  sliceId: DashboardSliceId;
  focusedGroupId?: TodaysOperationsDrilldownGroupId | null;
  state?: VehicleRuntimeState;
  vehicle?: VehicleData;
  health?: VehicleHealthResponse | null;
  de: boolean;
  onOpenVehicle?: DashboardViewProps['onOpenVehicleById'];
  onOpenBooking?: DashboardViewProps['onOpenBookingById'];
  onClose: () => void;
}) {
  const locale = de ? 'de' : 'en';
  if (row.vehicleId && !row.bookingId) {
    if (!vehicle) return null;
    if (sliceId === 'active-rented' && focusedGroupId === 'active-rentals') {
      return (
        <ActiveRentalDrawerRowCard
          row={row}
          vehicle={vehicle}
          health={health}
          runtimeState={state}
          locale={locale}
          onOpenVehicle={onOpenVehicle}
          onOpenBooking={onOpenBooking}
          onClose={onClose}
        />
      );
    }
    return (
      <CompactFleetDrawerVehicleRow
        row={row}
        vehicle={vehicle}
        health={health}
        runtimeState={state}
        locale={locale}
        onOpenVehicle={onOpenVehicle}
        onClose={onClose}
      />
    );
  }

  return (
    <BookingDrawerRowCard
      row={row}
      de={de}
      vehicle={vehicle}
      health={health}
      runtimeState={state}
      onOpenVehicle={onOpenVehicle}
      onOpenBooking={onOpenBooking}
      onClose={onClose}
    />
  );
}

function BusinessRowCard({
  row,
  locale,
  de,
  onOpenInvoice,
  onOpenBilling,
  onClose,
}: {
  row: BusinessPulseRow;
  locale: string;
  de: boolean;
  onOpenInvoice?: (invoiceId: string) => void;
  onOpenBilling?: () => void;
  onClose: () => void;
}) {
  const dueDate = formatDate(row.dueDate, locale);
  const invoiceDate = formatDate(row.invoiceDate, locale);
  const amount = row.amountCents == null ? null : formatDashboardMoney(row.amountCents, row.currency ?? 'EUR', locale);
  const canOpen = Boolean(row.invoiceId && onOpenInvoice) || Boolean(onOpenBilling);

  return (
    <article className="rounded-xl border border-border/50 surface-premium/55 p-3 shadow-sm shadow-black/[0.025] transition-colors hover:border-border/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">{row.title}</h3>
            <StatusChip tone={severityTone(row.severity)} className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide">
              {row.state}
            </StatusChip>
          </div>
          {row.subtitle ? <p className="truncate text-[12px] text-muted-foreground">{row.subtitle}</p> : null}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {invoiceDate ? <span>{de ? 'Rechnung' : 'Invoice'}: {invoiceDate}</span> : null}
            {dueDate ? <span>{de ? 'Fällig' : 'Due'}: {dueDate}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {amount ? <span className="text-[14px] font-semibold tabular-nums text-foreground">{amount}</span> : null}
          {canOpen ? (
            <button
              type="button"
              onClick={() => {
                if (row.invoiceId && onOpenInvoice) onOpenInvoice(row.invoiceId);
                else onOpenBilling?.();
                onClose();
              }}
              className="sq-btn sq-btn-secondary min-h-9 px-2 text-[12px]"
            >
              {row.primaryActionLabel ?? defaultInvoiceCta(de)}
              <Icon name="arrow-right" className="h-4 w-4 opacity-70" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function resolveOperationsFocusedCount(
  slice: DashboardSlice,
  focusedGroupId: TodaysOperationsDrilldownGroupId | null | undefined,
): number | null {
  if (slice.id !== 'active-rented' || !focusedGroupId) return slice.count;
  const counts = resolveTodaysOperationsKpiCounts(slice);
  if (focusedGroupId === 'pickups-today') return counts.pickupsToday;
  if (focusedGroupId === 'returns-today') return counts.returnsToday;
  if (focusedGroupId === 'active-rentals') return counts.activeRentalsCount;
  return slice.count;
}

function operationsDrawerTitle(
  focusedGroupId: TodaysOperationsDrilldownGroupId | null | undefined,
  de: boolean,
): string | null {
  if (focusedGroupId === 'pickups-today') return de ? 'Übergaben' : 'Pickups';
  if (focusedGroupId === 'returns-today') return de ? 'Rückgaben' : 'Returns';
  if (focusedGroupId === 'active-rentals') return de ? 'Aktive Vermietungen' : 'Active rentals';
  return null;
}

function operationsDrawerHint(
  focusedGroupId: TodaysOperationsDrilldownGroupId,
  count: number | null,
  de: boolean,
): string {
  const n = count ?? 0;
  if (focusedGroupId === 'pickups-today') {
    return de ? `${n} Übergabe${n === 1 ? '' : 'n'} heute` : `${n} pickup${n === 1 ? '' : 's'} today`;
  }
  if (focusedGroupId === 'returns-today') {
    return de ? `${n} Rückgabe${n === 1 ? '' : 'n'} heute` : `${n} return${n === 1 ? '' : 's'} today`;
  }
  return de ? `${n} aktive Vermietung${n === 1 ? '' : 'en'}` : `${n} active rental${n === 1 ? '' : 's'}`;
}

function operationsDrawerEmptyCopy(
  focusedGroupId: TodaysOperationsDrilldownGroupId | null | undefined,
  de: boolean,
): { title: string; description: string } {
  if (focusedGroupId === 'pickups-today') {
    return {
      title: de ? 'Keine Übergaben heute' : 'No pickups today',
      description: de
        ? 'Für heute sind keine offenen Übergaben geplant.'
        : 'There are no open pickups scheduled for today.',
    };
  }
  if (focusedGroupId === 'returns-today') {
    return {
      title: de ? 'Keine Rückgaben heute' : 'No returns today',
      description: de
        ? 'Für heute sind keine offenen Rückgaben geplant.'
        : 'There are no open returns scheduled for today.',
    };
  }
  if (focusedGroupId === 'active-rentals') {
    return {
      title: de ? 'Keine aktiven Vermietungen' : 'No active rentals',
      description: de
        ? 'Aktuell sind keine Fahrzeuge aktiv vermietet.'
        : 'No vehicles are currently on active rental.',
    };
  }
  return {
    title: de ? 'Keine Operationen heute' : 'No operations today',
    description: de
      ? 'Keine Übergaben, Rückgaben oder aktiven Vermietungen in diesem Bereich.'
      : 'No pickups, returns, or active rentals in this scope.',
  };
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-10 text-center">
      <div className="sq-tone-success flex h-10 w-10 items-center justify-center rounded-xl">
        <Icon name="check-circle" className="h-5 w-5" />
      </div>
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      <p className="max-w-[280px] text-[12px] text-muted-foreground text-pretty">{description}</p>
    </div>
  );
}

function DashboardGroupList({
  slice,
  focusedGroupId,
  vehicleStates,
  fleetVehicleById,
  fleetHealthById,
  locale,
  de,
  selectedStationName,
  onOpenVehicle,
  onOpenBooking,
  onClose,
}: {
  slice: DashboardSlice;
  focusedGroupId?: TodaysOperationsDrilldownGroupId | null;
  vehicleStates: Map<string, VehicleRuntimeState>;
  fleetVehicleById: Map<string, VehicleData>;
  fleetHealthById: Map<string, VehicleHealthResponse>;
  locale: string;
  de: boolean;
  selectedStationName?: string | null;
  onOpenVehicle?: DashboardViewProps['onOpenVehicleById'];
  onOpenBooking?: DashboardViewProps['onOpenBookingById'];
  onClose: () => void;
}) {
  const isVehicleDrawer = isVehicleDrawerSlice(slice.id);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSearchQuery('');
  }, [slice.id, focusedGroupId]);

  const groups = useMemo(() => {
    const built = buildDashboardGroups(slice, locale, {
      focusedGroupId: slice.id === 'active-rented' ? focusedGroupId ?? undefined : undefined,
    });
    if (slice.id !== 'ready-to-rent') return built;
    return sortReadyToRentDrawerGroupsByLastSignal(built, {
      vehicleStates,
      fleetVehicleById,
    });
  }, [slice, locale, focusedGroupId, vehicleStates, fleetVehicleById]);

  const emptyCopy =
    slice.id === 'active-rented'
      ? operationsDrawerEmptyCopy(focusedGroupId, de)
      : {
          title: isVehicleDrawer ? vehicleDrawerEmptyTitle(slice, de) : emptyTitle(slice, de),
          description: isVehicleDrawer
            ? vehicleDrawerEmptyDescription(slice, de)
            : emptyDescription(slice, de),
        };

  if (groups.length === 0) {
    return <EmptyState title={emptyCopy.title} description={emptyCopy.description} />;
  }

  const filteredGroups = useMemo(() => {
    if (!isVehicleDrawer || !searchQuery.trim()) return groups;
    return filterDashboardDrawerGroups(groups, vehicleStates, searchQuery, locale);
  }, [groups, isVehicleDrawer, searchQuery, vehicleStates, locale]);

  const searchPlaceholder = de ? 'Kennzeichen, Marke, Modell…' : 'Plate, make, model…';
  const stationScopeLabel = drawerStationScopeLabel(selectedStationName, de);

  return (
    <div className="space-y-3">
      {isVehicleDrawer ? (
        <DashboardDrilldownToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          stationScopeLabel={stationScopeLabel}
          searchPlaceholder={searchPlaceholder}
        />
      ) : null}

      {filteredGroups.length === 0 ? (
        <EmptyState
          title={drawerSearchEmptyTitle(de)}
          description={drawerSearchEmptyDescription(de)}
        />
      ) : (
        filteredGroups.map((group, index) => (
          <section
            key={group.id}
            className={dashboardDrilldownSectionClassName(index, isVehicleDrawer)}
          >
            <DashboardDrilldownSectionHeader title={group.title} count={group.count} />
            <div className="space-y-1.5">
              {group.rows.map((row) => (
                <DashboardRowCard
                  key={row.id}
                  row={row}
                  sliceId={slice.id}
                  focusedGroupId={focusedGroupId}
                  state={row.vehicleId ? vehicleStates.get(row.vehicleId) : undefined}
                  vehicle={row.vehicleId ? fleetVehicleById.get(row.vehicleId) : undefined}
                  health={row.vehicleId ? fleetHealthById.get(row.vehicleId) ?? null : null}
                  de={de}
                  onOpenVehicle={onOpenVehicle}
                  onOpenBooking={onOpenBooking}
                  onClose={onClose}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function BusinessGroupList({
  slice,
  locale,
  de,
  onOpenInvoice,
  onOpenBilling,
  onClose,
}: {
  slice: BusinessPulseSlice;
  locale: string;
  de: boolean;
  onOpenInvoice?: (invoiceId: string) => void;
  onOpenBilling?: () => void;
  onClose: () => void;
}) {
  const groups = (slice.groups ?? []).filter((group) => group.rows.length > 0);
  const groupedRowIds = new Set(groups.flatMap((group) => group.rows.map((row) => row.id)));
  const primaryRows = slice.rows.filter((row) => !groupedRowIds.has(row.id));
  const renderGroups = groups.length > 0
    ? groups
    : primaryRows.length > 0
      ? [{ id: `${slice.id}:primary`, title: slice.title, count: primaryRows.length, rows: primaryRows }]
      : [];

  if (renderGroups.length === 0) {
    return (
      <EmptyState
        title={de ? 'Keine Finanzdaten' : 'No financial data'}
        description={de ? 'Für diese Metrik liegen aktuell keine Einträge vor.' : 'No entries are available for this metric right now.'}
      />
    );
  }

  return (
    <div className="space-y-4">
      {renderGroups.map((group) => (
        <section key={group.id} className="space-y-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
            <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {group.count}
            </span>
          </div>
          <div className="space-y-2">
            {group.rows.map((row) => (
              <BusinessRowCard
                key={row.id}
                row={row}
                locale={locale}
                de={de}
                onOpenInvoice={onOpenInvoice}
                onOpenBilling={onOpenBilling}
                onClose={onClose}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DashboardDrilldownDrawer({
  activeTargetId,
  focusedGroupId,
  dashboardRuntime,
  businessPulseSlices,
  loading = false,
  locale,
  selectedStationName,
  onClose,
  onOpenVehicle,
  onOpenBooking,
  onOpenInvoice,
  onOpenBilling,
}: DashboardDrilldownDrawerProps) {
  const de = locale === 'de';
  const { fleetVehicles, healthMap } = useFleetVehicles();
  const fleetVehicleById = useMemo(
    () => new Map(fleetVehicles.map((vehicle) => [vehicle.id, vehicle])),
    [fleetVehicles],
  );
  const dashboardSlice = activeTargetId && isDashboardSliceId(activeTargetId)
    ? dashboardRuntime.slices[activeTargetId]
    : null;
  const businessSlice = activeTargetId && isBusinessMetricId(activeTargetId)
    ? businessPulseSlices?.[activeTargetId] ?? null
    : null;
  const open = Boolean(activeTargetId);
  const operationsTitle =
    dashboardSlice?.id === 'active-rented' && focusedGroupId
      ? operationsDrawerTitle(focusedGroupId, de)
      : null;
  const title = operationsTitle
    ?? (dashboardSlice
      ? sliceDisplayTitle(dashboardSlice, de)
      : businessSlice?.title ?? (de ? 'Details' : 'Details'));
  const count = dashboardSlice
    ? resolveOperationsFocusedCount(dashboardSlice, focusedGroupId)
    : businessSlice?.count ?? null;
  const value =
    businessSlice?.valueCents != null
      ? formatDashboardMoney(businessSlice.valueCents, businessSlice.rows[0]?.currency ?? 'EUR', locale)
      : count == null
        ? '—'
        : String(count);
  const description = dashboardSlice
    ? (
      <div className="space-y-1">
        {dashboardSlice.id === 'ready-to-rent' ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">{readyToRentDrawerHint(dashboardSlice, locale)}</p>
        ) : dashboardSlice.id === 'active-rented' && focusedGroupId ? (
          <div className="space-y-0.5">
            <p className="text-[12px] text-muted-foreground">
              {formatOperationsDrawerDate(locale)}
              {' · '}
              {operationsDrawerStationLabel(selectedStationName, de)}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {operationsDrawerHint(focusedGroupId, count, de)}
            </p>
          </div>
        ) : drawerHeaderHint(dashboardSlice, locale) ? (
          <p className="text-[12px] text-muted-foreground">{drawerHeaderHint(dashboardSlice, locale)}</p>
        ) : null}
      </div>
    )
    : businessSlice
      ? businessSlice.hint ? <p className="text-[12px] text-muted-foreground">{businessSlice.hint}</p> : undefined
      : undefined;

  const handleContentOpenAutoFocus = useCallback(
    (event: Event) => {
      if (!activeTargetId || !isDashboardSliceId(activeTargetId)) return;
      if (!isVehicleDrawerSlice(activeTargetId)) return;
      event.preventDefault();
      const content = event.currentTarget as HTMLElement;
      const title = content.querySelector('[data-slot="sheet-title"]');
      if (title instanceof HTMLElement) {
        title.tabIndex = -1;
        title.focus({ preventScroll: true });
      }
    },
    [activeTargetId],
  );

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onContentOpenAutoFocus={handleContentOpenAutoFocus}
      eyebrow={dashboardSlice ? operativeEyebrow(dashboardSlice.id, de) : businessSlice ? (de ? 'Finanzen' : 'Financial') : undefined}
      title={title}
      description={description}
      status={
        activeTargetId ? (
          <StatusChip tone="info" className="shrink-0">
            <span className="tabular-nums">{value}</span>
          </StatusChip>
        ) : undefined
      }
      widthClassName="sm:max-w-xl"
      closeLabel={de ? 'Schließen' : 'Close'}
      footer={
        businessSlice && onOpenBilling ? (
          <button
            type="button"
            className="sq-btn sq-btn-primary min-h-10 text-[12px]"
            onClick={() => {
              onOpenBilling();
              onClose();
            }}
          >
            {de ? 'Abrechnung öffnen' : 'Open billing'}
            <Icon name="arrow-right" className="h-4 w-4" />
          </button>
        ) : undefined
      }
    >
      {!activeTargetId ? null : loading ? (
        <div aria-busy className="py-2">
          <SkeletonRows rows={4} />
        </div>
      ) : dashboardSlice ? (
        <DashboardGroupList
          slice={dashboardSlice}
          focusedGroupId={focusedGroupId}
          vehicleStates={vehicleStatesById(dashboardRuntime.vehicleStates)}
          fleetVehicleById={fleetVehicleById}
          fleetHealthById={healthMap}
          locale={locale}
          de={de}
          selectedStationName={selectedStationName}
          onOpenVehicle={onOpenVehicle}
          onOpenBooking={onOpenBooking}
          onClose={onClose}
        />
      ) : businessSlice ? (
        <BusinessGroupList
          slice={businessSlice}
          locale={locale}
          de={de}
          onOpenInvoice={onOpenInvoice}
          onOpenBilling={onOpenBilling}
          onClose={onClose}
        />
      ) : (
        <EmptyState
          title={de ? 'Keine Daten' : 'No data'}
          description={de ? 'Für dieses Ziel liegt aktuell kein Slice vor.' : 'No slice is available for this target right now.'}
        />
      )}
    </DetailDrawer>
  );
}
