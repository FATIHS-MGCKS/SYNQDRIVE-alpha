import type { ApiServiceCase, Vendor } from '../../../lib/api';
import { useLanguage } from '../../../i18n/LanguageContext';
import { DashboardSectionLabel } from '../dashboard/dashboardShell';
import { FleetHealthServiceCaseList } from './FleetHealthServiceCaseList';
import { fhs } from './fleet-health-service-shell';

interface FleetHealthServiceCasesPanelProps {
  serviceCases: ApiServiceCase[];
  vendors: Vendor[];
  dataReady: boolean;
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
}

export function FleetHealthServiceCasesPanel({
  serviceCases,
  vendors,
  dataReady,
  loading,
  error,
  onReload,
}: FleetHealthServiceCasesPanelProps) {
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <div className={fhs.panel}>
        <div className={fhs.panelBody}>
          <DashboardSectionLabel className="mb-1">{t('fleetHealthService.cases.title')}</DashboardSectionLabel>
          <p className={fhs.meta}>
            {t('fleetHealthService.cases.subtitle')}
          </p>
        </div>
      </div>

      <FleetHealthServiceCaseList
        serviceCases={serviceCases}
        vendors={vendors}
        dataReady={dataReady}
        loading={loading}
        error={error}
        onReload={onReload}
      />
    </div>
  );
}
