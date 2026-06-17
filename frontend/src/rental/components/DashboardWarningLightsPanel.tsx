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
  formatObservedAtAbsolute,
  formatRelativeObservedAt,
  resolveTelltalePanelPresentation,
  shouldShowOilLevelBar,
  sortDashboardLights,
  telltaleRowPrimaryText,
  telltaleRowSecondaryText,
  telltaleToneFromLight,
  type TelltaleTone,
} from '../lib/dashboard-warning-lights-display';

export interface DashboardWarningLightsPanelProps {
  telltales?: DashboardWarningLightsResponse | null;
  loading?: boolean;
  oilLevelDisplay?: OilLevelDisplay | null;
  syncErrorMessage?: string | null;
  className?: string;
}

function iconForKey(key: string): string {
  if (key === 'engine_oil_level') return tellTaleOilIcon;
  if (key === 'engine_limp_mode' || key === 'check_engine_light') return tellTaleCelIcon;
  if (key === 'brake_lining_wear_pre_warning') return tellTaleBrakePadIcon;
  if (key === 'tire_pressure_warning') return tellTaleTirePressureIcon;
  if (key === 'battery_warning_light') return tellTaleBatteryIcon;
  return tellTaleCelIcon;
}

function toneTextClass(tone: TelltaleTone, strong = false): string {
  if (tone === 'critical') return 'text-red-600 dark:text-red-400 font-bold';
  if (tone === 'alert') return 'text-amber-600 dark:text-amber-400 font-semibold';
  if (tone === 'ok') return strong ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground font-medium';
  if (tone === 'muted') return 'italic text-muted-foreground/70 font-medium';
  if (tone === 'stale') return 'text-amber-600 dark:text-amber-400 font-medium';
  if (tone === 'error') return 'text-red-600 dark:text-red-400 font-medium';
  return 'text-muted-foreground font-medium';
}

function toneDotClass(tone: TelltaleTone): string {
  if (tone === 'critical') return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
  if (tone === 'alert') return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
  if (tone === 'ok') return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]';
  if (tone === 'stale') return 'bg-amber-400';
  if (tone === 'error') return 'bg-red-400';
  return 'bg-gray-300 dark:bg-gray-600';
}

function toneIconBgClass(tone: TelltaleTone): string {
  if (tone === 'critical') return 'sq-tone-critical ring-1 ring-border';
  if (tone === 'alert') return 'sq-tone-watch ring-1 ring-border';
  if (tone === 'ok') return 'sq-tone-success ring-1 ring-border';
  return 'bg-muted/40 ring-1 ring-border';
}

export function DashboardWarningLightsPanel({
  telltales,
  loading = false,
  oilLevelDisplay,
  syncErrorMessage,
  className = '',
}: DashboardWarningLightsPanelProps) {
  if (loading && !telltales) {
    return <SkeletonCard className={`h-48 rounded-2xl ${className}`} />;
  }

  const presentation = resolveTelltalePanelPresentation(telltales);
  const freshness = telltales?.freshness ?? 'no_data';
  const lastUpdate = telltales?.lastObservedAt ?? null;
  const lastUpdateRel = formatRelativeObservedAt(lastUpdate);
  const lastUpdateAbs = formatObservedAtAbsolute(lastUpdate);
  const lights = sortDashboardLights(telltales?.lights ?? []);

  const cardTone =
    presentation.badgeTone === 'critical'
      ? 'sq-tone-critical border border-border'
      : presentation.badgeTone === 'watch' || freshness === 'stale'
        ? 'sq-tone-watch border border-border'
        : 'sq-tone-ai border border-border';

  return (
    <div className={`sq-glass rounded-2xl p-4 sm:p-5 ${cardTone} ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`p-1.5 rounded-lg shrink-0 ${
              presentation.badgeTone === 'critical'
                ? 'sq-tone-critical'
                : presentation.badgeTone === 'watch'
                  ? 'sq-tone-watch'
                  : 'sq-tone-ai'
            }`}
          >
            <Icon name="activity" className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-[10px] tracking-tight text-[color:var(--status-ai)] uppercase">
                Tacho Warnleuchten
              </span>
              <StatusChip tone={presentation.badgeTone} dot>
                {presentation.badgeLabel}
              </StatusChip>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground max-w-prose">
              {presentation.summaryText}
            </p>
          </div>
        </div>
        {(lastUpdateRel || freshness === 'stale') && (
          <div className="flex flex-col items-start sm:items-end gap-1 shrink-0 text-[10px] text-muted-foreground">
            {lastUpdateRel && (
              <span
                className={`px-2 py-0.5 rounded-full font-medium ${
                  freshness === 'stale'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-muted'
                }`}
                title={lastUpdateAbs ?? undefined}
              >
                {lastUpdateRel}
              </span>
            )}
            {freshness === 'stale' && lastUpdateAbs && (
              <span className="text-[9px]">Zuletzt: {lastUpdateAbs}</span>
            )}
          </div>
        )}
      </div>

      {syncErrorMessage && (
        <div className="mb-4 rounded-xl px-3 py-2.5 text-xs border sq-tone-critical border-border">
          <div className="flex items-center gap-2 font-semibold mb-0.5">
            <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0" />
            Synchronisierung fehlgeschlagen
          </div>
          <p className="text-muted-foreground pl-5">{syncErrorMessage}</p>
        </div>
      )}

      {presentation.showConfirmedOff && (
        <div className="mb-4 rounded-xl px-3 py-2.5 text-xs border sq-tone-success border-border flex items-center gap-2">
          <Icon name="check-circle" className="w-3.5 h-3.5 shrink-0 text-[color:var(--status-positive)]" />
          <span className="font-medium">Keine aktiven Warnleuchten bestätigt.</span>
        </div>
      )}

      {lights.length > 0 && (
        <div className="space-y-1">
          {lights.map((light) => {
            const tone = telltaleToneFromLight(light);
            const primary = telltaleRowPrimaryText(light);
            const secondary = telltaleRowSecondaryText(light);
            const hasOilBar = shouldShowOilLevelBar(light, oilLevelDisplay);
            const isOilCritical =
              light.key === 'engine_oil_level' &&
              light.state === 'active' &&
              light.severity === 'critical';
            const observedRel = formatRelativeObservedAt(light.observedAt);
            const observedAbs = formatObservedAtAbsolute(light.observedAt);

            return (
              <div
                key={light.key}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3.5 p-2.5 -mx-1 rounded-xl transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${
                      hasOilBar
                        ? isOilCritical
                          ? 'sq-tone-watch border-border'
                          : 'bg-muted/40 border-border'
                        : toneIconBgClass(tone)
                    }`}
                  >
                    <img
                      src={iconForKey(light.key)}
                      alt=""
                      aria-hidden="true"
                      className={`w-4 h-4 object-contain ${
                        tone === 'ok' && !hasOilBar ? 'opacity-50 grayscale' : 'opacity-100'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="text-[10px] font-bold text-foreground">{light.label}</p>
                      {observedRel && (
                        <span
                          className="text-[9px] text-muted-foreground/80"
                          title={observedAbs ?? undefined}
                        >
                          {observedRel}
                        </span>
                      )}
                    </div>
                    {hasOilBar && oilLevelDisplay ? (
                      <>
                        <div className="w-full h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden shadow-inner max-w-xs">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOilCritical
                                ? 'bg-amber-500'
                                : oilLevelDisplay.value != null && oilLevelDisplay.value >= 0.9
                                  ? 'bg-blue-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${Math.round((oilLevelDisplay.value ?? 0.5) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className={`text-[10px] mt-1 font-semibold ${toneTextClass(tone)}`}>
                          {oilLevelDisplay.label}
                        </p>
                      </>
                    ) : (
                      <>
                        <p
                          className={`text-[10px] mt-0.5 ${toneTextClass(tone, light.state === 'active')}`}
                        >
                          {primary}
                        </p>
                        {secondary && (
                          <p
                            className={`text-[9px] mt-0.5 leading-snug ${
                              tone === 'critical'
                                ? 'text-red-600/90 dark:text-red-400/90 font-medium'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {secondary}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 self-end sm:self-center mr-1 ${toneDotClass(tone)}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
