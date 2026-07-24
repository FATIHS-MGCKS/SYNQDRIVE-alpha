import { HelpCircle } from 'lucide-react';
import {
  financeMetricDescription,
  financeMetricLabel,
  type FinanceMetricId,
  type FinanceMetricLocale,
} from '@synq/finance/finance-metric-definitions';

interface FinanceMetricHintProps {
  metricId: FinanceMetricId;
  locale?: FinanceMetricLocale;
  className?: string;
}

export function FinanceMetricHint({ metricId, locale = 'de', className }: FinanceMetricHintProps) {
  const label = financeMetricLabel(metricId, locale);
  const description = financeMetricDescription(metricId, locale);

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <span>{label}</span>
      <span className="group relative inline-flex">
        <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-[10px] font-normal leading-snug text-popover-foreground shadow-md group-hover:block group-focus-within:block"
        >
          {description}
        </span>
      </span>
    </span>
  );
}

export function financeMetricLabelForLocale(metricId: FinanceMetricId, locale: string): string {
  const loc: FinanceMetricLocale = locale === 'de' ? 'de' : 'en';
  return financeMetricLabel(metricId, loc);
}
