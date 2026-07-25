import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { OperatorActionGate } from '../lib/operatorPermissionGate.utils';

interface OperatorGatedActionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'title'> {
  gate: OperatorActionGate;
  children: ReactNode;
  /** When false, hide instead of disable (default: false). */
  hideWhenDenied?: boolean;
  deniedHint?: ReactNode;
}

/**
 * Accessible action button that respects an OperatorActionGate (permission + business rules).
 */
export function OperatorGatedActionButton({
  gate,
  children,
  hideWhenDenied = false,
  deniedHint,
  className = '',
  onClick,
  ...rest
}: OperatorGatedActionButtonProps) {
  if (!gate.allowed && hideWhenDenied) return null;

  const disabled = !gate.allowed;
  const title = gate.reason;

  return (
    <div className={deniedHint && disabled ? 'space-y-1' : undefined}>
      <button
        type="button"
        {...rest}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        title={title}
        onClick={disabled ? undefined : onClick}
        className={className}
      >
        {children}
      </button>
      {disabled && deniedHint ? (
        <p className="text-[11px] leading-snug text-muted-foreground" role="note">
          {deniedHint}
        </p>
      ) : null}
      {disabled && !deniedHint && gate.reason ? (
        <p className="sr-only" role="note">
          {gate.reason}
        </p>
      ) : null}
    </div>
  );
}
