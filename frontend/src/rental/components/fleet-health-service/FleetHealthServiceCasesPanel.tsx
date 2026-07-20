import type { ApiServiceCase, Vendor } from '../../../lib/api';
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
  return (
    <div className="space-y-3">
      <div className={fhs.panel}>
        <div className={fhs.panelBody}>
          <DashboardSectionLabel className="mb-1">Servicefälle</DashboardSectionLabel>
          <p className={fhs.meta}>
            Kanonische Wartungs- und Reparaturfälle — getrennt von einzelnen Aufgaben.
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
