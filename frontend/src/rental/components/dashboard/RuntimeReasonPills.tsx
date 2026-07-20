import { cn } from '../../../components/ui/utils';
import type { RuntimeReason } from './runtime';
import {
  buildRuntimeReasonDisplayRows,
  runtimeReasonTooltip,
  type RuntimeReasonDisplayRow,
} from './reasonDisplay';

interface RuntimeReasonPillsProps {
  reasons: RuntimeReason[];
  locale: string;
  maxVisible?: number;
  className?: string;
  pillClassName?: string;
  childPillClassName?: string;
  moreClassName?: string;
}

function pillToneClass(severity: RuntimeReason['severity']): string {
  if (severity === 'critical') {
    return 'bg-[color:var(--status-critical)]/10 text-[color:var(--status-critical)]';
  }
  if (severity === 'warning') {
    return 'bg-[color:var(--status-watch)]/10 text-[color:var(--status-watch)]';
  }
  return 'bg-muted text-muted-foreground';
}

function ReasonPill({
  row,
  locale,
  className,
  childClassName,
}: {
  row: RuntimeReasonDisplayRow;
  locale: string;
  className?: string;
  childClassName?: string;
}) {
  return (
    <span
      title={runtimeReasonTooltip(row.reason, locale)}
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-medium',
        pillToneClass(row.reason.severity),
        row.isChild ? cn('ml-3 border border-border/50', childClassName) : className,
      )}
    >
      {row.label}
    </span>
  );
}

export function RuntimeReasonPills({
  reasons,
  locale,
  maxVisible = 2,
  className,
  pillClassName,
  childPillClassName,
  moreClassName,
}: RuntimeReasonPillsProps) {
  const de = locale === 'de';
  const rows = buildRuntimeReasonDisplayRows(reasons, locale);
  const visibleRows = rows.slice(0, maxVisible);
  const remaining = Math.max(0, rows.length - visibleRows.length);

  if (visibleRows.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {visibleRows.map((row) => (
        <ReasonPill
          key={row.reason.id}
          row={row}
          locale={locale}
          className={pillClassName}
          childClassName={childPillClassName}
        />
      ))}
      {remaining > 0 ? (
        <span
          className={cn(
            'rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground',
            moreClassName,
          )}
        >
          {de ? `+${remaining} Gründe` : `+${remaining} reasons`}
        </span>
      ) : null}
    </div>
  );
}
