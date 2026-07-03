import { Icon } from '../ui/Icon';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  dedupeDisplayReasons,
  formatRuntimeReasonLabel,
  runtimeReasonTooltip,
} from './reasonDisplay';
import { buildDashboardGroups } from './dashboardDrilldownGroups';
import {
  composeBookingDrawerRowDisplay,
  composeVehicleDrawerRowDisplay,
  readyToRentDrawerHint,
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

function chipToneClass(tone: 'success' | 'watch' | 'critical' | 'neutral'): string {
  if (tone === 'critical') return 'sq-tone-critical';
  if (tone === 'watch') return 'sq-tone-watch';
  if (tone === 'success') return 'sq-tone-success';
  return 'bg-muted text-muted-foreground';
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

function sourceLabel(kind: 'runtime' | 'business', de: boolean): string {
  if (kind === 'business') return de ? 'Quelle: Business Pulse · Rechnungen' : 'Source: Business Pulse · Invoices';
  return de ? 'Quelle: Runtime State · Fleet · Rental Health' : 'Source: Runtime State · Fleet · Rental Health';
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

function VehicleDrawerRowCard({
  row,
  state,
  locale,
  de,
  showReadiness,
  onOpenVehicle,
  onClose,
}: {
  row: DashboardSliceRow;
  state?: VehicleRuntimeState;
  locale: string;
  de: boolean;
  showReadiness: boolean;
  onOpenVehicle?: DashboardViewProps['onOpenVehicleById'];
  onClose: () => void;
}) {
  const display = composeVehicleDrawerRowDisplay(row, state, locale, { showReadiness });
  const canOpen = Boolean(row.vehicleId && onOpenVehicle);
  const ctaLabel = row.primaryActionLabel ?? defaultVehicleCta(de);
  const extraReasons = row.reasons ? dedupeDisplayReasons(row.reasons).slice(1, 3) : [];

  return (
    <article className="rounded-lg border border-border/45 bg-card/45 px-2.5 py-2 shadow-sm shadow-black/[0.02] transition-colors hover:border-border/65 hover:bg-muted/10">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
              {display.title}
            </span>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {display.healthLabel ? (
                <StatusChip tone={display.healthTone} className="px-1.5 py-0.5 text-[9.5px] font-semibold">
                  {display.healthLabel}
                </StatusChip>
              ) : null}
              {display.readinessLabel ? (
                <StatusChip tone={display.readinessTone} className="px-1.5 py-0.5 text-[9.5px] font-semibold">
                  {display.readinessLabel}
                </StatusChip>
              ) : null}
            </div>
          </div>

          {display.subtitle ? (
            <p className="truncate text-[10.5px] leading-snug text-muted-foreground">{display.subtitle}</p>
          ) : null}

          {display.locationLine ? (
            <p className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
              <Icon name="map-pin" className="h-3 w-3 shrink-0 text-muted-foreground/80" />
              <span className="truncate">{display.locationLine}</span>
            </p>
          ) : null}

          {display.primaryReason ? (
            <p className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground/95 text-pretty">
              {display.primaryReason}
            </p>
          ) : null}

          {display.extraReasonCount > 0 ? (
            <div className="flex flex-wrap gap-1">
              {extraReasons.map((reason) => (
                <span
                  key={reason.id}
                  title={runtimeReasonTooltip(reason, locale)}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    chipToneClass(
                      reason.severity === 'critical'
                        ? 'critical'
                        : reason.severity === 'warning'
                          ? 'watch'
                          : 'neutral',
                    ),
                  )}
                >
                  {formatRuntimeReasonLabel(reason, locale)}
                </span>
              ))}
              {display.extraReasonCount > extraReasons.length ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {reasonsLabel(display.extraReasonCount - extraReasons.length, de)}
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
              onClose();
            }}
            className="sq-btn sq-btn-secondary min-h-9 shrink-0 self-start px-2 text-[11px]"
          >
            {ctaLabel}
            <Icon name="arrow-right" className="h-3.5 w-3.5 opacity-70" />
          </button>
        ) : null}
      </div>
    </article>
  );
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
  de,
  onOpenVehicle,
  onOpenBooking,
  onClose,
}: {
  row: DashboardSliceRow;
  sliceId: DashboardSliceId;
  state?: VehicleRuntimeState;
  de: boolean;
  onOpenVehicle?: DashboardViewProps['onOpenVehicleById'];
  onOpenBooking?: DashboardViewProps['onOpenBookingById'];
  onClose: () => void;
}) {
  const locale = de ? 'de' : 'en';
  if (row.vehicleId && !row.bookingId) {
    return (
      <VehicleDrawerRowCard
        row={row}
        state={state}
        locale={locale}
        de={de}
        showReadiness={sliceId === 'ready-to-rent'}
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

function DashboardGroupList({
  slice,
  vehicleStates,
  locale,
  de,
  onOpenVehicle,
  onOpenBooking,
  onClose,
}: {
  slice: DashboardSlice;
  vehicleStates: Map<string, VehicleRuntimeState>;
  locale: string;
  de: boolean;
  onOpenVehicle?: DashboardViewProps['onOpenVehicleById'];
  onOpenBooking?: DashboardViewProps['onOpenBookingById'];
  onClose: () => void;
}) {
  const groups = buildDashboardGroups(slice, locale);
  if (groups.length === 0) {
    return (
      <EmptyState
        title={emptyTitle(slice, de)}
        description={emptyDescription(slice, de)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.id} className="space-y-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
            <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {group.count}
            </span>
          </div>
          <div className="space-y-2">
            {group.rows.map((row) => (
              <DashboardRowCard
                key={row.id}
                row={row}
                sliceId={slice.id}
                state={row.vehicleId ? vehicleStates.get(row.vehicleId) : undefined}
                de={de}
                onOpenVehicle={onOpenVehicle}
                onOpenBooking={onOpenBooking}
                onClose={onClose}
              />
            ))}
          </div>
        </section>
      ))}
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

export function DashboardDrilldownDrawer({
  activeTargetId,
  dashboardRuntime,
  businessPulseSlices,
  loading = false,
  locale,
  onClose,
  onOpenVehicle,
  onOpenBooking,
  onOpenInvoice,
  onOpenBilling,
}: DashboardDrilldownDrawerProps) {
  const de = locale === 'de';
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
          <p className="text-[12px] text-muted-foreground">{readyToRentDrawerHint(dashboardSlice, locale)}</p>
        ) : drawerHeaderHint(dashboardSlice, locale) ? (
          <p className="text-[12px] text-muted-foreground">{drawerHeaderHint(dashboardSlice, locale)}</p>
        ) : null}
      </div>
    )
    : businessSlice
      ? (
        <div className="space-y-1">
          {businessSlice.hint ? <p>{businessSlice.hint}</p> : null}
          <p className="text-[10px] text-muted-foreground/60">{sourceLabel('business', de)}</p>
        </div>
      )
      : undefined;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
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
          locale={locale}
          de={de}
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
