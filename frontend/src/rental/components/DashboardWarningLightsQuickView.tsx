import tellTaleOilIcon from '../../assets/icons/telltale/oil.svg';
import tellTaleCelIcon from '../../assets/icons/telltale/cel.svg';
import tellTaleBrakePadIcon from '../../assets/icons/telltale/brake-pad.svg';
import tellTaleTirePressureIcon from '../../assets/icons/telltale/tire-pressure.svg';
import tellTaleBatteryWarningIcon from '../../assets/icons/telltale/battery.svg';
import type { DashboardWarningLightsResponse } from '../../lib/api';
import { Icon } from './ui/Icon';
import { StatusChip } from '../../components/patterns';
import {
  DASHBOARD_TELLTALE_KEYS,
  formatRelativeObservedAt,
  resolveTelltalePanelPresentation,
  telltaleShortLabel,
  telltaleShortTextFromLight,
  telltaleToneFromLight,
  type TelltaleTone,
} from '../lib/dashboard-warning-lights-display';

export interface DashboardWarningLightsQuickViewProps {
  telltales?: DashboardWarningLightsResponse | null;
  loading?: boolean;
  onViewDetails?: () => void;
}

function iconForKey(key: string): string {
  if (key === 'engine_oil_level') return tellTaleOilIcon;
  if (key === 'engine_limp_mode') return tellTaleCelIcon;
  if (key === 'brake_lining_wear_pre_warning') return tellTaleBrakePadIcon;
  if (key === 'tire_pressure_warning') return tellTaleTirePressureIcon;
  if (key === 'battery_warning_light') return tellTaleBatteryWarningIcon;
  return tellTaleCelIcon;
}

function iconBgFor(tone: TelltaleTone): string {
  if (tone === 'critical') return 'bg-[color:var(--status-critical-soft)]';
  if (tone === 'alert') return 'bg-[color:var(--status-watch-soft)]';
  if (tone === 'ok') return 'bg-[color:var(--status-positive-soft)]';
  return 'bg-muted';
}

export function DashboardWarningLightsQuickView({
  telltales,
  loading = false,
  onViewDetails,
}: DashboardWarningLightsQuickViewProps) {
  const presentation = resolveTelltalePanelPresentation(telltales);
  const freshness = telltales?.freshness ?? 'no_data';
  const lastUpdateLabel = formatRelativeObservedAt(telltales?.lastObservedAt ?? null);

  const items = DASHBOARD_TELLTALE_KEYS.map((key) => {
    const light = telltales?.lights.find((l) => l.key === key);
    const tone: TelltaleTone = light ? telltaleToneFromLight(light) : 'neutral';
    const label = telltaleShortLabel(key);
    return {
      key,
      label,
      tone,
      text: light ? telltaleShortTextFromLight(light) : loading ? '…' : 'Unbekannt',
      icon: iconForKey(key),
    };
  });

  const activeAlerts = items.filter((it) => it.tone === 'alert' || it.tone === 'critical').length;

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-[10px] font-semibold text-foreground">Tacho Warnleuchten</span>
        {loading && !telltales ? (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium border border-border text-muted-foreground">
            Laden …
          </span>
        ) : (
          <StatusChip tone={presentation.badgeTone} className="!text-[9px] !py-0 !px-1.5">
            {presentation.badgeLabel}
          </StatusChip>
        )}
        {freshness === 'stale' && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-[color:var(--status-watch)]">
            <Icon name="alert-triangle" className="w-2.5 h-2.5" />
            Veraltet
          </span>
        )}
        {lastUpdateLabel && freshness !== 'stale' && (
          <span className="ml-auto text-[9px] text-muted-foreground">{lastUpdateLabel}</span>
        )}
      </div>
      {!loading && telltales && (
        <p className="text-[9px] text-muted-foreground mb-2 leading-snug line-clamp-2">
          {presentation.summaryText}
        </p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={onViewDetails}
            title={`${it.label}: ${it.text}`}
            className={`group flex flex-col items-center gap-1 px-1 py-1.5 rounded-lg border transition-colors ${
              it.tone === 'alert' || it.tone === 'critical'
                ? 'border-[color:var(--status-watch-soft)] hover:bg-[color:var(--status-watch-soft)]'
                : 'border-border hover:bg-muted'
            }`}
          >
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${iconBgFor(it.tone)}`}>
              <img
                src={it.icon}
                alt=""
                aria-hidden="true"
                className={`w-3.5 h-3.5 object-contain transition-opacity ${
                  it.tone === 'alert' || it.tone === 'critical'
                    ? 'opacity-95'
                    : it.tone === 'ok'
                      ? 'opacity-50 grayscale'
                      : 'opacity-30 grayscale'
                }`}
              />
            </div>
            <span
              className={`text-[9px] leading-none truncate w-full text-center ${
                it.tone === 'alert' || it.tone === 'critical'
                  ? 'text-[color:var(--status-watch)] font-semibold'
                  : 'text-muted-foreground'
              }`}
            >
              {it.label}
            </span>
          </button>
        ))}
      </div>
      {!loading && activeAlerts > 0 && (
        <p className="mt-1.5 text-[9px] text-[color:var(--status-watch)] font-medium">
          {activeAlerts} aktive Warnleuchte{activeAlerts === 1 ? '' : 'n'}
        </p>
      )}
    </div>
  );
}
