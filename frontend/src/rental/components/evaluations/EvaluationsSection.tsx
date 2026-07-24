import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { EvaluationsMetricStatus } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';
import type { TranslationKey } from '../../i18n/translations/en';
import { useLanguage } from '../../i18n/LanguageContext';

export type EvaluationsSectionSurfaceState = 'ready' | 'loading' | 'empty' | 'error' | 'partial';

interface EvaluationsSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  sectionStatus?: EvaluationsMetricStatus | null;
  surfaceState?: EvaluationsSectionSurfaceState;
  errorMessage?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

function statusBadgeKey(status: EvaluationsMetricStatus | null | undefined): string | null {
  if (!status || status === 'OK') return null;
  if (status === 'PARTIAL') return 'evaluations.ia.sectionStatus.partial';
  if (status === 'ERROR') return 'evaluations.ia.sectionStatus.error';
  return 'evaluations.ia.sectionStatus.unavailable';
}

export function EvaluationsSection({
  id,
  title,
  subtitle,
  sectionStatus,
  surfaceState = 'ready',
  errorMessage,
  emptyTitle,
  emptyDescription,
  defaultOpen = true,
  actions,
  children,
  className,
}: EvaluationsSectionProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);
  const badgeKey = statusBadgeKey(sectionStatus);

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('surface-premium rounded-2xl border border-border/45 shadow-[var(--shadow-1)] scroll-mt-24', className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-title`} className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">
              {title}
            </h2>
            {badgeKey ? (
              <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide sq-tone-warning">
                {t(badgeKey as TranslationKey)}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-0.5 text-[10.5px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[10px] font-semibold hover:bg-muted/50"
            aria-expanded={open}
            aria-controls={`${id}-body`}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </header>

      {open ? (
        <div id={`${id}-body`} className="p-4">
          {surfaceState === 'loading' ? (
            <SkeletonMetricGrid count={4} className="max-w-3xl" />
          ) : null}
          {surfaceState === 'error' ? (
            <ErrorState compact title={emptyTitle ?? title} description={errorMessage ?? emptyDescription} />
          ) : null}
          {surfaceState === 'empty' ? (
            <EmptyState compact title={emptyTitle ?? title} description={emptyDescription} />
          ) : null}
          {surfaceState === 'ready' || surfaceState === 'partial' ? children : null}
        </div>
      ) : null}
    </section>
  );
}
