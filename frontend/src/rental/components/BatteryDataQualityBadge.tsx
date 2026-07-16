import type { BatteryDataQualityStatus } from './battery-data-quality';
import {
  batteryDataQualityChipTone,
  batteryDataQualityShortLabel,
} from './battery-data-quality.utils';
import { useLanguage } from '../i18n/LanguageContext';

interface BatteryDataQualityBadgeProps {
  status: BatteryDataQualityStatus | null | undefined;
  className?: string;
  short?: boolean;
}

export function BatteryDataQualityBadge({
  status,
  className = '',
  short = true,
}: BatteryDataQualityBadgeProps) {
  const { t } = useLanguage();
  if (!status) return null;

  const tone = batteryDataQualityChipTone(status);
  const label = short
    ? batteryDataQualityShortLabel(status, t)
    : t(`health.battery.dataQuality.${status}`);

  const toneClass =
    tone === 'success'
      ? 'sq-chip-success'
      : tone === 'info'
        ? 'sq-chip-neutral border border-border'
        : tone === 'watch'
          ? 'sq-chip-watch'
          : tone === 'critical'
            ? 'sq-chip-critical'
            : 'sq-chip-neutral';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${toneClass} ${className}`}
      title={t(`health.battery.dataQuality.${status}`)}
    >
      {label}
    </span>
  );
}
