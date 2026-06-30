import { cn } from '../../components/ui/utils';
import { OBD_UNPLUGGED_BADGE_LABEL, OBD_UNPLUGGED_TOOLTIP } from '../lib/obd-plug-status';

export function ObdUnpluggedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center rounded-full border border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-[color:var(--status-warning)]',
        className,
      )}
      title={OBD_UNPLUGGED_TOOLTIP}
    >
      {OBD_UNPLUGGED_BADGE_LABEL}
    </span>
  );
}
