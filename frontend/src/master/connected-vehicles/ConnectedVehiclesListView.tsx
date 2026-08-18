import { useEffect } from 'react';
import { Building2, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { DataTable } from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { MasterErrorState, MasterLoadingState, MasterTableShell } from '../shell';
import { useConnectedVehiclesList } from './useConnectedVehiclesOperational';
import type { VehicleOperationalRowDto } from './types';
import {
  CvAttentionChip,
  CvIntegrationChip,
  CvTelemetryChip,
} from './ConnectedVehicleStatusChips';

interface ConnectedVehiclesListViewProps {
  onOpenVehicle: (row: VehicleOperationalRowDto) => void;
  initialFilters?: Record<string, string>;
}

function VehicleMobileCard({
  row,
  onOpen,
}: {
  row: VehicleOperationalRowDto;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left rounded-xl border p-4 transition-colors hover:bg-muted/40 ${
        row.attention.severity === 'critical'
          ? 'border-l-4 border-l-[color:var(--status-critical)]'
          : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{row.displayTitle}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{row.displaySubtitle}</p>
          {row.organizationName ? (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Building2 className="h-3 w-3" aria-hidden />
              {row.organizationName}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Nicht zugeordnet</p>
          )}
        </div>
        <CvAttentionChip attention={row.attention} compact />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <CvIntegrationChip label={row.integrationConnectivityLabel} state={row.integrationConnectivity} />
        <CvTelemetryChip label={row.telemetryLabel} freshness={row.telemetryFreshness} />
        <span className="text-xs text-muted-foreground">{row.lastSignalRelative ?? '—'}</span>
      </div>
    </button>
  );
}

export function ConnectedVehiclesListView({
  onOpenVehicle,
  initialFilters,
}: ConnectedVehiclesListViewProps) {
  const { data, loading, error, query, setQuery, refresh } = useConnectedVehiclesList();
  const rows = data?.data ?? [];
  const meta = data?.meta;
  const page = query.page ?? 1;
  const totalPages = meta?.totalPages ?? 1;

  const updateFilter = (patch: Partial<typeof query>) => {
    setQuery({ ...query, ...patch, page: patch.page ?? 1 });
  };

  useEffect(() => {
    if (!initialFilters || Object.keys(initialFilters).length === 0) return;
    const mapped: Partial<typeof query> = {};
    if (initialFilters.cvSearch) mapped.q = initialFilters.cvSearch;
    if (initialFilters.cvRegistrationState) {
      mapped.registrationState = initialFilters.cvRegistrationState as typeof query.registrationState;
    }
    if (initialFilters.cvIntegration) {
      mapped.integrationConnectivity = initialFilters.cvIntegration as typeof query.integrationConnectivity;
    }
    if (initialFilters.cvTelemetry) {
      mapped.telemetryFreshness = initialFilters.cvTelemetry as typeof query.telemetryFreshness;
    }
    if (initialFilters.cvAttention) {
      mapped.attention = initialFilters.cvAttention as typeof query.attention;
    }
    if (initialFilters.organizationId) mapped.organizationId = initialFilters.organizationId;
    setQuery({ ...query, ...mapped, page: 1 }, true);
  }, [initialFilters]);

  const columns: DataTableColumn<VehicleOperationalRowDto>[] = [
    {
      key: 'vehicle',
      header: 'Fahrzeug',
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{row.displayTitle}</p>
          <p className="text-xs text-muted-foreground truncate">{row.displaySubtitle}</p>
        </div>
      ),
    },
    {
      key: 'organization',
      header: 'Organisation',
      cell: (row) => (
        <span className="text-sm text-foreground">{row.organizationName ?? '—'}</span>
      ),
    },
    {
      key: 'dimo',
      header: 'DIMO',
      cell: (row) => (
        <CvIntegrationChip label={row.integrationConnectivityLabel} state={row.integrationConnectivity} />
      ),
    },
    {
      key: 'telemetry',
      header: 'Telemetrie',
      cell: (row) => (
        <CvTelemetryChip label={row.telemetryLabel} freshness={row.telemetryFreshness} />
      ),
    },
    {
      key: 'signal',
      header: 'Letztes Signal',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{row.lastSignalRelative ?? '—'}</span>
      ),
    },
    {
      key: 'attention',
      header: 'Aufmerksamkeit',
      cell: (row) => <CvAttentionChip attention={row.attention} compact />,
    },
  ];

  const toolbar = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        <input
          type="search"
          placeholder="Suche nach Kennzeichen, Name, VIN, Organisation…"
          className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm"
          value={query.q ?? ''}
          onChange={(e) => updateFilter({ q: e.target.value })}
          aria-label="Fahrzeuge durchsuchen"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={query.registrationState ?? 'registered'}
          onChange={(e) => updateFilter({ registrationState: e.target.value as typeof query.registrationState })}
          aria-label="Registrierungsstatus filtern"
        >
          <option value="registered">Registriert</option>
          <option value="unregistered">Nicht zugeordnet (DIMO)</option>
        </select>
        <select
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={query.integrationConnectivity ?? 'all'}
          onChange={(e) => updateFilter({ integrationConnectivity: e.target.value as typeof query.integrationConnectivity })}
          aria-label="DIMO-Connectivity filtern"
        >
          <option value="all">Alle DIMO-States</option>
          <option value="connected">Verbunden</option>
          <option value="disconnected">Getrennt</option>
          <option value="error">Fehler</option>
          <option value="none">Keine Verknüpfung</option>
        </select>
        <select
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={query.telemetryFreshness ?? 'all'}
          onChange={(e) => updateFilter({ telemetryFreshness: e.target.value as typeof query.telemetryFreshness })}
          aria-label="Telemetrie filtern"
        >
          <option value="all">Alle Telemetrie</option>
          <option value="live">Live</option>
          <option value="standby">Standby</option>
          <option value="signal_delayed">Signal verzögert</option>
          <option value="offline">Offline</option>
          <option value="no_signal">Kein Signal</option>
        </select>
        <select
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={query.attention ?? 'all'}
          onChange={(e) => updateFilter({ attention: e.target.value as typeof query.attention })}
          aria-label="Aufmerksamkeit filtern"
        >
          <option value="all">Alle</option>
          <option value="true">Mit Aufmerksamkeit</option>
          <option value="false">Ohne Aufmerksamkeit</option>
        </select>
        <Button type="button" variant="outline" size="icon" onClick={() => refresh()} aria-label="Liste aktualisieren">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 pt-2">
      <p className="text-xs text-muted-foreground">
        {meta ? `${meta.total} Einträge · Seite ${meta.page} von ${meta.totalPages}` : ''}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => updateFilter({ page: page - 1 })}
          aria-label="Vorherige Seite"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => updateFilter({ page: page + 1 })}
          aria-label="Nächste Seite"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (loading && !data) return <MasterLoadingState variant="table" count={1} />;
  if (error) {
    return (
      <MasterErrorState
        title="Fahrzeuge nicht verfügbar"
        description={error}
        onRetry={() => void refresh()}
      />
    );
  }

  return (
    <MasterTableShell toolbar={toolbar} footer={footer}>
      <div className="hidden md:block">
        <DataTable<VehicleOperationalRowDto>
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.vehicleId ?? row.dimoVehicleId ?? row.displayTitle}
          onRowClick={onOpenVehicle}
          empty="Keine Fahrzeuge für die aktuellen Filter."
          dense
        />
      </div>
      <div className="md:hidden space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Keine Fahrzeuge für die aktuellen Filter.</p>
        ) : (
          rows.map((row) => (
            <VehicleMobileCard key={row.vehicleId ?? row.dimoVehicleId} row={row} onOpen={() => onOpenVehicle(row)} />
          ))
        )}
      </div>
    </MasterTableShell>
  );
}
