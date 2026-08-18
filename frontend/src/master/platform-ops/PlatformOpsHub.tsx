import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MasterPageHeader } from '../shell';
import { MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import { StatusChip } from '../../components/patterns';
import {
  PLATFORM_OPS_SECTIONS,
  platformOpsStateLabel,
  platformOpsStateTone,
} from './platform-ops.utils';
import { usePlatformOpsOverview } from './usePlatformOps';
import {
  readPlatformOpsLocation,
  syncPlatformOpsUrl,
  type PlatformOpsLocation,
} from './platform-ops-url';
import type { PlatformOpsDiagnosticsTab, PlatformOpsProcessingTab, PlatformOpsSection } from './types';
import { PlatformOpsOverviewTab } from './tabs/PlatformOpsOverviewTab';
import { PlatformOpsIncidentsTab } from './tabs/PlatformOpsIncidentsTab';
import { PlatformOpsServicesTab } from './tabs/PlatformOpsServicesTab';
import { PlatformOpsProcessingTabView } from './tabs/PlatformOpsProcessingTab';
import { PlatformOpsInfrastructureTab } from './tabs/PlatformOpsInfrastructureTab';
import { PlatformOpsResilienceTab } from './tabs/PlatformOpsResilienceTab';
import { PlatformOpsDiagnosticsTabView } from './tabs/PlatformOpsDiagnosticsTab';
import { PlatformOpsIncidentDetailDrawer } from './components/PlatformOpsIncidentDetailDrawer';
import { PlatformOpsServiceDetailDrawer } from './components/PlatformOpsServiceDetailDrawer';

interface PlatformOpsHubProps {
  onNavigateView?: (view: string, params?: Record<string, string>) => void;
  onOpenOrganization?: (orgId: string) => void;
}

export function PlatformOpsHub({ onNavigateView, onOpenOrganization }: PlatformOpsHubProps) {
  const initial = useMemo(() => readPlatformOpsLocation(window.location.search), []);
  const [location, setLocation] = useState<PlatformOpsLocation>(initial);
  const overview = usePlatformOpsOverview();

  const navigate = useCallback((patch: Partial<PlatformOpsLocation>, replace = false) => {
    syncPlatformOpsUrl(patch, { replace });
    setLocation((prev) => ({ ...prev, ...patch }));
  }, []);

  const navigateSection = useCallback(
    (section: PlatformOpsSection, tab?: string) => {
      const patch: Partial<PlatformOpsLocation> = { section, incidentId: null, serviceId: null };
      if (section === 'processing' && tab) {
        patch.processingTab = tab as PlatformOpsProcessingTab;
      }
      if (section === 'diagnostics' && tab) {
        patch.diagnosticsTab = tab as PlatformOpsDiagnosticsTab;
      }
      if (section === 'services' && tab) {
        patch.serviceId = tab;
      }
      navigate(patch);
    },
    [navigate],
  );

  useEffect(() => {
    const onPop = () => setLocation(readPlatformOpsLocation(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const globalState = overview.data?.globalPlatformState ?? 'unknown';

  return (
    <div className="space-y-5" data-testid="platform-ops-hub">
      <MasterPageHeader
        variant="context"
        title="Plattform & Betrieb"
        description="Plattformzustand, Vorfälle, Dienste und Resilienz"
        status={
          <StatusChip tone={platformOpsStateTone(globalState)} dot>
            {platformOpsStateLabel(globalState)}
          </StatusChip>
        }
        actions={
          <button
            type="button"
            className="sq-btn-secondary flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
            onClick={() => void overview.refresh()}
            disabled={overview.loading}
            aria-label="Daten neu laden"
          >
            <RefreshCw className={`w-4 h-4 ${overview.loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </button>
        }
        tabs={PLATFORM_OPS_SECTIONS.map((t) => ({ id: t.id, label: t.label }))}
        activeTabId={location.section}
        onTabChange={(id) => navigateSection(id as PlatformOpsSection)}
      />

      {location.section === 'overview' && (
        <>
          {overview.loading && !overview.data ? (
            <MasterLoadingState variant="card" count={2} />
          ) : overview.error ? (
            <MasterErrorState title="Plattform & Betrieb" error={overview.error} onRetry={() => void overview.refresh()} />
          ) : overview.data ? (
            <PlatformOpsOverviewTab
              data={overview.data}
              isStale={overview.isStale || overview.data.isStale}
              onRefresh={() => void overview.refresh()}
              onNavigateSection={(section, tab) => navigateSection(section as PlatformOpsSection, tab)}
              onOpenIncident={(id) => navigate({ section: 'incidents', incidentId: id })}
            />
          ) : null}
        </>
      )}

      {location.section === 'incidents' && (
        <PlatformOpsIncidentsTab
          selectedIncidentId={location.incidentId}
          onOpenIncident={(id) => navigate({ incidentId: id })}
          onCloseIncident={() => navigate({ incidentId: null }, true)}
          onOpenOrganization={onOpenOrganization}
        />
      )}

      {location.section === 'services' && (
        <PlatformOpsServicesTab
          selectedServiceId={location.serviceId}
          onOpenService={(id) => navigate({ serviceId: id })}
          onCloseService={() => navigate({ serviceId: null }, true)}
          onNavigateView={onNavigateView}
        />
      )}

      {location.section === 'processing' && (
        <PlatformOpsProcessingTabView
          activeTab={location.processingTab}
          onTabChange={(tab) => navigate({ processingTab: tab })}
        />
      )}

      {location.section === 'infrastructure' && <PlatformOpsInfrastructureTab />}

      {location.section === 'resilience' && <PlatformOpsResilienceTab />}

      {location.section === 'diagnostics' && (
        <PlatformOpsDiagnosticsTabView
          activeTab={location.diagnosticsTab}
          onTabChange={(tab) => navigate({ diagnosticsTab: tab })}
        />
      )}

      {location.incidentId && location.section !== 'incidents' && (
        <PlatformOpsIncidentDetailDrawer
          incidentId={location.incidentId}
          onClose={() => navigate({ incidentId: null }, true)}
          onOpenOrganization={onOpenOrganization}
        />
      )}

      {location.serviceId && location.section !== 'services' && (
        <PlatformOpsServiceDetailDrawer
          serviceId={location.serviceId}
          onClose={() => navigate({ serviceId: null }, true)}
          onNavigateView={onNavigateView}
        />
      )}
    </div>
  );
}
