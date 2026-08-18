import { DataTable, type DataTableColumn } from '../../../components/patterns/data-table';
import type { PlatformIntegrationWebhookRowDto } from '../types';
import { environmentLabel, formatRelativeDe, runtimeHealthLabel } from '../platform-integrations.utils';
import { IntegrationRuntimeHealthChip } from '../components/IntegrationStatusChips';

interface PlatformIntegrationsWebhooksTabProps {
  entries: PlatformIntegrationWebhookRowDto[];
  moduleErrors?: Partial<Record<string, string>>;
}

export function PlatformIntegrationsWebhooksTab({
  entries,
  moduleErrors,
}: PlatformIntegrationsWebhooksTabProps) {
  const columns: DataTableColumn<PlatformIntegrationWebhookRowDto>[] = [
    { key: 'provider', header: 'Provider', cell: (row) => row.provider },
    { key: 'endpoint', header: 'Endpoint', cell: (row) => <code className="text-xs">{row.endpoint}</code> },
    {
      key: 'environment',
      header: 'Environment',
      cell: (row) => environmentLabel(row.environment),
    },
    {
      key: 'signature',
      header: 'Signatur',
      cell: (row) =>
        row.signatureState === 'configured'
          ? 'Konfiguriert'
          : row.signatureState === 'missing'
            ? 'Fehlt'
            : 'Unbekannt',
    },
    {
      key: 'lastEvent',
      header: 'Letztes Event',
      cell: (row) => formatRelativeDe(row.lastEventAt),
      className: 'hidden md:table-cell',
    },
    {
      key: 'health',
      header: 'Zustellung',
      cell: (row) => <IntegrationRuntimeHealthChip state={row.deliveryHealth} />,
    },
  ];

  return (
    <div className="space-y-4" data-testid="platform-integrations-webhooks">
      <p className="text-sm text-muted-foreground">
        Webhook-Signatur-Geheimnisse werden aus Sicherheitsgründen nicht angezeigt.
      </p>
      {Object.keys(moduleErrors ?? {}).length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          Teilweise geladen — Stripe oder Voice konnten nicht vollständig abgefragt werden.
        </div>
      )}
      <DataTable
        columns={columns}
        rows={entries}
        getRowKey={(row) => row.id}
        empty="Keine Webhook-Daten"
      />
    </div>
  );
}
