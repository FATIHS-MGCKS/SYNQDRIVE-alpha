import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  dedupeDisplayReasons,
  formatRuntimeReasonLabel,
  rowSeverityLabel,
  runtimeReasonTooltip,
} from './reasonDisplay';
import { sanitizeUserFacingIssueText } from '../../lib/operational-issues';
import type {
  DashboardSliceRow,
  VehicleRuntimeState,
} from './runtime';

interface FleetBoardVehicleRowProps {
  row: DashboardSliceRow;
  runtimeState?: VehicleRuntimeState;
  locale: string;
  onOpen?: () => void;
}

function severityChipTone(severity: DashboardSliceRow['severity']) {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'watch';
  if (severity === 'success') return 'success';
  if (severity === 'info') return 'info';
  return 'neutral';
}

function telemetryLabel(state: VehicleRuntimeState | undefined, de: boolean): string | null {
  if (!state) return null;
  const labels: Record<VehicleRuntimeState['telemetryState'], [string, string]> = {
    live: ['Live', 'Live'],
    standby: ['Standby', 'Standby'],
    soft_offline: ['Soft Offline', 'Soft Offline'],
    offline: ['Offline', 'Offline'],
    unknown: ['Unknown', 'Unbekannt'],
  };
  return de ? labels[state.telemetryState][1] : labels[state.telemetryState][0];
}

function runtimeStateLabel(state: VehicleRuntimeState | undefined, de: boolean): string | null {
  if (!state) return null;
  const readiness: Record<VehicleRuntimeState['rentalReadiness'], [string, string]> = {
    ready: ['Ready to rent', 'Mietbereit'],
    not_ready: ['Not ready', 'Nicht bereit'],
    blocked: ['Blocked', 'Blockiert'],
  };
  const operational: Record<VehicleRuntimeState['operationalStatus'], [string, string]> = {
    available: ['Available', 'Verfügbar'],
    reserved: ['Reserved', 'Reserviert'],
    active_rented: ['Active rented', 'Aktiv vermietet'],
    maintenance: ['Maintenance', 'Wartung'],
    unavailable: ['Unavailable', 'Nicht verfügbar'],
    unknown: ['Unknown', 'Unbekannt'],
  };
  const rental = de ? readiness[state.rentalReadiness][1] : readiness[state.rentalReadiness][0];
  const ops = de ? operational[state.operationalStatus][1] : operational[state.operationalStatus][0];
  return `${ops} · ${rental}`;
}

function moreReasonsLabel(count: number, de: boolean): string {
  return de ? `+${count} Gründe` : `+${count} reasons`;
}

/**
 * @deprecated Only consumed by the deprecated FleetStateBoard. The Dashboard
 * Fahrzeugliste is now rendered by FleetCommandPanel/FleetOperatorRow (shared
 * with the Fleet Page). Kept for reference/backward-compat only.
 */
export function FleetBoardVehicleRow({ row, runtimeState, locale, onOpen }: FleetBoardVehicleRowProps) {
  const de = locale === 'de';
  const dimmed = runtimeState?.telemetryState === 'offline';
  const telemetry = telemetryLabel(runtimeState, de);
  const stateLabel = runtimeStateLabel(runtimeState, de);
  const severityText = rowSeverityLabel(row.severity, locale);
  const title = sanitizeUserFacingIssueText(row.title) || row.title;
  const subtitle = sanitizeUserFacingIssueText(row.subtitle);
  const meta = sanitizeUserFacingIssueText(row.meta);
  const rawReasons = row.reasons?.length ? row.reasons : [
    ...(runtimeState?.criticalReasons ?? []),
    ...(runtimeState?.blockReasons ?? []),
    ...(runtimeState?.warningReasons ?? []),
  ];
  const reasons = dedupeDisplayReasons(rawReasons);
  const visibleReasons = reasons.slice(0, 2);
  const remainingReasons = Math.max(0, reasons.length - visibleReasons.length);
  const canOpen = Boolean(onOpen && row.vehicleId);

  const tint =
    row.severity === 'critical'
      ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_5%,transparent)]'
      : row.severity === 'warning'
        ? 'bg-[color:color-mix(in_srgb,var(--status-watch)_4%,transparent)]'
        : '';

  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-xl border border-border/45 px-3 py-2.5 transition-colors hover:border-border/70 hover:bg-muted/15',
        tint,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={!canOpen}
        className={cn('min-w-0 flex-1 space-y-1.5 text-left', dimmed && 'opacity-75', !canOpen && 'cursor-default')}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
              {title}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block truncate text-[10.5px] leading-snug text-muted-foreground">{subtitle}</span>
            ) : null}
          </div>
          {severityText ? (
            <StatusChip
              tone={severityChipTone(row.severity)}
              className="shrink-0 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
            >
              {severityText}
            </StatusChip>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug text-muted-foreground">
          {row.stationLabel ? (
            <span className="truncate">{row.stationLabel}</span>
          ) : (
            <span className="italic">{de ? 'Keine Station' : 'No station'}</span>
          )}
          {stateLabel ? (
            <>
              <span aria-hidden>·</span>
              <span>{stateLabel}</span>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
          {telemetry ? (
            <>
              <Icon name="radio" className="h-3 w-3 opacity-60" />
              <span className={cn(runtimeState?.telemetryState === 'offline' && 'text-[color:var(--status-critical)]')}>
                {telemetry}
              </span>
            </>
          ) : null}
          {meta ? (
            <>
              {telemetry ? <span aria-hidden>·</span> : null}
              <span className="line-clamp-1">{meta}</span>
            </>
          ) : null}
        </div>

        {visibleReasons.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleReasons.map((reason) => (
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
            {remainingReasons > 0 ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {moreReasonsLabel(remainingReasons, de)}
              </span>
            ) : null}
          </div>
        ) : null}
      </button>

      {canOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={de ? `Fahrzeug ${row.title} öffnen` : `Open vehicle ${row.title}`}
          className="sq-press inline-flex min-h-9 shrink-0 items-center gap-1 self-center rounded-md px-2 text-[10.5px] font-medium text-muted-foreground opacity-90 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {row.primaryActionLabel ?? (de ? 'Öffnen' : 'Open')}
          <Icon name="arrow-right" className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
