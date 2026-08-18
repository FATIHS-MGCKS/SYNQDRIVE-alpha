import {
  Building2, CreditCard, ExternalLink, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  DataTable, StatusChip, ConfirmDialog, EmptyState, MetricCard, SectionHeader,
  HealthStatusChip, StatusDot, fleetVehicleStatusTone, onlineSignalTone,
} from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';
import {
  MasterPageHeader, MasterLoadingState, MasterErrorState, MasterPageSection,
} from '../shell';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { useOrganizationDetail } from '../organizations/useOrganizationsOperational';
import {
  ORG_DETAIL_TABS,
  type BillingOrganizationRow,
  type OrgActivityRow,
  type OrgDetailTab,
  type OrgUserRow,
  type OrgVehicleRow,
} from '../organizations/types';
import {
  attentionDrilldownTab,
  attentionReasonLabel,
  attentionSeverityTone,
  billingHealthLabel,
  billingHealthTone,
  connectivityHealthLabel,
  connectivityHealthTone,
  formatDateDe,
  formatRelativeDe,
  maskId,
  orgStatusTone,
  readOrgTabFromUrl,
  subscriptionStatusTone,
  writeOrgTabToUrl,
} from '../organizations/org.utils';
import type { OrganizationOperationalDetailDto } from '../organizations/types';

interface OrganizationDetailViewProps {
  orgId: string;
  onBack: () => void;
  onOpenBillingCenter?: (orgId: string) => void;
  onNavigateToVehicle?: (vehicleId: string) => void;
  onDeleteOrg: (orgId: string, reason: string) => Promise<void>;
  onUpdateOrg: (orgId: string, data: Record<string, unknown>) => Promise<void>;
}

function IssuesSection({
  detail,
  onTab,
}: {
  detail: OrganizationOperationalDetailDto;
  onTab: (tab: OrgDetailTab) => void;
}) {
  if (detail.attention.reasons.length === 0) return null;
  const reasons = detail.attention.reasons.slice(0, 5);
  return (
    <MasterPageSection title="Handlungsbedarf" className="border-[color:var(--status-watch)]/30">
      <ul className="space-y-2">
        {reasons.map((code) => (
          <li key={code} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <StatusChip
                tone={code.includes('CRITICAL') || code === 'RECONCILIATION_DRIFT' ? 'critical' : 'warning'}
                className="!text-xs shrink-0"
              >
                {code.includes('CRITICAL') || code === 'RECONCILIATION_DRIFT' ? 'Kritisch' : 'Warnung'}
              </StatusChip>
              <span className="text-sm truncate">{attentionReasonLabel(code)}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onTab(attentionDrilldownTab(code) as OrgDetailTab)}
            >
              Öffnen
            </Button>
          </li>
        ))}
      </ul>
    </MasterPageSection>
  );
}

function OverviewTab({
  detail,
  onTab,
}: {
  detail: OrganizationOperationalDetailDto;
  onTab: (tab: OrgDetailTab) => void;
}) {
  const conn = detail.connectivity;
  return (
    <div className="space-y-4">
      <IssuesSection detail={detail} onTab={onTab} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatusChip tone={orgStatusTone(detail.orgStatus)} dot className="justify-center py-3">
          Organisation: {detail.orgStatusLabel}
        </StatusChip>
        <StatusChip tone={billingHealthTone(detail.billingHealth)} dot className="justify-center py-3">
          Abrechnung: {billingHealthLabel(detail.billingHealth)}
        </StatusChip>
        <StatusChip tone={connectivityHealthTone(detail.connectivityHealth)} dot className="justify-center py-3">
          Konnektivität: {connectivityHealthLabel(detail.connectivityHealth)}
        </StatusChip>
        <StatusChip
          tone={
            detail.integrations.some((i) => i.status === 'ERROR')
              ? 'critical'
              : detail.integrations.some((i) => i.status === 'ACTIVE')
                ? 'success'
                : 'neutral'
          }
          dot
          className="justify-center py-3"
        >
          Integrationen:{' '}
          {detail.integrations.some((i) => i.status === 'ERROR')
            ? 'Fehler'
            : detail.integrations.filter((i) => i.status === 'ACTIVE').length > 0
              ? 'OK'
              : '—'}
        </StatusChip>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button type="button" onClick={() => onTab('users')} className="text-left">
          <MetricCard label="Aktive Nutzer" value={String(detail.activeMembershipCount)} />
        </button>
        <button type="button" onClick={() => onTab('vehicles')} className="text-left">
          <MetricCard
            label="Fahrzeuge"
            value={`${detail.connectedVehicleCount} / ${detail.billableVehicleCount}`}
          />
        </button>
        <button type="button" onClick={() => onTab('billing')} className="text-left">
          <MetricCard label="Tarif" value={detail.tariffLabel ?? '—'} />
        </button>
        <button type="button" onClick={() => onTab('billing')} className="text-left">
          <MetricCard
            label="Nächste Abbuchung"
            value={detail.nextChargeAt ? formatDateDe(detail.nextChargeAt) : '—'}
          />
        </button>
      </div>

      {detail.integrations.length > 0 && (
        <MasterPageSection title="Integrationen">
          <div className="flex flex-wrap gap-2 text-sm">
            {detail.integrations.slice(0, 4).map((i) => (
              <span key={i.slug} className="rounded-lg border border-border px-3 py-1.5">
                {i.name} · {i.statusLabel}
              </span>
            ))}
            {detail.integrations.length > 4 && (
              <Button type="button" variant="link" size="sm" onClick={() => onTab('integrations')}>
                Alle Integrationen
              </Button>
            )}
          </div>
        </MasterPageSection>
      )}

      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
          Technische Details
        </summary>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Organisations-ID</dt>
            <dd className="font-mono text-xs">{detail.id}</dd>
          </div>
          {detail.shortCode && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Kürzel</dt>
              <dd>{detail.shortCode}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Erstellt</dt>
            <dd>{formatDateDe(detail.createdAt)}</dd>
          </div>
          {conn && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">DIMO-Fahrzeuge</dt>
              <dd>{conn.dimoLinkedVehicles}</dd>
            </div>
          )}
        </dl>
      </details>
    </div>
  );
}

export function OrganizationDetailView({
  orgId,
  onBack,
  onOpenBillingCenter,
  onNavigateToVehicle,
  onDeleteOrg,
  onUpdateOrg,
}: OrganizationDetailViewProps) {
  const { detail, loading, error, refresh } = useOrganizationDetail(orgId);
  const [activeTab, setActiveTab] = useState<OrgDetailTab>(() =>
    (readOrgTabFromUrl() as OrgDetailTab) || 'overview',
  );

  const [users, setUsers] = useState<OrgUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<OrgVehicleRow[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);

  const [billing, setBilling] = useState<BillingOrganizationRow | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const [activity, setActivity] = useState<OrgActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityMode, setActivityMode] = useState<'operational' | 'audit'>('operational');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [settingsName, setSettingsName] = useState('');
  const [settingsCity, setSettingsCity] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);

  const changeTab = useCallback((tab: OrgDetailTab) => {
    setActiveTab(tab);
    writeOrgTabToUrl(tab);
  }, []);

  useEffect(() => {
    const onPop = () => setActiveTab((readOrgTabFromUrl() as OrgDetailTab) || 'overview');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (detail) {
      setSettingsName(detail.companyName);
      setSettingsCity(detail.city);
    }
  }, [detail]);

  useEffect(() => {
    if (activeTab !== 'users') return;
    setUsersLoading(true);
    setUsersError(null);
    api.users
      .listAll(orgId)
      .then((res) => setUsers(Array.isArray(res) ? res : []))
      .catch((e) => setUsersError(e?.message ?? 'Benutzer konnten nicht geladen werden'))
      .finally(() => setUsersLoading(false));
  }, [activeTab, orgId]);

  useEffect(() => {
    if (activeTab !== 'vehicles') return;
    setVehiclesLoading(true);
    setVehiclesError(null);
    api.vehicles
      .listByOrg(orgId, { limit: 100 })
      .then((res: { data?: OrgVehicleRow[] }) => setVehicles(res.data ?? []))
      .catch((e: unknown) =>
        setVehiclesError(e instanceof Error ? e.message : 'Fahrzeuge konnten nicht geladen werden'),
      )
      .finally(() => setVehiclesLoading(false));
  }, [activeTab, orgId]);

  useEffect(() => {
    if (activeTab !== 'billing') return;
    setBillingLoading(true);
    setBillingError(null);
    api.billing
      .organizations()
      .then((rows: BillingOrganizationRow[]) => {
        const row = rows.find((r) => r.organization.id === orgId) ?? null;
        setBilling(row);
      })
      .catch((e) => setBillingError(e?.message ?? 'Abrechnungsdaten konnten nicht geladen werden'))
      .finally(() => setBillingLoading(false));
  }, [activeTab, orgId]);

  useEffect(() => {
    if (activeTab !== 'activity') return;
    setActivityLoading(true);
    setActivityError(null);
    const entity = activityMode === 'audit' ? 'ADMIN_OPERATION' : undefined;
    api.admin
      .activityLog({ organizationId: orgId, limit: 50, entity })
      .then((res) => setActivity(res.data ?? []))
      .catch((e) => setActivityError(e?.message ?? 'Aktivität konnte nicht geladen werden'))
      .finally(() => setActivityLoading(false));
  }, [activeTab, orgId, activityMode]);

  const userColumns: DataTableColumn<OrgUserRow>[] = [
    {
      key: 'user',
      header: 'Nutzer',
      cell: (u) => (
        <div>
          <p className="text-sm font-semibold">{u.name}</p>
          <p className="text-xs text-muted-foreground">{u.email}</p>
        </div>
      ),
    },
    { key: 'role', header: 'Rolle', cell: (u) => <StatusChip className="!text-xs">{u.role}</StatusChip> },
    { key: 'status', header: 'Status', cell: (u) => <StatusChip className="!text-xs">{u.status}</StatusChip> },
    {
      key: 'last',
      header: 'Zuletzt aktiv',
      cell: (u) => (
        <span className="text-sm text-muted-foreground">
          {u.lastLoginAt ? formatRelativeDe(u.lastLoginAt) : u.last_login ?? '—'}
        </span>
      ),
    },
  ];

  const vehicleColumns: DataTableColumn<OrgVehicleRow>[] = [
    {
      key: 'vehicle',
      header: 'Fahrzeug',
      cell: (v) => (
        <div>
          <p className="text-sm font-semibold">{v.vehicleName ?? v.name}</p>
          <p className="text-xs font-mono text-muted-foreground">{v.licensePlate ?? v.vin}</p>
        </div>
      ),
    },
    {
      key: 'signal',
      header: 'Konnektivität',
      cell: (v) => {
        const os = v.onlineStatus ?? 'OFFLINE';
        return (
          <div className="flex items-center gap-1.5">
            <StatusDot tone={onlineSignalTone(os)} />
            <span className="text-xs">{os}</span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Betrieb',
      cell: (v) =>
        v.status ? (
          <StatusChip tone={fleetVehicleStatusTone(v.status)} className="!text-xs">{v.status}</StatusChip>
        ) : (
          '—'
        ),
    },
    {
      key: 'health',
      header: 'Gesundheit',
      cell: (v) =>
        v.health ? <HealthStatusChip state={v.health} label={v.health} className="!text-xs" /> : '—',
    },
  ];

  if (loading && !detail) {
    return <MasterLoadingState variant="card" count={3} />;
  }
  if (error && !detail) {
    return <MasterErrorState title="Organisation" error={error} onRetry={() => void refresh()} />;
  }
  if (!detail) return null;

  const tabs = ORG_DETAIL_TABS;

  return (
    <>
      <MasterPageHeader
        variant="context"
        title={detail.companyName}
        description={`${detail.businessTypeLabel} · ${detail.city}, ${detail.country} · Kunde seit ${formatDateDe(detail.createdAt)}`}
        icon={<Building2 className="w-4 h-4" />}
        back={{ onBack, label: 'Zurück zu Organisationen' }}
        status={(
          <>
            <StatusChip tone={orgStatusTone(detail.orgStatus)}>{detail.orgStatusLabel}</StatusChip>
            <StatusChip tone={subscriptionStatusTone(detail.subscriptionStatus)}>
              {detail.subscriptionStatusLabel}
            </StatusChip>
            {detail.attention.severity !== 'none' && (
              <StatusChip tone={attentionSeverityTone(detail.attention.severity)}>
                <AlertTriangle className="w-3 h-3 mr-1" />
                {detail.attention.reasonCount}
              </StatusChip>
            )}
          </>
        )}
        actions={(
          <div className="flex flex-wrap gap-2">
            {onOpenBillingCenter && (
              <Button type="button" size="sm" onClick={() => onOpenBillingCenter(orgId)}>
                Abrechnung öffnen
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} aria-label="Aktualisieren">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        )}
        tabs={tabs}
        activeTabId={activeTab}
        onTabChange={(id) => changeTab(id as OrgDetailTab)}
        tabsAriaLabel="Organisation"
        tabsTestIdPrefix="org-detail"
      />

      {activeTab === 'overview' && <OverviewTab detail={detail} onTab={changeTab} />}

      {activeTab === 'users' && (
        <MasterPageSection>
          {usersLoading && <MasterLoadingState variant="rows" count={4} />}
          {usersError && <MasterErrorState title="Benutzer" error={usersError} />}
          {!usersLoading && !usersError && (
            <DataTable columns={userColumns} rows={users} getRowKey={(u) => u.id} dense empty="Keine Benutzer" />
          )}
        </MasterPageSection>
      )}

      {activeTab === 'vehicles' && (
        <MasterPageSection>
          {detail.connectivity && (
            <p className="text-sm text-muted-foreground mb-3">
              {detail.billableVehicleCount} Fahrzeuge · {detail.connectedVehicleCount} verbunden · Live{' '}
              {detail.connectivity.freshness.live} · Standby {detail.connectivity.freshness.standby} · Offline{' '}
              {detail.connectivity.freshness.offline + detail.connectivity.freshness.no_signal}
            </p>
          )}
          {vehiclesLoading && <MasterLoadingState variant="table" />}
          {vehiclesError && <MasterErrorState title="Fahrzeuge" error={vehiclesError} />}
          {!vehiclesLoading && !vehiclesError && (
            <DataTable
              columns={vehicleColumns}
              rows={vehicles}
              getRowKey={(v) => v.id}
              dense
              empty="Keine Fahrzeuge"
              onRowClick={onNavigateToVehicle ? (v) => onNavigateToVehicle(v.id) : undefined}
            />
          )}
        </MasterPageSection>
      )}

      {activeTab === 'billing' && (
        <MasterPageSection title="Abrechnung">
          {billingLoading && <MasterLoadingState variant="card" />}
          {billingError && <MasterErrorState title="Abrechnung" error={billingError} />}
          {!billingLoading && !billingError && billing && (
            <div className="space-y-4 surface-premium p-5 rounded-xl">
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Tarif</span><p className="font-semibold">{billing.tariffLabel ?? '—'}</p></div>
                <div><span className="text-muted-foreground">Abo-Status</span><p className="font-semibold">{billing.subscription?.status ?? 'NONE'}</p></div>
                <div><span className="text-muted-foreground">Zahlungsmethode</span><p className="font-semibold">{billing.paymentMethodStatus}</p></div>
                <div><span className="text-muted-foreground">Stripe-Sync</span><p className="font-semibold">{billing.syncStatus}</p></div>
                <div><span className="text-muted-foreground">Offener Betrag</span><p className="font-semibold">€{(billing.openAmountCents / 100).toFixed(2)}</p></div>
                <div><span className="text-muted-foreground">Fahrzeuge</span><p className="font-semibold">{billing.connectedVehicleCount}/{billing.billableVehicleCount}</p></div>
              </div>
              {billing.warnings.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {billing.warnings.map((w) => (
                    <StatusChip key={w} tone="warning" className="!text-xs">{attentionReasonLabel(w)}</StatusChip>
                  ))}
                </div>
              )}
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer">Stripe-Referenzen</summary>
                <p className="text-xs font-mono mt-2">Customer: {maskId(billing.subscription?.stripeCustomerId)}</p>
                <p className="text-xs font-mono">Subscription: {maskId(billing.subscription?.stripeSubscriptionId)}</p>
              </details>
              {onOpenBillingCenter && (
                <Button type="button" onClick={() => onOpenBillingCenter(orgId)} className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Abrechnung im Control Center öffnen
                </Button>
              )}
            </div>
          )}
          {!billingLoading && !billingError && !billing && (
            <EmptyState title="Keine Abrechnungsdaten" description="Für diese Organisation liegen keine Billing-Daten vor." />
          )}
        </MasterPageSection>
      )}

      {activeTab === 'integrations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {detail.integrations.length === 0 ? (
            <EmptyState title="Keine Integrationen" description="Für diese Organisation sind keine Integrationen registriert." />
          ) : (
            detail.integrations.map((i) => (
              <div key={i.slug} className="surface-premium rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{i.name}</h3>
                  <StatusChip
                    tone={i.status === 'ERROR' ? 'critical' : i.status === 'ACTIVE' ? 'success' : 'neutral'}
                    className="!text-xs"
                  >
                    {i.statusLabel}
                  </StatusChip>
                </div>
                <p className="text-sm text-muted-foreground">
                  Letzte Synchronisation: {i.lastSyncAt ? formatRelativeDe(i.lastSyncAt) : '—'}
                </p>
                {i.errorMessage && (
                  <p className="text-sm text-[color:var(--status-critical)]">{i.errorMessage}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <MasterPageSection>
          <div className="flex gap-2 mb-3">
            <Button
              type="button"
              size="sm"
              variant={activityMode === 'operational' ? 'default' : 'outline'}
              onClick={() => setActivityMode('operational')}
            >
              Aktivität
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activityMode === 'audit' ? 'default' : 'outline'}
              onClick={() => setActivityMode('audit')}
            >
              Master-Audit
            </Button>
          </div>
          {activityLoading && <MasterLoadingState variant="rows" count={5} />}
          {activityError && <MasterErrorState title="Aktivität" error={activityError} />}
          {!activityLoading && !activityError && (
            <div className="space-y-2">
              {activity.length === 0 ? (
                <EmptyState compact title="Keine Einträge" />
              ) : (
                activity.map((row) => (
                  <div key={row.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{row.action}</span>
                      <span className="text-muted-foreground text-xs">{formatRelativeDe(row.createdAt)}</span>
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      {row.userName ?? 'System'} · {row.entity}
                      {row.description ? ` · ${row.description}` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </MasterPageSection>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-xl">
          <MasterPageSection title="Metadaten">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold">Firmenname</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-muted text-sm"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Stadt</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-muted text-sm"
                  value={settingsCity}
                  onChange={(e) => setSettingsCity(e.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={settingsSaving}
                onClick={async () => {
                  setSettingsSaving(true);
                  try {
                    await onUpdateOrg(orgId, { companyName: settingsName, city: settingsCity });
                    await refresh();
                  } finally {
                    setSettingsSaving(false);
                  }
                }}
              >
                Speichern
              </Button>
            </div>
          </MasterPageSection>

          <section className="rounded-xl border border-[color:var(--status-critical)]/40 p-5 space-y-3">
            <SectionHeader title="Gefahrenzone" />
            <p className="text-sm text-muted-foreground">
              Entfernt den Mandanten und alle zugehörigen Daten. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
              Organisation löschen…
            </Button>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Organisation löschen"
        description={`Geben Sie den Namen „${detail.companyName}" und eine Begründung ein.`}
        confirmLabel="Endgültig löschen"
        cancelLabel="Abbrechen"
        tone="critical"
        loading={deleting}
        onConfirm={async () => {
          if (deleteConfirmName !== detail.companyName || !deleteReason.trim()) return;
          setDeleting(true);
          try {
            await onDeleteOrg(orgId, deleteReason.trim());
            setDeleteOpen(false);
            onBack();
          } finally {
            setDeleting(false);
          }
        }}
      >
        <div className="space-y-3 mt-2">
          <input
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-sm"
            placeholder={detail.companyName}
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            aria-label="Organisationsname bestätigen"
          />
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-sm min-h-[80px]"
            placeholder="Begründung (Pflicht)"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            aria-label="Begründung"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
