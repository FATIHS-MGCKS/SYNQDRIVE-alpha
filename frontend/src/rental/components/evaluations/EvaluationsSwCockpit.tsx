import { useCallback, useMemo, useState } from 'react';
import type { EvaluationsAnalyticsSummaryResponse } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import {
  filterSwCockpitByCategory,
  resolveSwCockpit,
  swCockpitCategoryLabelKey,
} from '@synq/evaluations-insights/evaluations-sw-cockpit';
import type { SwCockpitCategory, SwCockpitFinding } from '@synq/evaluations-insights/evaluations-sw-cockpit.contract';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { EvaluationsSwFindingCard } from './EvaluationsSwFindingCard';
import { EvaluationsSwFindingDetailDrawer } from './EvaluationsSwFindingDetailDrawer';

const CATEGORY_ORDER: SwCockpitCategory[] = [
  'CRITICAL_RISK',
  'RISK',
  'IMPROVEMENT_POTENTIAL',
  'OBSERVATION',
  'STRENGTH',
];

type CategoryFilter = SwCockpitCategory | 'ALL';

interface EvaluationsSwCockpitProps {
  summary: EvaluationsAnalyticsSummaryResponse | null;
  loading: boolean;
}

export function EvaluationsSwCockpit({ summary, loading }: EvaluationsSwCockpitProps) {
  const { t, locale } = useLanguage();
  const analyticsLocale = locale === 'en' ? 'en' : 'de';
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [selectedFinding, setSelectedFinding] = useState<SwCockpitFinding | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const cockpit = useMemo(
    () =>
      resolveSwCockpit({
        strengths: summary?.strengths?.data?.strengths,
        weaknesses: summary?.weaknesses?.data?.weaknesses,
        strengthsStatus: summary?.strengths?.status,
        weaknessesStatus: summary?.weaknesses?.status,
        locale: analyticsLocale,
      }),
    [summary, analyticsLocale],
  );

  const visibleFindings = useMemo(
    () => filterSwCockpitByCategory(cockpit, categoryFilter),
    [cockpit, categoryFilter],
  );

  const handleSelect = useCallback((finding: SwCockpitFinding) => {
    setSelectedFinding(finding);
    setDrawerOpen(true);
  }, []);

  const handleDrawerChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) setSelectedFinding(null);
  }, []);

  const handleFilterKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, filter: CategoryFilter) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setCategoryFilter(filter);
      }
    },
    [],
  );

  if (loading && !summary) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }

  if (cockpit.findings.length === 0) {
    const emptyKey =
      cockpit.emptyReason === 'INSUFFICIENT_DATA'
        ? 'evaluations.swCockpit.empty.insufficientData'
        : cockpit.emptyReason === 'SECTION_ERROR'
          ? 'evaluations.swCockpit.empty.error'
          : cockpit.emptyReason === 'SECTION_UNAVAILABLE'
            ? 'evaluations.swCockpit.empty.unavailable'
            : 'evaluations.swCockpit.empty.noFindings';

    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 px-4 py-8 text-center">
        <p className="text-[13px] font-semibold text-foreground">
          {t('evaluations.swCockpit.empty.title')}
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{t(emptyKey as TranslationKey)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin snap-x snap-mandatory"
        role="toolbar"
        aria-label={t('evaluations.swCockpit.filterLabel')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={categoryFilter === 'ALL'}
          onClick={() => setCategoryFilter('ALL')}
          onKeyDown={(e) => handleFilterKeyDown(e, 'ALL')}
          className={cn(
            'shrink-0 snap-start rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors',
            categoryFilter === 'ALL'
              ? 'bg-foreground text-background'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted',
          )}
        >
          {t('evaluations.swCockpit.filter.all', { count: cockpit.findings.length })}
        </button>
        {CATEGORY_ORDER.filter((cat) => cockpit.categoryCounts[cat] > 0).map((cat) => {
          const labelKey = swCockpitCategoryLabelKey(cat) as TranslationKey;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
              onKeyDown={(e) => handleFilterKeyDown(e, cat)}
              className={cn(
                'shrink-0 snap-start rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors',
                categoryFilter === cat
                  ? 'bg-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {t(labelKey)} ({cockpit.categoryCounts[cat]})
            </button>
          );
        })}
      </div>

      <ul className="space-y-3" role="list" aria-label={t('evaluations.swCockpit.listLabel')}>
        {visibleFindings.map((finding) => (
          <li key={finding.key} role="listitem">
            <EvaluationsSwFindingCard
              finding={finding}
              onSelect={handleSelect}
              isSelected={selectedFinding?.key === finding.key && drawerOpen}
            />
          </li>
        ))}
      </ul>

      {visibleFindings.length === 0 ? (
        <p className="text-center text-[11.5px] text-muted-foreground">
          {t('evaluations.swCockpit.empty.filtered')}
        </p>
      ) : null}

      <EvaluationsSwFindingDetailDrawer
        finding={selectedFinding}
        open={drawerOpen}
        onOpenChange={handleDrawerChange}
      />
    </div>
  );
}
