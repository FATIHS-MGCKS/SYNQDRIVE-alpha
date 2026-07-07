import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import {
  getKpiCardSurfaceClass,
  getKpiValueGradientClass,
  type KpiCardTone,
} from '../dashboard/dashboardKpiVisual';

export type CustomerSegmentFilter = 'all' | 'active' | 'suspended' | 'attention';

interface CustomerKpiCardProps {
  label: string;
  value: number;
  filterKey: CustomerSegmentFilter;
  isActive: boolean;
  onToggle: (key: CustomerSegmentFilter) => void;
  icon: string;
  tone?: 'critical' | 'watch' | 'success';
  subdued?: boolean;
}

function toneToKpiCardTone(tone?: 'critical' | 'watch' | 'success', value = 0): KpiCardTone {
  if (tone === 'critical' && value > 0) return 'critical';
  if (tone === 'watch' && value > 0) return 'warning';
  if (tone === 'success' && value > 0) return 'positive';
  return 'neutral';
}

function iconTileClass(cardTone: KpiCardTone): string {
  switch (cardTone) {
    case 'critical':
      return 'bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
    case 'warning':
      return 'bg-[color:color-mix(in_srgb,var(--status-warning)_10%,transparent)] text-[color:var(--status-warning)]';
    case 'positive':
      return 'bg-[color:color-mix(in_srgb,var(--status-positive)_10%,transparent)] text-[color:var(--status-positive)]';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function CustomerKpiCard({
  label,
  value,
  filterKey,
  isActive,
  onToggle,
  icon,
  tone,
  subdued = false,
}: CustomerKpiCardProps) {
  const cardTone = toneToKpiCardTone(tone, value);
  const valueTone = subdued && value === 0 ? 'neutral' : cardTone;

  return (
    <button
      type="button"
      onClick={() => onToggle(filterKey)}
      aria-pressed={isActive}
      aria-label={`${label}: ${value}`}
      className={cn(
        'sq-press group relative overflow-hidden border text-left transition-colors duration-200',
        'hover:border-border/60 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        'min-h-[96px] rounded-lg px-2.5 py-2',
        getKpiCardSurfaceClass(cardTone, false),
        isActive && 'ring-2 ring-[color:var(--brand)]/55',
      )}
    >
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1 text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]',
              getKpiValueGradientClass(valueTone, subdued && value === 0),
            )}
          >
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
            iconTileClass(cardTone),
          )}
        >
          <Icon name={icon} className="h-3 w-3" />
        </div>
      </div>
      {cardTone === 'critical' && value > 0 ? (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
