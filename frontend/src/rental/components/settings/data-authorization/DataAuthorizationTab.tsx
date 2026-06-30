import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonMetricGrid,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { DataAuthorizationDto } from '../../../../lib/api';
import { DataAuthorizationCreateDialog } from './DataAuthorizationCreateDialog';
import { DataAuthorizationDetailDrawer } from './DataAuthorizationDetailDrawer';
import { DataAuthorizationRevokeDialog } from './DataAuthorizationRevokeDialog';
import { AuthRiskChip, AuthSourceChip, AuthStatusChip } from './data-authorization.badges';
import {
  DATA_CATEGORY_OPTIONS,
  labelDataCategory,
  labelProcessor,
  labelPurpose,
  labelScope,
  RISK_OPTIONS,
  SCOPE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  STATUS_OPTIONS,
} from './data-authorization.constants';
import {
  affectedObjectsSummary,
  filterDataAuthorizations,
  formatAuthDate,
  hasActiveDataAuthFilters,
  type DataAuthorizationFilters,
} from './data-authorization.utils';
import { useRentalOrg } from '../../../RentalContext';
import { useDataAuthorizationCenter } from './useDataAuthorizationCenter';

interface Props {
  canWrite?: boolean;
  canManage?: boolean;
}

const DEFAULT_FILTERS: DataAuthorizationFilters = {
  search: '',
  status: 'all',
  sourceType: 'all',
  scope: 'all',
  risk: 'all',
  dataCategory: 'all',
};

interface DataAuthKpiCardProps {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  tone?: 'critical' | 'watch' | 'success' | 'info';
  subdued?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}

function DataAuthKpiCard({
  label,
  value,
  helper,
  icon: MetricIcon,
  tone,
  subdued = false,
  isActive = false,
  onClick,
}: DataAuthKpiCardProps) {
  const isCritical = tone === 'critical' && value > 0;
  const isWatch = tone === 'watch' && value > 0;
  const isSuccess = tone === 'success' && value > 0;
  const isInfo = tone === 'info' && value > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`${label}: ${value}`}
      className={cn(
        'sq-press group relative w-full overflow-hidden border text-left transition-colors duration-200',
        'hover:border-border/60 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        'min-h-[96px] rounded-lg bg-card/55 px-2.5 py-2',
        isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
        isWatch && 'border-[color:var(--status-watch)]/30 bg-card/55',
        isSuccess && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
        isInfo && 'border-border/45 bg-card/55',
        !isCritical && !isWatch && !isSuccess && !isInfo && 'border-border/45',
        isActive && 'ring-2 ring-[color:var(--brand)]/55',
      )}
    >
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1 text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]',
              subdued && 'text-muted-foreground',
              isCritical && 'text-[color:var(--status-critical)]',
              isSuccess && 'text-[color:var(--status-positive)]',
              isWatch && 'text-[color:var(--status-watch)]',
              !subdued && !isCritical && !isSuccess && !isWatch && 'text-foreground',
            )}
          >
            {value}
          </p>
          <p className="mt-1 truncate text-[10px] leading-snug text-muted-foreground">{helper}</p>
        </div>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            isCritical && 'sq-tone-critical',
            isWatch && 'sq-tone-watch',
            isSuccess && 'sq-tone-success',
            isInfo && 'sq-tone-info',
            !isCritical && !isWatch && !isSuccess && !isInfo && 'bg-muted text-muted-foreground',
          )}
        >
          <MetricIcon className="h-3 w-3" />
        </div>
      </div>
      {isCritical ? (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function kpiStatusToTone(
  status: 'success' | 'warning' | 'critical' | 'watch' | 'neutral',
): DataAuthKpiCardProps['tone'] {
  switch (status) {
    case 'success':
      return 'success';
    case 'warning':
      return 'watch';
    case 'critical':
      return 'critical';
    case 'watch':
      return 'watch';
    default:
      return undefined;
  }
}

export function DataAuthorizationTab({ canWrite = false, canManage = false }: Props) {
  const { orgId } = useRentalOrg();
  const {
    authorizations,
    stats,
    loading,
    error,
    actionId,
    load,
    grant,
    revoke,
    syncSystem,
    create,
    fetchById,
  } = useDataAuthorizationCenter(orgId);

  const [filters, setFilters] = useState<DataAuthorizationFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<DataAuthorizationDto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<DataAuthorizationDto | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(
    () => filterDataAuthorizations(authorizations, filters),
    [authorizations, filters],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load(filters);
    }, filters.search.trim() ? 300 : 0);
    return () => window.clearTimeout(handle);
  }, [load, filters.status, filters.sourceType, filters.scope, filters.search]);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  const openDetail = useCallback(async (auth: DataAuthorizationDto) => {
    setSelected(auth);
    setDrawerOpen(true);
    const fresh = await fetchById(auth.id);
    if (fresh) setSelected(fresh);
  }, [fetchById]);

  const handleGrant = async () => {
    if (!selected) return;
    const updated = await grant(selected.id);
    if (updated) setSelected(updated);
  };

  const handleRevokeConfirm = async (reason: string) => {
    if (!revokeTarget) return;
    const updated = await revoke(revokeTarget.id, reason || undefined);
    setRevokeTarget(null);
    if (updated && selected?.id === updated.id) setSelected(updated);
  };

  const kpiCards = useMemo(
    (): Array<{
      id: string;
      label: string;
      value: number;
      hint: string;
      icon: LucideIcon;
      status: 'success' | 'warning' | 'critical' | 'watch' | 'neutral';
      onClick: () => void;
      active: boolean;
    }> => [
      {
        id: 'active',
        label: 'Aktive Freigaben',
        value: stats?.active ?? 0,
        hint: 'Gültige, nicht abgelaufene Freigaben',
        icon: ShieldCheck,
        status: 'success',
        onClick: () => setFilters((f) => ({ ...f, status: 'ACTIVE' })),
        active: filters.status === 'ACTIVE',
      },
      {
        id: 'pending',
        label: 'Ausstehende Anfragen',
        value: stats?.pending ?? 0,
        hint: 'Warten auf Genehmigung',
        icon: Clock,
        status: 'warning',
        onClick: () => setFilters((f) => ({ ...f, status: 'PENDING' })),
        active: filters.status === 'PENDING',
      },
      {
        id: 'highRisk',
        label: 'Hochriskante Freigaben',
        value: stats?.highRisk ?? 0,
        hint: 'Risiko Hoch oder Kritisch',
        icon: ShieldAlert,
        status: 'critical',
        onClick: () => setFilters((f) => ({ ...f, risk: 'HIGH' })),
        active: filters.risk === 'HIGH' || filters.risk === 'CRITICAL',
      },
      {
        id: 'expiring',
        label: 'Läuft bald ab',
        value: stats?.expiringSoon ?? 0,
        hint: 'Ablauf in den nächsten 30 Tagen',
        icon: AlertTriangle,
        status: 'watch',
        onClick: () => setFilters((f) => ({ ...f, status: 'ACTIVE' })),
        active: false,
      },
      {
        id: 'revokedExpired',
        label: 'Widerrufen / Abgelaufen',
        value: (stats?.revoked ?? 0) + (stats?.expired ?? 0),
        hint: `${stats?.revoked ?? 0} widerrufen · ${stats?.expired ?? 0} abgelaufen`,
        icon: ShieldX,
        status: 'neutral',
        onClick: () => setFilters((f) => ({ ...f, status: 'REVOKED' })),
        active: filters.status === 'REVOKED' || filters.status === 'EXPIRED',
      },
    ],
    [stats, filters.status, filters.risk],
  );

  const columns: DataTableColumn<DataAuthorizationDto>[] = useMemo(
    () => [
      {
        key: 'title',
        header: 'Freigabe',
        cell: (auth) => (
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{auth.title}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {labelProcessor(auth)} · {labelScope(auth.scopeKey)}
            </p>
          </div>
        ),
      },
      {
        key: 'source',
        header: 'Quelle',
        className: 'hidden lg:table-cell',
        cell: (auth) => <AuthSourceChip sourceType={auth.sourceType} />,
      },
      {
        key: 'risk',
        header: 'Risiko',
        cell: (auth) => <AuthRiskChip riskKey={auth.riskLevelKey} />,
      },
      {
        key: 'status',
        header: 'Status',
        cell: (auth) => <AuthStatusChip statusKey={auth.statusKey} />,
      },
      {
        key: 'objects',
        header: 'Betroffen',
        className: 'hidden md:table-cell',
        cell: (auth) => (
          <span className="text-[12px] text-muted-foreground">{affectedObjectsSummary(auth)}</span>
        ),
      },
      {
        key: 'chevron',
        header: '',
        className: 'w-8',
        cell: () => <ChevronRight className="w-4 h-4 text-muted-foreground" />,
      },
    ],
    [],
  );

  const selectClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-[var(--brand-soft)]';

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
      <PageHeader
        title="Data Authorization & Consent Center"
        className="mb-4 flex-col gap-2.5 sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        actions={
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end sm:gap-2">
            {canManage && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void syncSystem()}
                disabled={actionId === 'sync'}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', actionId === 'sync' && 'animate-spin')} />
                Systemfreigaben synchronisieren
              </Button>
            )}
            {canWrite && (
              <Button type="button" variant="primary" size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" />
                Freigabe anlegen
              </Button>
            )}
          </div>
        }
      />

      {loading && !stats ? (
        <SkeletonMetricGrid count={5} />
      ) : (
        <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-5">
          {kpiCards.map((card, index) => {
            const Icon = card.icon;
            const tone = kpiStatusToTone(card.status);
            return (
              <div
                key={card.id}
                className={cn(index === kpiCards.length - 1 && 'col-span-2 lg:col-span-1')}
              >
                <DataAuthKpiCard
                  label={card.label}
                  value={card.value}
                  helper={card.hint}
                  icon={Icon}
                  tone={tone}
                  subdued={card.status === 'neutral' && card.value === 0}
                  isActive={card.active}
                  onClick={card.onClick}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="sq-card rounded-2xl border border-border/70 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Filter & Suche</p>
            <p className="text-[11px] text-muted-foreground">
              {filtered.length} von {authorizations.length} Freigaben
            </p>
          </div>
          {hasActiveDataAuthFilters(filters) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold text-[var(--brand)] hover:underline"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Titel, Verarbeiter, Modul, Beschreibung …"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-[var(--brand-soft)]"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filters.sourceType}
            onChange={(e) => setFilters((f) => ({ ...f, sourceType: e.target.value }))}
            className={selectClass}
          >
            {SOURCE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filters.scope}
            onChange={(e) => setFilters((f) => ({ ...f, scope: e.target.value }))}
            className={selectClass}
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filters.risk}
            onChange={(e) => setFilters((f) => ({ ...f, risk: e.target.value }))}
            className={selectClass}
          >
            {RISK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide self-center">
            Datenkategorie:
          </span>
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, dataCategory: 'all' }))}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border ${
              filters.dataCategory === 'all' ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-border'
            }`}
          >
            Alle
          </button>
          {DATA_CATEGORY_OPTIONS.slice(0, 8).map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, dataCategory: cat.value }))}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold border ${
                filters.dataCategory === cat.value
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {cat.label.split(' / ')[0]}
            </button>
          ))}
        </div>
      </div>

      {error && !loading ? (
        <ErrorState title="Laden fehlgeschlagen" description={error} onRetry={() => void load(filters)} />
      ) : loading ? (
        <SkeletonRows rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Shield className="w-8 h-8" />}
          title={hasActiveDataAuthFilters(filters) ? 'Keine Treffer' : 'Noch keine Datenfreigaben vorhanden'}
          description={
            hasActiveDataAuthFilters(filters)
              ? 'Passen Sie die Filter an oder setzen Sie die Suche zurück.'
              : 'Sobald DIMO-verbundene Fahrzeuge vorhanden sind, erstellt SynqDrive automatisch eine DIMO Telemetry Authorization.'
          }
          action={
            !hasActiveDataAuthFilters(filters) && canManage ? (
              <button
                type="button"
                onClick={() => void syncSystem()}
                className="sq-3d-btn sq-3d-btn--primary px-4 py-2.5 rounded-xl text-xs font-semibold"
              >
                Systemfreigaben synchronisieren
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              rows={filtered}
              getRowKey={(a) => a.id}
              onRowClick={openDetail}
            />
          </div>

          <div className="md:hidden space-y-2">
            {filtered.map((auth) => (
              <AuthorizationCard
                key={auth.id}
                auth={auth}
                onClick={() => openDetail(auth)}
              />
            ))}
          </div>
        </>
      )}

      <DataAuthorizationDetailDrawer
        auth={selected}
        orgId={orgId ?? ''}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        canManage={canManage}
        actionLoading={!!selected && actionId === selected.id}
        onGrant={() => void handleGrant()}
        onRevoke={() => selected && setRevokeTarget(selected)}
      />

      <DataAuthorizationRevokeDialog
        open={!!revokeTarget}
        auth={revokeTarget}
        loading={!!revokeTarget && actionId === revokeTarget.id}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={(reason) => void handleRevokeConfirm(reason)}
      />

      <DataAuthorizationCreateDialog
        open={showCreate}
        loading={actionId === 'create'}
        onClose={() => setShowCreate(false)}
        onSubmit={async (payload) => {
          const created = await create(payload);
          if (created) {
            setShowCreate(false);
            setSelected(created);
            setDrawerOpen(true);
          }
        }}
      />
    </div>
  );
}

function AuthorizationCard({
  auth,
  onClick,
}: {
  auth: DataAuthorizationDto;
  onClick: () => void;
}) {
  const purposes = auth.purposes?.length ? auth.purposes : [auth.purpose];
  return (
    <button
      type="button"
      onClick={onClick}
      className="sq-card w-full text-left rounded-2xl border border-border/70 p-4 hover:shadow-[var(--shadow-2)] transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{auth.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
            {auth.description ?? labelProcessor(auth)}
          </p>
        </div>
        <AuthStatusChip statusKey={auth.statusKey} />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <AuthRiskChip riskKey={auth.riskLevelKey} />
        <AuthSourceChip sourceType={auth.sourceType} />
        <StatusChip tone="neutral">{affectedObjectsSummary(auth)}</StatusChip>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {auth.dataCategories.slice(0, 4).map((c) => (
          <StatusChip key={c} tone="neutral">
            {labelDataCategory(c).split(' / ')[0]}
          </StatusChip>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        {purposes.slice(0, 3).map(labelPurpose).join(' · ')} · {formatAuthDate(auth.grantedAt ?? auth.createdAt)}
      </p>
    </button>
  );
}
