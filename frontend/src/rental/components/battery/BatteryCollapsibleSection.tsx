import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

export interface BatteryCollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function BatteryCollapsibleSection({
  title,
  children,
  defaultOpen = false,
  className = '',
}: BatteryCollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-lg border border-border bg-muted/40 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-border px-4 py-3 space-y-2">{children}</div>}
    </div>
  );
}

export function BatteryMetricTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string | null;
  tone?: 'neutral' | 'brand' | 'success' | 'watch';
}) {
  const toneClass =
    tone === 'brand'
      ? 'sq-tone-brand'
      : tone === 'success'
        ? 'sq-tone-success'
        : tone === 'watch'
          ? 'sq-tone-watch'
          : 'bg-muted';

  return (
    <div className={`rounded-lg px-4 py-3 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
      {hint && <p className="text-[9px] mt-0.5 text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

export function BatterySliceQualityRow({
  items,
}: {
  items: Array<{ label: string; status: string | null }>;
}) {
  const { t } = useLanguage();
  const visible = items.filter((i) => i.status);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
          title={item.status ? t(`health.battery.dataQuality.${item.status}` as TranslationKey) : undefined}
        >
          <span>{item.label}</span>
          <span className="text-foreground">{item.status ? t(`health.battery.dataQuality.short.${item.status}` as TranslationKey) : '—'}</span>
        </span>
      ))}
    </div>
  );
}
