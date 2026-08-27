import { cn } from '../../../components/ui/utils';
import type { TranslationKey } from '../../i18n/translations/en';
import { Icon } from '../ui/Icon';
import type { ActiveHealthFinding } from '../../lib/vehicle-row-operational-projection';
import {
  aggregateActiveHealthFindingsForDisplay,
  buildOverflowAccessibleLabel,
  buildVehicleHealthFindingAccessibleLabel,
  buildVehicleHealthFindingTooltip,
  splitAggregatedFindingsForDisplay,
  type VehicleHealthFindingPresentation,
} from '../../lib/vehicle-health-finding-presentation';

const SIZE_CLASS = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
} as const;

const ICON_SIZE_CLASS = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
} as const;

function toneSurfaceClass(tone: VehicleHealthFindingPresentation['tone']): string {
  if (tone === 'critical') {
    return 'ring-1 ring-[color:color-mix(in_srgb,var(--status-critical)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--status-critical)_8%,transparent)]';
  }
  if (tone === 'watch') {
    return 'ring-1 ring-[color:color-mix(in_srgb,var(--status-watch)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--status-watch)_8%,transparent)]';
  }
  return 'ring-1 ring-border bg-muted/30';
}

function toneTextClass(tone: VehicleHealthFindingPresentation['tone']): string {
  if (tone === 'critical') return 'text-[color:var(--status-critical)]';
  if (tone === 'watch') return 'text-[color:var(--status-watch)]';
  return 'text-muted-foreground';
}

function FindingIcon({
  presentation,
  size,
  label,
}: {
  presentation: VehicleHealthFindingPresentation;
  size: 'sm' | 'md';
  label: string;
}) {
  const surface = cn(
    'relative inline-flex shrink-0 items-center justify-center rounded-md',
    SIZE_CLASS[size],
    toneSurfaceClass(presentation.tone),
  );

  if (presentation.iconKind === 'lucide' && presentation.lucideIconName) {
    return (
      <span className={surface} title={label} aria-label={label}>
        <Icon
          name={presentation.lucideIconName}
          className={cn(ICON_SIZE_CLASS[size], toneTextClass(presentation.tone))}
          aria-hidden
        />
      </span>
    );
  }

  return (
    <span className={surface} title={label} aria-label={label}>
      <img
        src={presentation.iconSrc}
        alt=""
        aria-hidden
        className={cn(
          ICON_SIZE_CLASS[size],
          'object-contain',
          presentation.iconClassName,
          toneTextClass(presentation.tone),
        )}
      />
      {presentation.count != null && presentation.count > 1 ? (
        <span
          className={cn(
            'absolute -right-1 -top-1 min-w-[0.85rem] rounded-full px-0.5 text-center text-[8px] font-bold leading-tight tabular-nums',
            toneSurfaceClass(presentation.tone),
            toneTextClass(presentation.tone),
          )}
          aria-hidden
        >
          {presentation.count}
        </span>
      ) : null}
    </span>
  );
}

export interface VehicleHealthFindingIconsProps {
  findings: ActiveHealthFinding[];
  maxVisible?: number;
  size?: 'sm' | 'md';
  locale?: 'en' | 'de';
  t?: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  className?: string;
}

export function VehicleHealthFindingIcons({
  findings,
  maxVisible = 5,
  size = 'sm',
  locale = 'de',
  t,
  className,
}: VehicleHealthFindingIconsProps) {
  if (findings.length === 0) return null;

  const aggregated = aggregateActiveHealthFindingsForDisplay(findings);
  const { visible, overflow } = splitAggregatedFindingsForDisplay(aggregated, maxVisible);
  const labelInput = { locale, t };

  return (
    <div
      className={cn('inline-flex max-w-full flex-wrap items-center gap-1', className)}
      role="list"
      aria-label={t?.('fleet.healthFinding.iconStripLabel') ?? 'Active health findings'}
    >
      {visible.map((presentation) => {
        const label = buildVehicleHealthFindingAccessibleLabel(presentation, labelInput);
        const tooltip = buildVehicleHealthFindingTooltip(presentation, labelInput);
        return (
          <span key={presentation.stableKey} role="listitem" className="inline-flex">
            <FindingIcon presentation={presentation} size={size} label={tooltip || label} />
          </span>
        );
      })}
      {overflow.length > 0 ? (
        <span
          role="listitem"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-md px-1.5 text-[9px] font-semibold tabular-nums',
            SIZE_CLASS[size],
            'ring-1 ring-border bg-muted/40 text-muted-foreground',
          )}
          title={buildOverflowAccessibleLabel(overflow, labelInput)}
          aria-label={buildOverflowAccessibleLabel(overflow, labelInput)}
        >
          +{overflow.length}
        </span>
      ) : null}
    </div>
  );
}
