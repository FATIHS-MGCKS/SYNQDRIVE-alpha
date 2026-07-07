import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { useFleetVehicles } from '../../FleetContext';
import { CompactFleetDrawerVehicleRow } from './CompactFleetDrawerVehicleRow';
import {
  dedupeDisplayReasons,
  formatRuntimeReasonLabel,
  runtimeReasonTooltip,
} from './reasonDisplay';
import { buildDashboardGroups } from './dashboardDrilldownGroups';
import {
  composeBookingDrawerRowDisplay,
  filterReadyToRentDrawerGroups,
  readyToRentDrawerHint,
  sortReadyToRentDrawerGroupsByLastSignal,
} from './dashboardDrilldownRowDisplay';
import { drawerHeaderHint } from './dashboardDrawerNormalize';
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

interface DashboardDrilldownDrawerProps {
  activeTargetId: DashboardSliceId | BusinessMetricId | null;
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

function formatMoney(cents: number, currency: string | undefined, locale: string): string {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
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
  return de ? 'Buchung öffnen' : 'Open booking';
}

function defaultInvoiceCta(de: boolean): string {
  return de ? 'Rechnung öffnen' : 'Open invoice';
}

function operativeEyebrow(sliceId: DashboardSliceId, de: boolean): string {
  if (sliceId === 'ready-to-rent') return de ? 'Mietbereitschaft' : 'Rental readiness';
  if (sliceId === 'critical-alerts') return de ? 'Alerts & Probleme' : 'Alerts & issues';
  if (sliceId === 'due-soon') return de ? 'Timeline' : 'Timeline';
  if (sliceId === 'overdue-returns') return de ? 'Rückgaben' : 'Returns';
  if (sliceId === 'overdue-pickups') return de ? 'Übergaben' : 'Pickups';
  return de ? 'Operativ' : 'Operations';
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
  onOpenVehicle,
  onOpenBooking,
  onClose,
}: {
  row: DashboardSliceRow;
  de: boolean;
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
  const severityText =
    row.severity === 'critical'
      ? de ? 'Kritisch' : 'Critical'
      : row.severity === 'warning'
        ? de ? 'Warnung' : 'Warning'
        : row.severity === 'success'
          ? de ? 'Bereit' : 'Ready'
          : null;
  const canOpenVehicle = Boolean(row.vehicleId && onOpenVehicle);
  const canOpenBooking = Boolean(row.bookingId && onOpenBooking);
  const ctaLabel = row.primaryActionLabel ?? (row.bookingId ? defaultBookingCta(de) : defaultVehicleCta(de));
  const canOpen = canOpenVehicle || canOpenBooking;

  return (
    <article className="rounded-lg border border-border/45 bg-card/45 px-2.5 py-2 shadow-sm shadow-black/[0.02] transition-colors hover:border-border/65 hover:bg-muted/10">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[12px] font-semibold tracking-[-0.01em] text-foreground">
              {display.title}
            </h3>
            {severityText ? (
              <StatusChip
                tone={severityTone(row.severity)}
                className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
              >
                {severityText}
              </StatusChip>
            ) : null}
          </div>
          {display.subtitle ? (
            <p className="truncate text-[10.5px] text-muted-foreground">{display.subtitle}</p>
          ) : null}
          {showStation ? (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Icon name="map-pin" className="h-3 w-3 shrink-0" />
              <span className="truncate">{row.stationLabel}</span>
            </p>
          ) : null}
          {showMeta ? (
            <p className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground/90 text-pretty">{display.meta}</p>
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
        {canOpen ? (
          <button
            type="button"
            onClick={() => {
              if (row.vehicleId && onOpenVehicle) onOpenVehicle(row.vehicleId);
              else if (row.bookingId && onOpenBooking) onOpenBooking(row.bookingId);
              onClose();
            }}
            className="sq-btn sq-btn-secondary min-h-9 shrink-0 px-2 text-[11px]"
          >
            {ctaLabel}
            <Icon name="arrow-right" className="h-3.5 w-3.5 opacity-70" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function DashboardRowCard({
  row,
  sliceId,
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
  const amount = row.amountCents == null ? null : formatMoney(row.amountCents, row.currency, locale);
  const canOpen = Boolean(row.invoiceId && onOpenInvoice) || Boolean(onOpenBilling);

  return (
    <article className="rounded-xl border border-border/50 bg-card/55 p-3 shadow-sm shadow-black/[0.025] transition-colors hover:border-border/70">
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

function readyToRentStationScopeLabel(
  selectedStationName: string | null | undefined,
  de: boolean,
): string {
  if (selectedStationName?.trim()) {
    return de ? `Station: ${selectedStationName.trim()}` : `Station: ${selectedStationName.trim()}`;
  }
  return de ? 'Alle Standorte' : 'All Stations';
}

function ReadyToRentDrawerToolbar({
  searchQuery,
  onSearchChange,
  stationScopeLabel,
  searchPlaceholder,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  stationScopeLabel: string;
  searchPlaceholder: string;
}) {
  return (
    <div className="mb-1 space-y-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 dark:bg-muted/10">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon name="map-pin" className="h-3 w-3 shrink-0 text-muted-foreground/80" />
        <span className="sq-section-label truncate normal-case tracking-wide">{stationScopeLabel}</span>
      </div>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="w-full min-w-0 rounded-xl border border-border/55 bg-background/60 py-2 pl-8 pr-3 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)] dark:bg-card/50"
        />
      </div>
    </div>
  );
}

function DashboardGroupList({
  slice,
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
  const isReadyToRent = slice.id === 'ready-to-rent';
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSearchQuery('');
  }, [slice.id]);

  const groups = useMemo(() => {
    const built = buildDashboardGroups(slice, locale);
    if (!isReadyToRent) return built;
    return sortReadyToRentDrawerGroupsByLastSignal(built, {
      vehicleStates,
      fleetVehicleById,
    });
  }, [slice, locale, isReadyToRent, vehicleStates, fleetVehicleById]);
  const filteredGroups = useMemo(() => {
    if (!isReadyToRent || !searchQuery.trim()) return groups;
    return filterReadyToRentDrawerGroups(groups, vehicleStates, searchQuery);
  }, [groups, isReadyToRent, searchQuery, vehicleStates]);

  const searchPlaceholder = de ? 'Kennzeichen, Marke, Modell…' : 'Plate, make, model…';
  const stationScopeLabel = readyToRentStationScopeLabel(selectedStationName, de);

  if (groups.length === 0) {
    return (
      <EmptyState
        title={emptyTitle(slice, de)}
        description={emptyDescription(slice, de)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {isReadyToRent ? (
        <ReadyToRentDrawerToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          stationScopeLabel={stationScopeLabel}
          searchPlaceholder={searchPlaceholder}
        />
      ) : null}

      {filteredGroups.length === 0 ? (
        <EmptyState
          title={de ? 'Keine Treffer' : 'No matches'}
          description={
            de
              ? 'Passe die Suche an oder wähle eine andere Station.'
              : 'Adjust your search or try a different station.'
          }
        />
      ) : (
        filteredGroups.map((group, index) => (
          <section
            key={group.id}
            className={cn('space-y-2', isReadyToRent && index > 0 && 'border-t border-border/40 pt-3')}
          >
            <div className="flex items-center justify-between gap-3 px-0.5">
              <p className="sq-section-label normal-case tracking-wide">{group.title}</p>
              <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {group.count}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.rows.map((row) => (
                <DashboardRowCard
                  key={row.id}
                  row={row}
                  sliceId={slice.id}
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
  const title = dashboardSlice
    ? sliceDisplayTitle(dashboardSlice, de)
    : businessSlice?.title ?? (de ? 'Details' : 'Details');
  const count = dashboardSlice?.count ?? businessSlice?.count ?? null;
  const value =
    businessSlice?.valueCents != null
      ? formatMoney(businessSlice.valueCents, businessSlice.rows[0]?.currency, locale)
      : count == null
        ? '—'
        : String(count);
  const description = dashboardSlice
    ? (
      <div className="space-y-1">
        {dashboardSlice.id === 'ready-to-rent' ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">{readyToRentDrawerHint(dashboardSlice, locale)}</p>
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
      if (activeTargetId !== 'ready-to-rent') return;
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
