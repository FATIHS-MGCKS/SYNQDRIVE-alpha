import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TripMapQualityFlags } from './trips-map.types';
import {
  continuityStatusLabel,
  processingStateLabel,
  routeQualityLabel,
} from './trips-route-i18n';

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
    <LiquidGlassLens variant="fleetMiniPill" renderMode="lens" intensity="subtle" className="max-w-full">
      <span className={`liquid-glass-lens__quality-chip ${toneClass}`}>
        <Icon name={icon} className="w-3 h-3 shrink-0 opacity-80" />
        <span>{label}</span>
      </span>
    </LiquidGlassLens>
  );
}

export function TripMapDataQualityOverlay({ quality, routeLoading }: TripMapDataQualityOverlayProps) {
  const { t, locale } = useLanguage();
  const chips: Array<{ key: string; tone: 'ok' | 'watch' | 'muted' | 'danger'; label: string; icon: string }> = [];

  if (routeLoading) {
    chips.push({ key: 'route-load', tone: 'muted', label: t('trips.route.processing'), icon: 'loader-2' });
  } else if (quality.processingState !== 'READY') {
    const processingLabel = processingStateLabel(t, quality.processingState) ?? t('trips.route.failed');
    chips.push({
      key: 'route-processing',
      tone: quality.processingState === 'FAILED' ? 'danger' : 'watch',
      label: processingLabel,
      icon: quality.processingState === 'RETRYING' ? 'refresh-cw' : 'route',
    });
  } else if (!quality.routeAvailable) {
    chips.push({ key: 'route-missing', tone: 'watch', label: t('trips.route.incomplete'), icon: 'route' });
  } else if (quality.routeIncomplete) {
    chips.push({ key: 'route-partial', tone: 'watch', label: t('trips.route.incomplete'), icon: 'route' });
  } else {
    chips.push({ key: 'route-ok', tone: 'ok', label: t('trips.route.available'), icon: 'route' });
  }

  const qualityLabel = routeQualityLabel(t, quality.routeQuality);
  if (qualityLabel && quality.processingState === 'READY') {
    const pct = quality.matchConfidence != null ? Math.round(quality.matchConfidence * 100) : null;
    chips.push({
      key: 'route-quality',
      tone: quality.routeQuality === 'MATCHED' ? 'ok' : 'muted',
      label:
        quality.routeQuality === 'MATCHED' && pct != null
          ? `${qualityLabel} · ${pct}%`
          : qualityLabel,
      icon: quality.routeQuality === 'MATCHED' ? 'check-circle' : 'map',
    });
  }

  if (quality.continuityStatus === 'GAPS_PRESENT') {
    const continuityLabel = continuityStatusLabel(t, quality.continuityStatus);
    if (continuityLabel) {
      chips.push({ key: 'continuity-gap', tone: 'watch', label: continuityLabel, icon: 'alert-triangle' });
    }
  }

  if (quality.gpsGap && quality.continuityStatus !== 'GAPS_PRESENT') {
    chips.push({ key: 'gps-gap', tone: 'watch', label: t('trips.route.gpsGap'), icon: 'alert-triangle' });
  }

  if (quality.hfUnavailable) {
    chips.push({ key: 'hf-none', tone: 'muted', label: t('trips.route.telemetry.unavailable'), icon: 'activity' });
  } else if (quality.hfAnalyzing) {
    chips.push({ key: 'hf-pending', tone: 'watch', label: t('trips.route.telemetry.analyzing'), icon: 'loader-2' });
  } else if (quality.hfLimited) {
    chips.push({ key: 'hf-limited', tone: 'watch', label: t('trips.route.telemetry.limited'), icon: 'activity' });
  } else if (quality.hfAvailable) {
    chips.push({ key: 'hf-ok', tone: 'ok', label: t('trips.route.telemetry.available'), icon: 'activity' });
  }

  const updatedAtLabel =
    quality.routeUpdatedAt != null
      ? t('trips.route.updatedAt', {
          date: new Date(quality.routeUpdatedAt).toLocaleString(locale, {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
      : null;

  return (
    <div className="pointer-events-none absolute top-2.5 right-2.5 z-20 max-w-[min(14rem,calc(100%-5.5rem))]">
      <LiquidGlassLens
        variant="fleetPanel"
        renderMode="shell"
        intensity="subtle"
        className="pointer-events-auto w-full"
      >
        <div className="liquid-glass-lens__trip-quality-stack">
          {chips.slice(0, 4).map((chip) => (
            <QualityChip key={chip.key} tone={chip.tone} label={chip.label} icon={chip.icon} />
          ))}
          {updatedAtLabel && (
            <p className="text-[8px] text-muted-foreground tabular-nums pt-0.5 pr-1 text-right w-full">
              {updatedAtLabel}
            </p>
          )}
        </div>
      </LiquidGlassLens>
    </div>
  );
}
