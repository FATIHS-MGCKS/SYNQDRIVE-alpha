import { Icon } from '../ui/Icon';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { DashboardViewModel, DashboardViewProps } from './dashboardTypes';
import type {
  BusinessMetricId,
  BusinessPulseRow,
  BusinessPulseSlice,
  DashboardRuntimeModel,
  DashboardSlice,
  DashboardSliceId,
  DashboardSliceRow,
  RuntimeReason,
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

function reasonLabel(reason: RuntimeReason): string {
  return reason.source ? `${reason.title} · ${reason.source}` : reason.title;
}

function reasonsLabel(count: number, de: boolean): string {
  return de ? `+${count} Gründe` : `+${count} reasons`;
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
  if (sliceId === 'critical-alerts') return de ? 'Alerts & Probleme' : 'Alerts & issues';
  if (sliceId === 'due-soon') return de ? 'Timeline' : 'Timeline';
  if (sliceId === 'overdue-returns') return de ? 'Rückgaben' : 'Returns';
  return de ? 'Operative Runtime' : 'Operational runtime';
}

function emptyTitle(slice: DashboardSlice, de: boolean): string {
  return slice.emptyTitle ?? (de ? 'Keine Fahrzeuge' : 'No vehicles');
}

function emptyDescription(slice: DashboardSlice, de: boolean): string {
  return slice.emptyDescription ?? (de ? 'Aktuell keine Einträge in diesem Bereich.' : 'No items in this area right now.');
}

function buildDashboardGroups(slice: DashboardSlice, de: boolean) {
  const groups = (slice.groups ?? []).filter((group) => group.rows.length > 0);
  const groupedRowIds = new Set(groups.flatMap((group) => group.rows.map((row) => row.id)));
  const primaryRows = slice.rows.filter((row) => !groupedRowIds.has(row.id));
  const fallbackGroups = groups.length > 0
    ? groups
    : primaryRows.length > 0
      ? [{ id: `${slice.id}:primary`, title: slice.title, count: primaryRows.length, rows: primaryRows }]
      : [];

  if (!slice.secondaryRows?.length) return fallbackGroups;

  const secondaryTitle =
    slice.id === 'ready-to-rent'
      ? de
        ? 'Verfügbar, aber nicht bereit'
        : 'Available but not ready'
      : de
        ? 'Weitere Einträge'
        : 'Additional items';

  return [
    ...fallbackGroups,
    {
      id: `${slice.id}:secondary`,
      title: secondaryTitle,
      count: slice.secondaryRows.length,
      rows: slice.secondaryRows,
    },
  ];
}

function DashboardRowCard({
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
  const reasons = row.reasons ?? [];
  const visibleReasons = reasons.slice(0, 2);
  const remainingReasons = Math.max(0, reasons.length - visibleReasons.length);
  const canOpenVehicle = Boolean(row.vehicleId && onOpenVehicle);
  const canOpenBooking = Boolean(row.bookingId && onOpenBooking);
  const ctaLabel = row.primaryActionLabel ?? (row.bookingId ? defaultBookingCta(de) : defaultVehicleCta(de));
  const canOpen = canOpenVehicle || canOpenBooking;

  return (
    <article className="rounded-xl border border-border/50 bg-card/55 p-3 shadow-sm shadow-black/[0.025] transition-colors hover:border-border/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">
              {row.title}
            </h3>
            <StatusChip tone={severityTone(row.severity)} className="px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide">
              {row.severity}
            </StatusChip>
          </div>
          {row.subtitle ? (
            <p className="truncate text-[12px] text-muted-foreground">{row.subtitle}</p>
          ) : null}
          {row.meta ? (
            <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground/90 text-pretty">{row.meta}</p>
          ) : null}
          {row.stationLabel ? (
            <p className="inline-flex items-center gap-1 rounded-md bg-muted/45 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
              <Icon name="map-pin" className="h-3 w-3" />
              {row.stationLabel}
            </p>
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
            className="sq-btn sq-btn-secondary min-h-10 shrink-0 px-2 text-[12px]"
          >
            {ctaLabel}
            <Icon name="arrow-right" className="h-4 w-4 opacity-70" />
          </button>
        ) : null}
      </div>
      {reasons.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleReasons.map((reason) => (
            <span
              key={reason.id}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                reason.severity === 'critical'
                  ? 'bg-[color:var(--status-critical)]/10 text-[color:var(--status-critical)]'
                  : reason.severity === 'warning'
                    ? 'bg-[color:var(--status-watch)]/10 text-[color:var(--status-watch)]'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {reasonLabel(reason)}
            </span>
          ))}
          {remainingReasons > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {reasonsLabel(remainingReasons, de)}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
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
  de,
  onOpenVehicle,
  onOpenBooking,
  onClose,
}: {
  slice: DashboardSlice;
  de: boolean;
  onOpenVehicle?: DashboardViewProps['onOpenVehicleById'];
  onOpenBooking?: DashboardViewProps['onOpenBookingById'];
  onClose: () => void;
}) {
  const groups = buildDashboardGroups(slice, de);
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
  const title = dashboardSlice?.title ?? businessSlice?.title ?? (de ? 'Details' : 'Details');
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
        {dashboardSlice.description ? <p>{dashboardSlice.description}</p> : null}
        {dashboardSlice.hint ? <p>{dashboardSlice.hint}</p> : null}
        <p className="text-[11px] text-muted-foreground/80">{sourceLabel('runtime', de)}</p>
      </div>
    )
    : businessSlice
      ? (
        <div className="space-y-1">
          {businessSlice.hint ? <p>{businessSlice.hint}</p> : null}
          <p className="text-[11px] text-muted-foreground/80">{sourceLabel('business', de)}</p>
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
