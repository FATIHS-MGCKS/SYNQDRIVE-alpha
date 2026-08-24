import { MetricCard } from '../../../components/patterns/data-card';
import type { PlatformIntegrationsAttentionSummaryDto, PlatformIntegrationsDirectoryDto } from '../types';
import {
  buildEnvironmentSummaryLine,
  environmentLabel,
  formatRelativeDe,
} from '../platform-integrations.utils';
import {
  IntegrationConfigurationChip,
  IntegrationEnvironmentChip,
  IntegrationRuntimeHealthChip,
  IntegrationScopeChip,
} from '../components/IntegrationStatusChips';

interface PlatformIntegrationsOverviewTabProps {
  directory: PlatformIntegrationsDirectoryDto | null;
  attention: PlatformIntegrationsAttentionSummaryDto | null;
  onNavigateIntegrations: (attentionOnly?: boolean) => void;
  onOpenIntegration: (integrationId: string) => void;
}

export function PlatformIntegrationsOverviewTab({
  directory,
  attention,
  onNavigateIntegrations,
  onOpenIntegration,
}: PlatformIntegrationsOverviewTabProps) {
  const entries = directory?.entries ?? [];
  const attentionCount = directory?.attentionCount ?? 0;
  const healthyCount = entries.filter(
    (e) => e.runtimeHealth === 'healthy' && e.attentionCodes.length === 0,
  ).length;

  return (
    <div className="space-y-5" data-testid="platform-integrations-overview">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Integrationen" value={entries.length} />
        <MetricCard label="Gesund" value={healthyCount} />
        <MetricCard
          label="Aufmerksamkeit"
          value={attentionCount}
          status={attentionCount > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Environment"
          value={buildEnvironmentSummaryLine(directory?.environmentSummary ?? { stripeMode: null, whatsappSimulate: false })}
        />
      </div>

      {attention && attention.topItems.length > 0 && (
        <div className="surface-premium p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold">Aufmerksamkeit erforderlich</h3>
            <button
              type="button"
              className="text-sm text-brand font-semibold"
              onClick={() => onNavigateIntegrations(true)}
            >
              Alle anzeigen
            </button>
          </div>
          <ul className="space-y-2">
            {attention.topItems.slice(0, 6).map((item) => (
              <li key={item.integrationId}>
                <button
                  type="button"
                  className="w-full text-left rounded-xl border border-border/70 px-4 py-3 hover:bg-muted/30"
                  onClick={() => onOpenIntegration(item.integrationId)}
                >
                  <div className="font-medium">{item.integrationName}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.summary}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="surface-premium p-5">
        <h3 className="font-semibold mb-3">Integrations-Health</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onOpenIntegration(entry.id)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted/30 ${
                entry.attentionCodes.length > 0 ? 'border-amber-500/40' : 'border-border/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{entry.name}</span>
                <IntegrationRuntimeHealthChip state={entry.runtimeHealth} />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <IntegrationScopeChip scope={entry.scope} />
                {entry.environment !== 'not_applicable' && (
                  <IntegrationEnvironmentChip environment={entry.environment} />
                )}
                <IntegrationConfigurationChip state={entry.configuration} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">
                {formatRelativeDe(entry.lastHealthCheckAt)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
