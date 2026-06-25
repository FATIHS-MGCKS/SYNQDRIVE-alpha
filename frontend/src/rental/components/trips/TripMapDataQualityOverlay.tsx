import { Icon } from '../ui/Icon';
import type { TripMapQualityFlags } from './trips-map.types';

interface TripMapDataQualityOverlayProps {
  quality: TripMapQualityFlags;
  routeLoading: boolean;
}

function QualityChip({
  tone,
  label,
  icon,
}: {
  tone: 'ok' | 'watch' | 'muted' | 'danger';
  label: string;
  icon: string;
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'watch'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'danger'
          ? 'text-red-600 dark:text-red-400'
          : 'text-muted-foreground';

  return (
    <span className={`sq-map-liquid-pill flex-row gap-1.5 py-1 px-2 text-[9px] font-semibold ${toneClass}`}>
      <Icon name={icon} className="w-3 h-3 shrink-0 opacity-80" />
      <span>{label}</span>
    </span>
  );
}

export function TripMapDataQualityOverlay({ quality, routeLoading }: TripMapDataQualityOverlayProps) {
  const chips: Array<{ key: string; tone: 'ok' | 'watch' | 'muted' | 'danger'; label: string; icon: string }> = [];

  if (routeLoading) {
    chips.push({ key: 'route-load', tone: 'muted', label: 'Route lädt…', icon: 'loader-2' });
  } else if (!quality.routeAvailable) {
    chips.push({ key: 'route-missing', tone: 'watch', label: 'Route unvollständig', icon: 'route' });
  } else if (quality.routeIncomplete) {
    chips.push({ key: 'route-partial', tone: 'watch', label: 'Route unvollständig', icon: 'route' });
  } else {
    chips.push({ key: 'route-ok', tone: 'ok', label: 'Route verfügbar', icon: 'route' });
  }

  if (quality.mapMatched) {
    const pct = quality.mapMatchConfidence != null ? Math.round(quality.mapMatchConfidence * 100) : null;
    chips.push({
      key: 'matched',
      tone: 'ok',
      label: pct != null ? `Route abgeglichen · ${pct}%` : 'Route abgeglichen',
      icon: 'check-circle',
    });
  } else if (quality.routeAvailable) {
    chips.push({ key: 'unmatched', tone: 'muted', label: 'Nicht abgeglichen', icon: 'map' });
  }

  if (quality.gpsGap) {
    chips.push({ key: 'gps-gap', tone: 'watch', label: 'GPS-Lücke', icon: 'alert-triangle' });
  }

  if (quality.hfUnavailable) {
    chips.push({ key: 'hf-none', tone: 'muted', label: 'HF nicht verfügbar', icon: 'activity' });
  } else if (quality.hfAnalyzing) {
    chips.push({ key: 'hf-pending', tone: 'watch', label: 'HF-Analyse läuft', icon: 'loader-2' });
  } else if (quality.hfLimited) {
    chips.push({ key: 'hf-limited', tone: 'watch', label: 'Telemetrie eingeschränkt', icon: 'activity' });
  } else if (quality.hfAvailable) {
    chips.push({ key: 'hf-ok', tone: 'ok', label: 'Telemetrie verfügbar', icon: 'activity' });
  }

  return (
    <div className="pointer-events-none absolute top-2.5 right-2.5 z-20 max-w-[min(14rem,calc(100%-5.5rem))]">
      <div className="sq-map-liquid-glass pointer-events-auto px-2 py-2 flex flex-col items-end gap-1">
        {chips.slice(0, 4).map((chip) => (
          <QualityChip key={chip.key} tone={chip.tone} label={chip.label} icon={chip.icon} />
        ))}
        {quality.routeUpdatedAt && (
          <p className="text-[8px] text-muted-foreground tabular-nums pt-0.5 pr-1">
            Aktualisiert{' '}
            {new Date(quality.routeUpdatedAt).toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  );
}
