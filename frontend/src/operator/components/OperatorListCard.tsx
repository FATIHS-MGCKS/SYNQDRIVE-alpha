import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { OperatorGlassCard } from './OperatorGlassCard';
import { OperatorStatusRow } from './OperatorStatusChip';
import type { OperatorStatusBadge } from '../lib/operatorStatus';

interface OperatorListCardProps {
  title: string;
  subtitle?: string;
  meta?: string;
  badges?: OperatorStatusBadge[];
  onClick?: () => void;
  trailing?: ReactNode;
  disabled?: boolean;
}

export function OperatorListCard({
  title,
  subtitle,
  meta,
  badges = [],
  onClick,
  trailing,
  disabled,
}: OperatorListCardProps) {
  return (
    <OperatorGlassCard
      as="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className="w-full p-4 text-left"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            {meta && (
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{meta}</span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
          {badges.length > 0 && <div className="mt-2"><OperatorStatusRow badges={badges} /></div>}
        </div>
        {onClick && !trailing && (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {trailing}
      </div>
    </OperatorGlassCard>
  );
}
