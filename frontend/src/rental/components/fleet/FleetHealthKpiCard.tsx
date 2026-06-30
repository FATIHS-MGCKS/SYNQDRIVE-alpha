import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../components/ui/utils';
import type { StatusTone } from '../../../components/patterns';

export interface FleetHealthKpiCardProps {
  label: string;
  value: number;
  hint?: string;
  tone?: StatusTone;
  icon?: LucideIcon;
  active?: boolean;
  emphasize?: boolean;
  onClick?: () => void;
}

const TONE_VALUE: Partial<Record<StatusTone, string>> = {
  critical: 'text-[color:var(--status-critical)]',
  warning: 'text-[color:var(--status-watch)]',
  success: 'text-[color:var(--status-positive)]',
  noData: 'text-muted-foreground',
};

export function FleetHealthKpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  active,
  emphasize,
  onClick,
}: FleetHealthKpiCardProps) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'fleet-health-kpi-tile text-left transition-all',
        onClick && 'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        active && 'ring-2 ring-[color:var(--brand)]',
        !active && emphasize && value > 0 && 'ring-1 ring-[color:color-mix(in_srgb,var(--status-critical)_25%,transparent)]',
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="fleet-health-kpi-tile__icon h-3 w-3 shrink-0 text-muted-foreground" /> : null}
        <p className="fleet-health-kpi-tile__label">{label}</p>
      </div>
      <p className={cn('fleet-health-kpi-tile__value tabular-nums', TONE_VALUE[tone] ?? 'text-foreground')}>
        {value}
      </p>
      {hint ? <p className="fleet-health-kpi-tile__hint">{hint}</p> : null}
    </Tag>
  );
}
