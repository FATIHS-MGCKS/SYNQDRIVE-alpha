import type { VehicleOverviewReadinessSummary } from '../../lib/vehicle-overview.types';
import { Icon } from '../ui/Icon';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  readinessDisplayTitle,
  readinessIconName,
  readinessStatusBadgeLabel,
  readinessToneClass,
  vo,
} from './vehicle-overview-ui';

const MAX_VISIBLE_BLOCKERS = 3;

export interface VehicleOverviewReadinessStripProps {
  readiness: VehicleOverviewReadinessSummary;
  isLoading?: boolean;
}

/**
 * @deprecated Removed from the Vehicle Overview. It rendered a local
 * "Not ready / Blocked" verdict that conflicted with canonical rental status.
 * Vehicle Overview must not show a locally-derived blocked/not-ready box. Kept
 * for potential reuse only; do not re-add to the Overview.
 */
export function VehicleOverviewReadinessStrip({
  readiness,
  isLoading,
}: VehicleOverviewReadinessStripProps) {
  const { t, locale } = useLanguage();
  const loading = isLoading || readiness.loadState === 'loading';
  const tone = readinessToneClass(readiness.tone);
  const title = readinessDisplayTitle(locale, readiness.readinessStatus, readiness.title);
  const badgeLabel = readinessStatusBadgeLabel(locale, readiness.readinessStatus);
  const hiddenBlockers = Math.max(0, readiness.totalBlockerCount - MAX_VISIBLE_BLOCKERS);

  if (loading) {
    return (
      <div
        className={`${vo.readiness} border-border/50 bg-muted/5 animate-pulse motion-reduce:animate-none`}
        role="status"
        aria-busy="true"
        aria-label={t('vehicle.overview.loadingReadiness')}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-muted/80 shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-4 w-40 max-w-[70%] rounded bg-muted/80" />
            <div className="h-3 w-full max-w-md rounded bg-muted/50" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`${vo.readiness} ${tone.surface}`}
      role="status"
      aria-live="polite"
      aria-label={t('vehicle.overview.readinessAria', { title, badge: badgeLabel })}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${tone.icon}`}
          >
            <Icon
              name={readinessIconName(readiness.readinessStatus)}
              className="w-[18px] h-[18px]"
              aria-hidden
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className={vo.readinessTitle}>{title}</h2>
              <span className={`${vo.readinessBadge} ${tone.badge}`}>
                <span className={`${vo.statusDot} ${tone.dot}`} aria-hidden />
                {badgeLabel}
              </span>
            </div>
            <p className={vo.readinessSubtitle}>{readiness.subtitle}</p>
          </div>
        </div>

        {readiness.blockers.length > 0 ? (
          <div
            className="flex flex-wrap items-center justify-start sm:justify-end gap-1.5 shrink-0 max-w-full sm:max-w-[48%]"
            aria-label={t('vehicle.overview.activeBlockers')}
          >
            {readiness.blockers.slice(0, MAX_VISIBLE_BLOCKERS).map((blocker) => (
              <span key={blocker} className={vo.chip} title={blocker}>
                {blocker}
              </span>
            ))}
            {hiddenBlockers > 0 ? (
              <span className={`${vo.chip} text-muted-foreground`}>
                {t('vehicle.overview.moreBlockers', { count: hiddenBlockers })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
