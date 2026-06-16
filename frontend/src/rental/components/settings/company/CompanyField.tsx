import type { ReactNode } from 'react';
import { EMPTY_VALUE, INPUT_CLASS, LABEL_CLASS } from './company-utils';

interface CompanyFieldProps {
  label: string;
  value: string;
  editing: boolean;
  required?: boolean;
  hint?: string;
  warning?: boolean;
  type?: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox';
  options?: Array<{ value: string; label: string }>;
  onChange?: (value: string) => void;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  rows?: number;
}

export function CompanyField({
  label,
  value,
  editing,
  required,
  hint,
  warning,
  type = 'text',
  options,
  onChange,
  checked,
  onCheckedChange,
  rows = 3,
}: CompanyFieldProps) {
  const display = value.trim() ? value : EMPTY_VALUE;
  const isEmpty = !value.trim();

  if (!editing) {
    return (
      <div className="py-2.5 border-b border-border/40 last:border-0">
        <dt className="text-[11px] font-semibold text-muted-foreground mb-1">
          {label}
          {required && <span className="text-[color:var(--status-warning)] ml-0.5">*</span>}
        </dt>
        <dd
          className={`text-xs ${isEmpty ? 'text-muted-foreground italic' : 'text-foreground'}`}
        >
          {type === 'checkbox' ? (checked ? 'Ja' : 'Nein') : display}
        </dd>
        {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
      </div>
    );
  }

  return (
    <div className={type === 'checkbox' ? '' : 'space-y-1'}>
      {type === 'checkbox' ? (
        <label className="flex items-start gap-2 cursor-pointer py-1">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <span className="text-xs text-foreground">{label}</span>
        </label>
      ) : (
        <>
          <label className={LABEL_CLASS}>
            {label}
            {required && <span className="text-[color:var(--status-warning)] ml-0.5">*</span>}
          </label>
          {type === 'select' ? (
            <select
              className={INPUT_CLASS}
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
            >
              <option value="">— Auswählen —</option>
              {options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : type === 'textarea' ? (
            <textarea
              className={`${INPUT_CLASS} resize-y min-h-[72px]`}
              rows={rows}
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
            />
          ) : (
            <input
              type={type}
              className={INPUT_CLASS}
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
            />
          )}
        </>
      )}
      {hint && (
        <p
          className={`text-[10px] ${warning ? 'text-[color:var(--status-warning)]' : 'text-muted-foreground'}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function CompanyFieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">{children}</div>
  );
}

export function CompanyCriticalNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 p-3 rounded-xl border border-[color:var(--status-warning-soft)] bg-[color:var(--status-warning-soft)]/25 text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}
