import { HelpCircle } from 'lucide-react';
import { FORECAST_TERM_DEFINITIONS } from '../../lib/evaluations-forecast-view-model';

export function ForecastTermTooltip({ term, label }: { term: keyof typeof FORECAST_TERM_DEFINITIONS; label?: string }) {
  const text = FORECAST_TERM_DEFINITIONS[term];
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1 group relative">
      <span>{label ?? term}</span>
      <HelpCircle
        className="h-3 w-3 text-muted-foreground shrink-0"
        aria-hidden
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-56 rounded-md border border-border bg-popover px-2 py-1.5 text-[10px] leading-snug text-popover-foreground shadow-md group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
