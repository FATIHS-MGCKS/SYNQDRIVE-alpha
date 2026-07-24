import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/patterns';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';
import { useLanguage } from '../i18n/LanguageContext';
import { useEvaluationsAnalyticsFilters } from '../hooks/useEvaluationsAnalyticsFilters';
import { useEvaluationsAnalyticsSummary } from '../hooks/useEvaluationsAnalyticsSummary';
import { useEvaluationsInsightsAnalytics } from '../hooks/useEvaluationsInsightsAnalytics';
import { useEvaluationsInvoiceData } from '../hooks/useEvaluationsInvoiceData';
import {
  buildSummaryExportRows,
  summaryExportToCsv,
} from '@synq/evaluations-insights/evaluations-metric-state';
import type { EvaluationsDataQualityNavigationOptions } from '../lib/evaluations-data-quality-navigation';
import { EvaluationsSectionNav } from './evaluations/EvaluationsSectionNav';
import { EvaluationsGlobalFiltersSection } from './evaluations/sections/EvaluationsGlobalFiltersSection';
import { EvaluationsExecutiveSummarySection } from './evaluations/sections/EvaluationsExecutiveSummarySection';
import { EvaluationsStrengthsWeaknessesSection } from './evaluations/sections/EvaluationsStrengthsWeaknessesSection';
import { EvaluationsRisksSection } from './evaluations/sections/EvaluationsRisksSection';
import { EvaluationsFinanceSection } from './evaluations/sections/EvaluationsFinanceSection';
import { EvaluationsFleetSection } from './evaluations/sections/EvaluationsFleetSection';
import { EvaluationsCostsDowntimeSection } from './evaluations/sections/EvaluationsCostsDowntimeSection';
import { EvaluationsActionsSection } from './evaluations/sections/EvaluationsActionsSection';
import { EvaluationsDataQualitySection } from './evaluations/sections/EvaluationsDataQualitySection';
import type { DashboardInsight } from '../DashboardInsightsContext';
import { api } from '../../lib/api';

interface EvaluationsPageProps {
  isDarkMode: boolean;
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void;
}

export function EvaluationsPage({ isDarkMode, onNavigate }: EvaluationsPageProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const { t, locale } = useLanguage();
  const analyticsLocale = locale === 'en' ? 'en' : 'de';

  const { filters, filterKey, patchFilters } = useEvaluationsAnalyticsFilters();
  const analytics = useEvaluationsAnalyticsSummary({ orgId, filters, filterKey, locale: analyticsLocale });
  const insights = useEvaluationsInsightsAnalytics({ orgId, filters, filterKey, listLimit: 50 });
  const invoiceData = useEvaluationsInvoiceData(orgId);

  const [stationOptions, setStationOptions] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    if (!orgId) {
      setStationOptions([]);
      return;
    }
    let cancelled = false;
    api.stations
      .list(orgId)
      .then((stations) => {
        if (cancelled) return;
        const arr = Array.isArray(stations) ? stations : [];
        setStationOptions(arr.map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
      })
      .catch(() => {
        if (!cancelled) setStationOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const vehicleLabelById = useMemo(() => {
    const m = new Map<string, { license: string; model: string }>();
    for (const v of fleetVehicles) {
      m.set(v.id, { license: v.license || '', model: `${v.make ?? ''} ${v.model ?? ''}`.trim() });
    }
    return m;
  }, [fleetVehicles]);

  const businessRisks = insights.businessRisks as DashboardInsight[];
  const revenueLeakage = insights.revenueLeakage as DashboardInsight[];

  const handleExportSummary = useCallback(() => {
    if (!analytics.summary) return;
    const rows = buildSummaryExportRows(analytics.summary, analyticsLocale);
    const csv = summaryExportToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auswertungen-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analytics.summary, analyticsLocale]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={t('nav.financialInsights')} />
        <button
          type="button"
          onClick={handleExportSummary}
          disabled={!analytics.summary}
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold sq-tone-neutral disabled:opacity-50"
        >
          {t('evaluations.ia.exportCsv')}
        </button>
      </div>

      <EvaluationsSectionNav />

      <div className="space-y-4">
        <EvaluationsGlobalFiltersSection
          filters={filters}
          onPatchFilters={patchFilters}
          stationOptions={stationOptions}
          analytics={analytics}
        />
        <EvaluationsExecutiveSummarySection analytics={analytics} />
        <EvaluationsStrengthsWeaknessesSection summary={analytics.summary} loading={analytics.loading} />
        <EvaluationsRisksSection
          analytics={analytics}
          businessRisks={businessRisks}
          revenueLeakage={revenueLeakage}
          insightsLoading={insights.loading}
          isDarkMode={isDarkMode}
        />
        <EvaluationsFinanceSection
          analytics={analytics}
          invoiceData={invoiceData}
          isDarkMode={isDarkMode}
          vehicleLabelById={vehicleLabelById}
        />
        <EvaluationsFleetSection analytics={analytics} />
        <EvaluationsCostsDowntimeSection analytics={analytics} />
        <EvaluationsActionsSection
          businessRisks={businessRisks}
          revenueLeakage={revenueLeakage}
          insightsLoading={insights.loading}
          isDarkMode={isDarkMode}
        />
        <EvaluationsDataQualitySection analytics={analytics} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
