import type { ReactNode } from 'react';

export const operatorFieldClass =
  'h-12 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-[color:var(--brand)]/40';

export const operatorTextareaClass =
  'min-h-[88px] w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-[color:var(--brand)]/40';

export function OperatorHandoverField({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[11px] text-[color:var(--status-critical)]">{error}</p>}
    </label>
  );
}

export function OperatorToggleRow({
  label,
  checked,
  onChange,
  danger,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`sq-press flex min-h-[48px] w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-medium ${
        checked
          ? danger
            ? 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06]'
            : 'border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]'
          : 'border-border surface-premium'
      }`}
    >
      <span>{label}</span>
      <span
        className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'bg-[color:var(--brand)]' : 'bg-muted'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}
