import type { ApiServiceCase } from '../../../lib/api';
import { EmptyState, ErrorState, SkeletonCard, StatusChip } from '../../../components/patterns';
import { DashboardSectionLabel } from '../dashboard/dashboardShell';
import { fhs } from './fleet-health-service-shell';
import type { FleetHealthServiceCaseLayer } from './fleet-health-service-case.view-model';

interface FleetHealthServiceCasesPanelProps {
  caseLayer: FleetHealthServiceCaseLayer;
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
}

function caseStatusLabel(status: ApiServiceCase['status']): string {
  switch (status) {
    case 'OPEN':
      return 'Offen';
    case 'SCHEDULED':
      return 'Geplant';
    case 'IN_PROGRESS':
      return 'In Arbeit';
    case 'WAITING_VENDOR':
      return 'Wartet Partner';
    case 'WAITING_PARTS':
      return 'Wartet Teile';
    default:
      return status;
  }
}

export function FleetHealthServiceCasesPanel({
  caseLayer,
  loading,
  error,
  onReload,
}: FleetHealthServiceCasesPanelProps) {
  const cases = caseLayer.kpis.dataReady ? caseLayer.groups.activeCases : [];

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

      {error && !loading ? (
        <ErrorState compact title="Servicefälle konnten nicht geladen werden." description={error}>
          {onReload ? (
            <button
              type="button"
              onClick={onReload}
              className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
            >
              Erneut laden
            </button>
          ) : null}
        </ErrorState>
      ) : null}

      {loading && cases.length === 0 ? (
        <div className="space-y-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {!loading && !error && cases.length === 0 && caseLayer.kpis.dataReady ? (
        <EmptyState
          compact
          title="Keine offenen Servicefälle"
          description="Sobald Wartungs- oder Reparaturfälle angelegt sind, erscheinen sie hier."
        />
      ) : null}

      {cases.length > 0 ? (
        <div className="space-y-2">
          {cases.map((serviceCase) => (
            <div key={serviceCase.id} className={fhs.interactiveRow}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={fhs.rowTitle}>{serviceCase.title}</p>
                  <StatusChip tone="neutral">{caseStatusLabel(serviceCase.status)}</StatusChip>
                  {serviceCase.blocksRental ? (
                    <StatusChip tone="critical">Mietblockade</StatusChip>
                  ) : null}
                </div>
                <p className={fhs.rowBody}>
                  Fahrzeug {serviceCase.vehicleId}
                  {serviceCase.vendorId ? ` · Partner zugewiesen` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
