import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';

interface HeaderActionButtonProps {
  label: string;
  icon?: string;
  disabled?: boolean;
  reason?: string;
  loading?: boolean;
  variant?: 'primary' | 'neutral';
  onClick?: () => void;
  className?: string;
}

export function HeaderActionButton({
  label,
  icon,
  disabled,
  reason,
  loading,
  variant = 'neutral',
  onClick,
  className,
}: HeaderActionButtonProps) {
  const showReason = Boolean(disabled && reason);

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <button
        type="button"
        disabled={disabled || loading || !onClick}
        onClick={onClick}
        aria-label={label}
        aria-disabled={disabled || loading}
        className={cn(
          'sq-press inline-flex min-h-9 max-w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
          variant === 'primary'
            ? 'bg-brand text-brand-foreground hover:bg-brand-hover disabled:opacity-50'
            : 'border border-border surface-premium hover:bg-muted disabled:opacity-50',
          (disabled || loading) && 'cursor-not-allowed',
        )}
      >
        {loading ? (
          <Icon name="loader-2" className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : icon ? (
          <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />
        ) : null}
        <span className="truncate">{label}</span>
      </button>
      {showReason ? (
        <span className="mt-1 text-[10px] leading-snug text-muted-foreground" role="note">
          {reason}
        </span>
      ) : null}
    </div>
  );
}
