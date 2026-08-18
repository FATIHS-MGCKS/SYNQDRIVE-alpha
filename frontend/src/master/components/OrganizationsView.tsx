import { useMemo, useState } from 'react';
import {
  Building2, Search, Plus, MoreHorizontal, ChevronRight,
  RefreshCw, ChevronLeft,
} from 'lucide-react';
import {
  DataTable, StatusChip, AppDialog,
} from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';
import {
  MasterPageHeader, MasterTableShell, MasterLoadingState, MasterErrorState, MasterEmptyState,
} from '../shell';
import { Button } from '../../components/ui/button';
import { useOrganizationsOperational } from '../organizations/useOrganizationsOperational';
import type { OrganizationOperationalRowDto } from '../organizations/types';
import {
  attentionReasonLabel,
  attentionSeverityTone,
  billingHealthLabel,
  billingHealthTone,
  formatRelativeDe,
  orgStatusTone,
  subscriptionStatusTone,
} from '../organizations/org.utils';
import { OrganizationCreateWizard } from './OrganizationCreateWizard';

interface OrganizationsViewProps {
  onSelectOrg: (orgId: string, opts?: { focusIssues?: boolean }) => void;
  onAddOrg: (
    payload: {
      companyName: string;
      shortCode?: string;
      businessType: string;
      city?: string;
      country?: string;
      email?: string;
      status?: string;
    },
    adminData?: { name: string; email: string; password: string } | null,
  ) => Promise<void>;
}

function AttentionCell({ row }: { row: OrganizationOperationalRowDto }) {
  const { attention } = row;
  if (attention.severity === 'none') {
    return <span className="text-muted-foreground text-sm" aria-hidden>—</span>;
  }
  return (
    <div className="flex items-center gap-1.5" title={attention.reasons.map(attentionReasonLabel).join(', ')}>
      <StatusChip tone={attentionSeverityTone(attention.severity)} className="!text-xs">
        {attention.reasonCount}
      </StatusChip>
    </div>
  );
}

function OrgMobileCard({
  row,
  onOpen,
}: {
  row: OrganizationOperationalRowDto;
  onOpen: () => void;
}) {
  const critical = row.attention.severity === 'critical';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left rounded-xl border p-4 transition-colors hover:bg-muted/40 ${
        critical ? 'border-l-4 border-l-[color:var(--status-critical)]' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{row.companyName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[row.city, row.country].filter(Boolean).join(' · ')}
          </p>
        </div>
        {row.attention.severity !== 'none' && (
          <StatusChip tone={attentionSeverityTone(row.attention.severity)} className="!text-xs shrink-0">
            {row.attention.reasonCount}
          </StatusChip>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <StatusChip tone={subscriptionStatusTone(row.subscriptionStatus)} className="!text-xs">
          Abo: {row.subscriptionStatusLabel}
        </StatusChip>
        <StatusChip tone={billingHealthTone(row.billingHealth)} className="!text-xs">
          Abrechnung: {billingHealthLabel(row.billingHealth)}
        </StatusChip>
        <span className="text-muted-foreground tabular-nums">
          {row.connectedVehicleCount}/{row.billableVehicleCount} Fzg.
        </span>
        <span className="text-muted-foreground">{formatRelativeDe(row.lastActiveAt)}</span>
      </div>
    </button>
  );
}

export function OrganizationsView({ onSelectOrg, onAddOrg }: OrganizationsViewProps) {
  const { data, loading, error, query, setQuery, refresh } = useOrganizationsOperational();
  const [showCreate, setShowCreate] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const page = query.page ?? 1;
  const totalPages = meta?.totalPages ?? 1;

  const columns = useMemo<DataTableColumn<OrganizationOperationalRowDto>[]>(() => [
    {
      key: 'org',
      header: 'Organisation',
      cell: (row) => (
        <div className="min-w-[180px]">
          <p className="text-sm font-semibold text-foreground">{row.companyName}</p>
          <p className="text-xs text-muted-foreground">
            {[row.city, row.country].filter(Boolean).join(', ')}
            {row.shortCode ? ` · ${row.shortCode}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <StatusChip tone={orgStatusTone(row.orgStatus)} className="!text-xs">
          {row.orgStatusLabel}
        </StatusChip>
      ),
    },
    {
      key: 'subscription',
      header: 'Abo',
      cell: (row) => (
        <StatusChip tone={subscriptionStatusTone(row.subscriptionStatus)} className="!text-xs">
          {row.subscriptionStatusLabel}
        </StatusChip>
      ),
    },
    {
      key: 'billing',
      header: 'Abrechnung',
      cell: (row) => (
        <StatusChip tone={billingHealthTone(row.billingHealth)} className="!text-xs">
          {billingHealthLabel(row.billingHealth)}
        </StatusChip>
      ),
    },
    {
      key: 'vehicles',
      header: 'Fahrzeuge',
      align: 'right',
      numeric: true,
      cell: (row) => (
        <span className="text-sm tabular-nums font-medium">
          {row.connectedVehicleCount}/{row.billableVehicleCount}
        </span>
      ),
    },
    {
      key: 'attention',
      header: 'Aufmerksamkeit',
      align: 'center',
      cell: (row) => <AttentionCell row={row} />,
    },
    {
      key: 'lastActive',
      header: 'Zuletzt aktiv',
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{formatRelativeDe(row.lastActiveAt)}</span>
      ),
    },
  ], []);

  const updateFilter = (patch: Partial<typeof query>) => {
    setQuery({ ...query, ...patch, page: patch.page ?? 1 });
  };

  const toolbar = (
    <div className="surface-premium p-4 space-y-3">
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl border border-border bg-[color:var(--input-background)]">
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search"
            aria-label="Organisationen suchen"
            placeholder="Suchen…"
            value={query.search ?? ''}
            onChange={(e) => updateFilter({ search: e.target.value })}
            className="flex-1 bg-transparent outline-none text-sm text-foreground"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Org-Status"
            value={query.orgStatus ?? 'all'}
            onChange={(e) => updateFilter({ orgStatus: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-3 py-2 rounded-lg border text-xs font-semibold bg-muted border-border"
          >
            <option value="all">Alle Status</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="PENDING">Einrichtung</option>
            <option value="SUSPENDED">Gesperrt</option>
            <option value="ARCHIVED">Archiviert</option>
          </select>
          <select
            aria-label="Abo-Status"
            value={query.subscriptionStatus ?? 'all'}
            onChange={(e) => updateFilter({ subscriptionStatus: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-3 py-2 rounded-lg border text-xs font-semibold bg-muted border-border"
          >
            <option value="all">Alle Abos</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="TRIALING">Testphase</option>
            <option value="PAST_DUE">Überfällig</option>
            <option value="CANCELLED">Gekündigt</option>
            <option value="NONE">Kein Abo</option>
          </select>
          <select
            aria-label="Handlungsbedarf"
            value={query.attention ?? 'all'}
            onChange={(e) => updateFilter({ attention: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-3 py-2 rounded-lg border text-xs font-semibold bg-muted border-border"
          >
            <option value="all">Handlungsbedarf</option>
            <option value="yes">Ja</option>
            <option value="critical">Kritisch</option>
            <option value="warning">Warnung</option>
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowMoreFilters((v) => !v)}>
            Weitere Filter
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} aria-label="Aktualisieren">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {showMoreFilters && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
          <select
            aria-label="Abrechnung"
            value={query.billingHealth ?? 'all'}
            onChange={(e) => updateFilter({ billingHealth: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-3 py-2 rounded-lg border text-xs font-semibold bg-muted border-border"
          >
            <option value="all">Abrechnung</option>
            <option value="ok">OK</option>
            <option value="warning">Warnung</option>
            <option value="critical">Kritisch</option>
          </select>
          <select
            aria-label="Konnektivität"
            value={query.connectivity ?? 'all'}
            onChange={(e) => updateFilter({ connectivity: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-3 py-2 rounded-lg border text-xs font-semibold bg-muted border-border"
          >
            <option value="all">Konnektivität</option>
            <option value="ok">OK</option>
            <option value="degraded">Eingeschränkt</option>
            <option value="critical">Kritisch</option>
          </select>
          <select
            aria-label="Stripe-Sync"
            value={query.syncStatus ?? 'all'}
            onChange={(e) => updateFilter({ syncStatus: e.target.value === 'all' ? undefined : e.target.value })}
            className="px-3 py-2 rounded-lg border text-xs font-semibold bg-muted border-border"
          >
            <option value="all">Stripe-Sync</option>
            <option value="SYNCED">Synced</option>
            <option value="PARTIAL">Partial</option>
            <option value="MISSING">Missing</option>
            <option value="NONE">None</option>
          </select>
        </div>
      )}
    </div>
  );

  const paginationFooter = meta && meta.total > 0 ? (
    <div className="flex items-center justify-between px-2 py-3 text-sm text-muted-foreground">
      <span>
        Seite {page} von {totalPages} · {meta.total} Organisationen
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => updateFilter({ page: page - 1 })}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => updateFilter({ page: page + 1 })}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <MasterPageHeader
        title="Organisationen"
        description="Mandanten-Index — Status, Abrechnung und Handlungsbedarf"
        actions={(
          <Button type="button" onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Organisation anlegen
          </Button>
        )}
      />

      <MasterTableShell toolbar={toolbar} footer={paginationFooter}>
        {loading && !data && <MasterLoadingState variant="table" />}
        {error && !data && (
          <MasterErrorState title="Organisationen" error={error} onRetry={() => void refresh()} />
        )}
        {!loading && !error && rows.length === 0 && (
          <MasterEmptyState
            icon={<Building2 className="w-8 h-8" />}
            title="Keine Organisationen"
            description="Keine Treffer für die aktuellen Filter."
            action={(
              <Button type="button" variant="outline" size="sm" onClick={() => setQuery({ page: 1, limit: 25 })}>
                Filter zurücksetzen
              </Button>
            )}
          />
        )}
        {!error && rows.length > 0 && (
          <>
            <div className="hidden md:block">
              <DataTable
                columns={columns}
                rows={rows}
                getRowKey={(r) => r.id}
                onRowClick={(r) => onSelectOrg(r.id)}
                dense
                loading={loading}
                getRowClassName={(r) =>
                  r.attention.severity !== 'none' ? 'border-l-2 border-l-[color:var(--status-watch)]' : ''
                }
                rowActions={(r) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Aktionen für ${r.companyName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOrg(r.id);
                    }}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                )}
              />
            </div>
            <div className="md:hidden space-y-3">
              {rows.map((row) => (
                <OrgMobileCard key={row.id} row={row} onOpen={() => onSelectOrg(row.id)} />
              ))}
            </div>
          </>
        )}
      </MasterTableShell>

      <OrganizationCreateWizard
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={onAddOrg}
      />
    </>
  );
}
