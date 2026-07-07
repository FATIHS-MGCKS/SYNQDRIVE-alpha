import type { ReactNode } from 'react';
import { cn } from '../../../components/ui/utils';
import { EM_DASH } from './customerDetailUtils';

interface CustomerDetailInfoRowProps {
  label: string;
  value?: ReactNode | null;
  icon?: ReactNode;
  mutedWhenEmpty?: boolean;
}

export function CustomerDetailInfoRow({
  label,
  value,
  icon,
  mutedWhenEmpty = true,
}: CustomerDetailInfoRowProps) {
  const empty =
    value == null ||
    value === '' ||
    value === EM_DASH ||
    (typeof value === 'string' && !value.trim());
  const display = empty ? EM_DASH : value;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-b-0">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon ? <span className="shrink-0 text-muted-foreground/70 [&_svg]:size-3.5">{icon}</span> : null}
        <span className="text-[12px] text-muted-foreground">{label}</span>
      </div>
      <span
        className={cn(
          'max-w-[58%] text-right text-[12px] font-medium leading-snug break-words',
          empty && mutedWhenEmpty ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {display}
      </span>
    </div>
  );
}
