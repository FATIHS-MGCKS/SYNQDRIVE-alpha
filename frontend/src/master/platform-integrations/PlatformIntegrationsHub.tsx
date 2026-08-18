import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MasterPageHeader } from '../shell';
import { MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import {
  PLATFORM_INTEGRATIONS_SECTIONS,
  buildEnvironmentSummaryLine,
  formatRelativeDe,
} from './platform-integrations.utils';
import {
  readPlatformIntegrationsLocation,
  syncPlatformIntegrationsUrl,
} from './platform-integrations-url';
import type { PlatformIntegrationsLocation, PlatformIntegrationsSection } from './types';
import {
  usePlatformIntegrationsAttention,
  usePlatformIntegrationsDirectory,
  usePlatformIntegrationsFlags,
  usePlatformIntegrationsWebhooks,
} from './usePlatformIntegrations';
import { PlatformIntegrationsOverviewTab } from './tabs/PlatformIntegrationsOverviewTab';
import { PlatformIntegrationsListTab } from './tabs/PlatformIntegrationsListTab';
import { PlatformIntegrationsWebhooksTab } from './tabs/PlatformIntegrationsWebhooksTab';
import { PlatformIntegrationsSettingsTab } from './tabs/PlatformIntegrationsSettingsTab';
import { PlatformIntegrationsChangelogTab } from './tabs/PlatformIntegrationsChangelogTab';
import { IntegrationDetailDrawer } from './components/IntegrationDetailDrawer';

interface PlatformIntegrationsHubProps {
  onNavigateView?: (view: string, params?: Record<string, string>) => void;
}

export function PlatformIntegrationsHub({ onNavigateView }: PlatformIntegrationsHubProps) {
  const initial = useMemo(() => readPlatformIntegrationsLocation(window.location.search), []);
  const [location, setLocation] = useState<PlatformIntegrationsLocation>(initial);

  const directory = usePlatformIntegrationsDirectory();
  const attention = usePlatformIntegrationsAttention();
  const webhooks = usePlatformIntegrationsWebhooks();
  const flags = usePlatformIntegrationsFlags();

  const navigate = useCallback((patch: Partial<PlatformIntegrationsLocation>, replace = false) => {
    syncPlatformIntegrationsUrl(patch, { replace });
    setLocation((prev) => ({ ...prev, ...patch }));
  }, []);

  const navigateSection = useCallback(
    (section: PlatformIntegrationsSection) => {
      navigate({
        section,
        integrationId: section === 'integrations' ? location.integrationId : null,
      });
    },
    [location.integrationId, navigate],
  );

  useEffect(() => {
    const onPop = () => setLocation(readPlatformIntegrationsLocation(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refreshAll = () => {
    void directory.refresh();
    void attention.refresh();
    void webhooks.refresh();
    void flags.refresh();
  };

  const metaLine = directory.data
    ? `${directory.data.attentionCount} Aufmerksamkeit · ${buildEnvironmentSummaryLine(directory.data.environmentSummary)} · Stand ${formatRelativeDe(directory.data.generatedAt)}`
    : undefined;

  const openDrilldown = (view: string, params?: Record<string, string>) => {
    onNavigateView?.(view, params);
  };

  return (
    <div className="space-y-5" data-testid="platform-integrations-hub">
      <MasterPageHeader
        variant="page"
        title="Integrationen & Plattform"
        meta={metaLine}
        actions={
          <button
            type="button"
            className="sq-btn-secondary flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
            onClick={refreshAll}
            disabled={directory.loading}
            aria-label="Daten neu laden"
          >
            <RefreshCw className={`h-4 w-4 ${directory.loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </button>
        }
        tabs={PLATFORM_INTEGRATIONS_SECTIONS.map((t) => ({ id: t.id, label: t.label }))}
        activeTabId={location.section}
        onTabChange={(id) => navigateSection(id as PlatformIntegrationsSection)}
        tabsAriaLabel="Integrationen und Plattform"
        tabsTestIdPrefix="platform-integrations"
      />

      {location.section === 'overview' && (
        <>
          {directory.loading && !directory.data ? (
            <MasterLoadingState variant="card" count={2} />
          ) : directory.error && !directory.data ? (
            <MasterErrorState title="Übersicht" error={directory.error} onRetry={() => void directory.refresh()} />
          ) : (
            <PlatformIntegrationsOverviewTab
              directory={directory.data}
              attention={attention.data}
              onNavigateIntegrations={(attentionOnly) =>
                navigate({ section: 'integrations', attentionOnly: !!attentionOnly })
              }
              onOpenIntegration={(integrationId) =>
                navigate({ section: 'integrations', integrationId })
              }
            />
          )}
        </>
      )}

      {location.section === 'integrations' && (
        <>
          {directory.loading && !directory.data ? (
            <MasterLoadingState variant="table" count={6} />
          ) : directory.error && !directory.data ? (
            <MasterErrorState title="Integrationen" error={directory.error} onRetry={() => void directory.refresh()} />
          ) : (
            <PlatformIntegrationsListTab
              entries={directory.data?.entries ?? []}
              attentionOnly={location.attentionOnly}
              moduleErrors={directory.data?.moduleErrors}
              onOpenIntegration={(integrationId) => navigate({ integrationId })}
            />
          )}
        </>
      )}

      {location.section === 'webhooks' && (
        <>
          {webhooks.loading && !webhooks.data ? (
            <MasterLoadingState variant="table" count={4} />
          ) : webhooks.error && !webhooks.data ? (
            <MasterErrorState title="Webhooks" error={webhooks.error} onRetry={() => void webhooks.refresh()} />
          ) : (
            <PlatformIntegrationsWebhooksTab
              entries={webhooks.data?.entries ?? []}
              moduleErrors={webhooks.data?.moduleErrors}
            />
          )}
        </>
      )}

      {location.section === 'settings' && (
        <PlatformIntegrationsSettingsTab
          category={location.settingsCategory}
          flags={flags.data}
          onNavigateCategory={(settingsCategory) => navigate({ settingsCategory })}
        />
      )}

      {location.section === 'changelog' && <PlatformIntegrationsChangelogTab />}

      <IntegrationDetailDrawer
        integrationId={location.integrationId}
        onClose={() => navigate({ integrationId: null })}
        onOpenDrilldown={openDrilldown}
      />
    </div>
  );
}
