import { useState } from 'react';
import tellTaleOilIcon from '../../assets/icons/telltale/oil.svg';
import tellTaleCelIcon from '../../assets/icons/telltale/cel.svg';
import tellTaleBrakePadIcon from '../../assets/icons/telltale/brake-pad.svg';
import tellTaleTirePressureIcon from '../../assets/icons/telltale/tire-pressure.svg';
import tellTaleBatteryIcon from '../../assets/icons/telltale/battery.svg';
import type {
  DashboardWarningLightsResponse,
  OilLevelDisplay,
} from '../../lib/api';
import { Icon } from './ui/Icon';
import { StatusChip, SkeletonCard } from '../../components/patterns';
import {
  DASHBOARD_TELLTALE_KEYS,
  formatRelativeObservedAt,
  resolveTelltalePanelPresentation,
  telltaleShortLabel,
  telltaleTileStatusLabel,
  telltaleToneFromLight,
  type TelltaleTone,
} from '../lib/dashboard-warning-lights-display';
import { DashboardWarningLightsDetailDrawer } from './health/DashboardWarningLightsDetailDrawer';

export interface DashboardWarningLightsPanelProps {
  telltales?: DashboardWarningLightsResponse | null;
  loading?: boolean;
  oilLevelDisplay?: OilLevelDisplay | null;
  syncErrorMessage?: string | null;
  className?: string;
  vehicleId?: string;
  onOpenBooking?: (bookingId: string) => void;
  onOpenTrips?: (dateIso?: string) => void;
}

function iconForKey(key: string): string {
  if (key === 'engine_oil_level') return tellTaleOilIcon;
  if (key === 'engine_limp_mode' || key === 'check_engine_light') return tellTaleCelIcon;
  if (key === 'brake_lining_wear_pre_warning') return tellTaleBrakePadIcon;
  if (key === 'tire_pressure_warning') return tellTaleTirePressureIcon;
  if (key === 'battery_warning_light') return tellTaleBatteryIcon;
  return tellTaleCelIcon;
}

function tileIconBg(tone: TelltaleTone, disabled: boolean): string {
  if (disabled) return 'bg-muted/30 ring-1 ring-border';
  if (tone === 'critical') return 'sq-tone-critical ring-1 ring-border';
  if (tone === 'alert') return 'sq-tone-watch ring-1 ring-border';
  if (tone === 'ok') return 'sq-tone-success ring-1 ring-border';
  return 'bg-muted/40 ring-1 ring-border';
}

function tileBorderClass(tone: TelltaleTone, disabled: boolean): string {
  if (disabled) return 'border-border/50 bg-muted/10 opacity-60';
  if (tone === 'critical') return 'border-red-500/25 bg-red-500/[0.04]';
  if (tone === 'alert') return 'border-amber-500/25 bg-amber-500/[0.04]';
  if (tone === 'ok') return 'border-border/60 bg-card/50';
  return 'border-border/60 bg-card/40';
}

function statusTextClass(tone: TelltaleTone, disabled: boolean): string {
  if (disabled) return 'text-muted-foreground/60';
  if (tone === 'critical') return 'text-[color:var(--status-critical)] font-semibold';
  if (tone === 'alert') return 'text-[color:var(--status-watch)] font-semibold';
  if (tone === 'ok') return 'text-muted-foreground';
  return 'text-muted-foreground/70';
}

export function DashboardWarningLightsPanel({
  telltales,
  loading = false,
  oilLevelDisplay: _oilLevelDisplay,
  syncErrorMessage,
  className = '',
  vehicleId,
  onOpenBooking,
  onOpenTrips,
}: DashboardWarningLightsPanelProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  if (loading && !telltales) {
    return <SkeletonCard className={`h-56 rounded-xl ${className}`} />;
  }

  const presentation = resolveTelltalePanelPresentation(telltales);
  const envelopeFreshness = telltales?.freshness;
  const lastUpdateRel = formatRelativeObservedAt(telltales?.lastObservedAt ?? null);
  const disabled = !presentation.isConnected;

  const tiles = DASHBOARD_TELLTALE_KEYS.map((key) => {
    const light = telltales?.lights.find((l) => l.key === key);
    const tone: TelltaleTone = disabled || !light ? 'neutral' : telltaleToneFromLight(light);
    const statusLabel = telltaleTileStatusLabel(light, presentation.isConnected, envelopeFreshness);
    return {
      key,
      label: telltaleShortLabel(key),
      tone,
      statusLabel,
      icon: iconForKey(key),
      ariaLabel: `${telltaleShortLabel(key)}: ${statusLabel}`,
    };
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className={`w-full text-left rounded-xl border border-border/60 bg-card shadow-sm p-4 sm:p-5 pb-6 transition-colors hover:bg-card/90 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer ${className}`}
        aria-labelledby="tacho-warnleuchten-title"
        aria-describedby="tacho-warnleuchten-summary"
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="sq-tone-brand p-2 rounded-xl shrink-0">
              <Icon name="alert-triangle" className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  id="tacho-warnleuchten-title"
                  className="text-[11px] font-semibold tracking-tight text-foreground"
                >
                  Tacho Warnleuchten
                </h3>
                <StatusChip tone={presentation.badgeTone} dot>
                  {presentation.badgeLabel}
                </StatusChip>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-muted-foreground/80">{presentation.sourceFooter}</span>
            <Icon name="chevron-right" className="w-3.5 h-3.5 text-muted-foreground/70" aria-hidden />
          </div>
        </div>

        {/* Subline */}
        <p
          id="tacho-warnleuchten-summary"
          className="text-[11px] leading-relaxed text-muted-foreground mb-4"
        >
          {syncErrorMessage && presentation.badgeLabel === 'Unbekannt'
            ? 'Warnleuchtenstatus aktuell nicht verfügbar.'
            : presentation.summaryText}
        </p>

        {/* Tile grid — 2 cols mobile, up to 5 on wide screens */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5 pointer-events-none">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 min-h-[88px] ${tileBorderClass(tile.tone, disabled)}`}
              aria-hidden="true"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tileIconBg(tile.tone, disabled)}`}
              >
                <img
                  src={tile.icon}
                  alt=""
                  aria-hidden="true"
                  className={`w-4 h-4 object-contain ${
                    disabled
                      ? 'opacity-30 grayscale'
                      : tile.tone === 'alert' || tile.tone === 'critical'
                        ? 'opacity-100'
                        : tile.tone === 'ok'
                          ? 'opacity-50 grayscale'
                          : 'opacity-40 grayscale'
                  }`}
                />
              </div>
              <span className="text-[10px] font-semibold text-foreground text-center leading-tight">
                {tile.label}
              </span>
              <span
                className={`text-[9px] tabular-nums text-center ${statusTextClass(tile.tone, disabled)}`}
              >
                {tile.statusLabel === '—' ? '\u00A0' : tile.statusLabel}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
          {presentation.activeCount > 0 ? (
            <span className="font-medium text-[color:var(--status-watch)]">
              {presentation.activeCount} aktive Warnleuchte{presentation.activeCount === 1 ? '' : 'n'}
            </span>
          ) : presentation.historicalCount > 0 ? (
            <span className="text-muted-foreground">
              {presentation.historicalCount} historische Meldung
              {presentation.historicalCount === 1 ? '' : 'en'}
            </span>
          ) : (
            <span>
              {presentation.badgeLabel === 'Nicht verbunden'
                ? 'Warnleuchten können nicht angezeigt werden.'
                : presentation.badgeLabel === 'Alles klar'
                  ? 'Alle überwachten Warnleuchten inaktiv.'
                  : null}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            {lastUpdateRel && presentation.isConnected && (
              <span className="text-[9px] tabular-nums">{lastUpdateRel}</span>
            )}
            <span className="text-[9px] font-medium text-[color:var(--brand)]">Details</span>
          </span>
        </div>
      </button>

      <DashboardWarningLightsDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        telltales={telltales}
        vehicleId={vehicleId}
        onOpenBooking={onOpenBooking}
        onOpenTrips={onOpenTrips}
      />
    </>
  );
}
