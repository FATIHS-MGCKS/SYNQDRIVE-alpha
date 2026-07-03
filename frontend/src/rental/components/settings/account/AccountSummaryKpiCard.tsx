import type { ReactNode } from 'react';
import { cn } from '../../../../components/ui/utils';
import {
  accountKpiCardClass,
  accountKpiIconToneClass,
  accountKpiValueClass,
  type AccountKpiTone,
} from './account-ui';

interface AccountSummaryKpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone?: AccountKpiTone;
  onClick?: () => void;
}

export function AccountSummaryKpiCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  onClick,
}: AccountSummaryKpiCardProps) {
  const content = (
    <div className="flex h-full items-start justify-between gap-2">
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
          {label}
        </p>
        <p className={accountKpiValueClass(tone)}>{value}</p>
        {hint ? (
          <p className="mt-1 truncate text-[10px] leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
          accountKpiIconToneClass(tone),
        )}
      >
        <span className="h-3 w-3 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={accountKpiCardClass(tone)}>
        {content}
      </button>
    );
  }

  return <div className={accountKpiCardClass(tone)}>{content}</div>;
}
