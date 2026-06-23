import { Icon } from '../ui/Icon';
import type { VehicleDetailTab } from '../../lib/vehicle-overview.types';
import type { VehicleRequirementsQuickSummary } from '../../lib/vehicle-rental-requirements.utils';
import {
  RentalRequirementsStatusBadge,
} from '../shared/rental-requirements-ui';
import {
  cardStatusAccentBorder,
  vo,
} from './vehicle-overview-ui';

export interface VehicleRentalRequirementsQuickCardProps {
  summary: VehicleRequirementsQuickSummary;
  loading?: boolean;
  error?: string | null;
  onNavigate: (tab: VehicleDetailTab) => void;
  onRetry?: () => void;
}

export function VehicleRentalRequirementsQuickCard({
  summary,
  loading,
  error,
  onNavigate,
  onRetry,
}: VehicleRentalRequirementsQuickCardProps) {
  const cardStatus = loading ? 'neutral' : error ? 'critical' : summary.cardStatus;

  if (error) {
    return (
      <div
        className={`${vo.card} ${cardStatusAccentBorder('critical')} border-l-[3px] w-[10.75rem] sm:w-full min-h-[4.75rem] snap-start shrink-0 sm:shrink`}
        role="listitem"
      >
        <div className={`${vo.cardInner} items-start`}>
          <p className={vo.cardLabel}>Rental requirements</p>
          <p className={`${vo.cardHeadline} mt-1 text-[color:var(--status-critical)]`}>Unavailable</p>
          <p className={`${vo.cardSubline} mt-0.5`}>{error}</p>
          {onRetry ? (
            <button
              type="button"
              className="sq-btn sq-btn-ghost mt-2 h-7 px-2 text-[11px]"
              onClick={onRetry}
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`group ${vo.card} ${cardStatusAccentBorder(cardStatus)} ${vo.hover} ${vo.active} ${vo.focusRing} cursor-pointer disabled:cursor-wait disabled:opacity-80 w-[10.75rem] sm:w-full min-h-[4.75rem] snap-start shrink-0 sm:shrink`}
      onClick={() => onNavigate('vehicle-requirements')}
      disabled={loading}
      aria-label={`Rental requirements. Minimum age ${summary.minimumAgeLabel}. Open requirements tab.`}
      aria-busy={loading}
    >
      <div className={vo.cardInner}>
        <div className={vo.cardTopRow}>
          <div className={vo.iconWrap}>
            <Icon name="shield-check" className="w-3.5 h-3.5" aria-hidden />
          </div>
          {!loading ? (
            <RentalRequirementsStatusBadge kind={summary.statusKind} className="!text-[10px]" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1 text-left">
          <p className={vo.cardLabel}>Rental requirements</p>
          {loading ? (
            <div className="mt-1 space-y-1.5 animate-pulse motion-reduce:animate-none" aria-hidden>
              <div className="h-3.5 w-[82%] rounded bg-muted/80" />
              <div className="h-2.5 w-[58%] rounded bg-muted/50" />
            </div>
          ) : (
            <>
              <p className={`${vo.cardHeadline} mt-0.5`}>
                Age {summary.minimumAgeLabel} · Deposit {summary.depositLabel}
              </p>
              <p className={`${vo.cardSubline} mt-0.5`}>
                License {summary.licenseLabel} · Card {summary.creditCardLabel}
              </p>
              <p className={`${vo.cardSubline} mt-0.5 text-muted-foreground/80`}>
                {summary.sourceLabel}
              </p>
            </>
          )}
        </div>

        {!loading ? (
          <span
            className="absolute right-2.5 bottom-2.5 hidden sm:flex opacity-0 group-hover:opacity-70 group-focus-visible:opacity-100 transition-opacity duration-[var(--dur-fast)] text-muted-foreground pointer-events-none"
            aria-hidden
          >
            <Icon name="chevron-right" className="w-3.5 h-3.5" />
          </span>
        ) : null}
      </div>
    </button>
  );
}
