import { DataTable, type DataTableColumn } from '../../../components/patterns/data-table';
import type { PlatformIntegrationDirectoryEntryDto } from '../types';
import { attentionLabel, formatRelativeDe } from '../platform-integrations.utils';
import {
  IntegrationConfigurationChip,
  IntegrationEnvironmentChip,
  IntegrationRuntimeHealthChip,
  IntegrationScopeChip,
} from '../components/IntegrationStatusChips';

interface PlatformIntegrationsListTabProps {
  entries: PlatformIntegrationDirectoryEntryDto[];
  attentionOnly: boolean;
  onOpenIntegration: (integrationId: string) => void;
  moduleErrors?: Partial<Record<string, string>>;
}

export function PlatformIntegrationsListTab({
  entries,
  attentionOnly,
  onOpenIntegration,
  moduleErrors,
}: PlatformIntegrationsListTabProps) {
  const filtered = attentionOnly
    ? entries.filter((e) => e.attentionCodes.length > 0)
    : entries;

  const columns: DataTableColumn<PlatformIntegrationDirectoryEntryDto>[] = [
    {
      key: 'name',
      header: 'Integration',
      cell: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          <div className="text-xs text-muted-foreground line-clamp-1">{row.purpose}</div>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      cell: (row) => <IntegrationScopeChip scope={row.scope} />,
      className: 'hidden md:table-cell',
    },
    {
      key: 'environment',
      header: 'Environment',
      cell: (row) =>
        row.environment === 'not_applicable' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <IntegrationEnvironmentChip environment={row.environment} />
        ),
    },
    {
      key: 'configuration',
      header: 'Konfiguration',
      cell: (row) => <IntegrationConfigurationChip state={row.configuration} />,
      className: 'hidden lg:table-cell',
    },
    {
      key: 'runtime',
      header: 'Laufzeit',
      cell: (row) => <IntegrationRuntimeHealthChip state={row.runtimeHealth} />,
    },
    {
      key: 'attention',
      header: 'Aufmerksamkeit',
      cell: (row) =>
        row.attentionCodes.length > 0 ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-200">
            {attentionLabel(row.attentionCodes[0])}
            {row.attentionCodes.length > 1 ? ` +${row.attentionCodes.length - 1}` : ''}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      className: 'hidden sm:table-cell',
    },
    {
      key: 'activity',
      header: 'Letzte Aktivität',
      cell: (row) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatRelativeDe(row.lastActivityAt ?? row.lastHealthCheckAt)}
        </span>
      ),
      className: 'hidden xl:table-cell',
    },
  ];

  return (
    <div className="space-y-4" data-testid="platform-integrations-list">
      {Object.keys(moduleErrors ?? {}).length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          Einige Integrationen konnten nur teilweise geladen werden. Angezeigt wird der letzte bekannte Stand.
        </div>
      )}
      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(row) => row.id}
        onRowClick={(row) => onOpenIntegration(row.id)}
        empty={attentionOnly ? 'Keine Integrationen mit Aufmerksamkeit' : 'Keine Integrationen'}
      />
    </div>
  );
}
