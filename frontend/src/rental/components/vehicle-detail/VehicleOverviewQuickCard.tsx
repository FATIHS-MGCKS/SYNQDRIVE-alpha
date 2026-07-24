import type { VehicleDetailTab } from '../../lib/vehicle-overview.types';
import type {
  VehicleOverviewCardStatus,
  VehicleOverviewLoadState,
} from '../../lib/vehicle-overview.types';
import { useLanguage } from '../../i18n/LanguageContext';
import { translateOverviewCardStatus } from '../../lib/vehicle-detail-i18n';
import { Icon } from '../ui/Icon';
import {
  cardStatusAccentBorder,
  cardStatusDotClass,
  cardStatusPillClass,
  vo,
} from './vehicle-overview-ui';

export interface VehicleOverviewQuickCardProps {
  icon: string;
  label: string;
  headline: string;
  subline?: string;
  status: VehicleOverviewCardStatus;
  loadState?: VehicleOverviewLoadState;
  targetTab: VehicleDetailTab;
  onNavigate: (targetTab: VehicleDetailTab) => void;
}

function hasVisibleSubline(subline: string | undefined, headline: string): boolean {
  if (!subline) return false;
  const trimmed = subline.trim();
  if (!trimmed) return false;
  return trimmed !== headline.trim();
}

export function VehicleOverviewQuickCard({
  icon,
  label,
  headline,
  subline,
  status,
  loadState = 'ready',
  targetTab,
  onNavigate,
}: VehicleOverviewQuickCardProps) {
  const { t } = useLanguage();
  const isLoading = loadState === 'loading';
  const isUnavailable = loadState === 'unavailable' || loadState === 'error';
  const statusText = translateOverviewCardStatus(status, t);
  const showSubline = hasVisibleSubline(subline, headline);
  const ariaLabel = t('vehicleDetail.overview.quickCardAria', {
    label,
    headline,
    subline: showSubline && subline ? `, ${subline}` : '',
    status: statusText,
  });

  return (
    <button
      type="button"
      className={`${vo.card} ${cardStatusAccentBorder(status)} ${vo.hover} ${vo.active} ${vo.focusRing} cursor-pointer disabled:cursor-wait disabled:opacity-80`}
      onClick={() => onNavigate(targetTab)}
      disabled={isLoading}
      aria-label={ariaLabel}
      aria-busy={isLoading}
      aria-disabled={isLoading}
    >
      <div className={vo.cardInner}>
        <div className={vo.cardTopRow}>
          <div className={vo.iconWrap}>
            <Icon name={icon} className="w-3.5 h-3.5" aria-hidden />
          </div>
          {!isLoading ? (
            <span className={`${vo.statusPill} ${cardStatusPillClass(status)}`}>
              <span
                className={`${vo.statusDot} ${cardStatusDotClass(status)}`}
                aria-hidden
              />
              <span>{statusText}</span>
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 text-left">
          <p className={vo.cardLabel}>{label}</p>
          {isLoading ? (
            <div
              className="mt-1 space-y-1.5 animate-pulse motion-reduce:animate-none"
              aria-hidden
            >
              <div className="h-3.5 w-[82%] rounded bg-muted/80" />
              <div className="h-2.5 w-[58%] rounded bg-muted/50" />
            </div>
          ) : (
            <>
              <p className={`${vo.cardHeadline} mt-0.5`}>{headline}</p>
              {showSubline ? <p className={`${vo.cardSubline} mt-0.5`}>{subline}</p> : null}
            </>
          )}
        </div>

        {!isLoading ? (
          <span
            className="absolute right-2.5 bottom-2.5 hidden sm:flex opacity-0 group-hover:opacity-70 group-focus-visible:opacity-100 transition-opacity duration-[var(--dur-fast)] motion-reduce:transition-none text-muted-foreground pointer-events-none"
            aria-hidden
          >
            <Icon name="chevron-right" className="w-3.5 h-3.5" />
          </span>
        ) : null}

        {isUnavailable ? (
          <span className="sr-only">{t('vehicleDetail.overview.dataUnavailable')}</span>
        ) : null}
      </div>
    </button>
  );
}
