import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Phone,
  RefreshCw,
  Search,
  Shield,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../components/patterns/chrome-tab-bar';
import {
  DataTable,
  DetailDrawer,
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  StatusChip,
  type DataTableColumn,
} from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { cn } from '../../components/ui/utils';
import { isMasterAdmin } from '../../lib/auth';
import {
  api,
  getErrorMessage,
  type VoiceControlPlaneAuditEventRow,
  type VoiceControlPlaneOrganizationRow,
  type VoiceControlPlaneOrgWorkspace,
  type VoiceControlPlanePhoneNumberRow,
  type VoiceControlPlanePlatformStatus,
  type VoiceControlPlaneWebhookEventRow,
  type VoiceMasterAdminOrgBilling,
} from '../../lib/api';
import {
  buildVoiceControlPlaneSearch,
  readVoiceControlPlaneSection,
  VOICE_CONTROL_PLANE_SECTIONS,
  type VoiceControlPlaneSection,
} from './voice-control-plane/voice-control-plane-navigation';
import {
  VoiceSecureActionDialog,
  type VoiceSecureActionRequest,
} from './voice-control-plane/VoiceSecureActionDialog';
import { createIdempotencyKey } from './voice-control-plane/voice-secure-action.util';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function statusTone(status: string): 'success' | 'warning' | 'critical' | 'neutral' | 'noData' {
  if (['ACTIVE', 'PROCESSED', 'CONNECTED', 'IMPORTED', 'ASSIGNED'].includes(status)) return 'success';
  if (['FAILED', 'INACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) return 'critical';
  if (['QUEUED', 'RECEIVED', 'PENDING', 'WARNING', 'DRAFT'].includes(status)) return 'warning';
  if (status === 'NOT_CONFIGURED') return 'noData';
  return 'neutral';
}

function centsToEuros(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function SectionTabBar({
  activeSection,
  onSectionChange,
}: {
  activeSection: VoiceControlPlaneSection;
  onSectionChange: (section: VoiceControlPlaneSection) => void;
}) {
  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label="Voice AI Control Plane"
      data-testid="voice-control-plane-tabbar"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {VOICE_CONTROL_PLANE_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`voice-control-plane-section-${section.id}`}
              onClick={() => onSectionChange(section.id)}
              className={chromeTabTriggerClass(isActive, 'max-sm:px-3')}
            >
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VoiceAssistantAdminView() {
  const canAccess = isMasterAdmin();
  const [activeSection, setActiveSection] = useState<VoiceControlPlaneSection>(
    readVoiceControlPlaneSection(window.location.search),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformStatus, setPlatformStatus] = useState<VoiceControlPlanePlatformStatus | null>(null);
  const [organizations, setOrganizations] = useState<VoiceControlPlaneOrganizationRow[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<VoiceControlPlanePhoneNumberRow[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<VoiceControlPlaneWebhookEventRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<VoiceControlPlaneAuditEventRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<VoiceControlPlaneOrgWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [usageBilling, setUsageBilling] = useState<VoiceMasterAdminOrgBilling[]>([]);
  const [secureAction, setSecureAction] = useState<VoiceSecureActionRequest | null>(null);
  const [provisioningOrgId, setProvisioningOrgId] = useState('');

  const navigateSection = (section: VoiceControlPlaneSection) => {
    setActiveSection(section);
    const nextUrl = `${window.location.pathname}${buildVoiceControlPlaneSearch(section)}`;
    window.history.pushState(null, '', nextUrl);
  };

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, orgs, numbers, events, audit] = await Promise.all([
        api.voiceAssistant.admin.controlPlane.platformStatus(),
        api.voiceAssistant.admin.controlPlane.organizations(),
        api.voiceAssistant.admin.controlPlane.phoneNumbers(),
        api.voiceAssistant.admin.controlPlane.webhookEvents({ limit: 100 }),
        api.voiceAssistant.admin.controlPlane.auditEvents({ limit: 100 }),
      ]);
      setPlatformStatus(status);
      setOrganizations(orgs.organizations);
      setPhoneNumbers(numbers);
      setWebhookEvents(events.items);
      setAuditEvents(audit.items);

      const billingRows = await Promise.all(
        orgs.organizations.slice(0, 20).map(async (org) => {
          try {
            return await api.voiceAssistant.admin.billing.orgBilling(org.organizationId);
          } catch {
            return null;
          }
        }),
      );
      setUsageBilling(billingRows.filter((row): row is VoiceMasterAdminOrgBilling => row != null));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(async (orgId: string) => {
    setSelectedOrgId(orgId);
    setWorkspaceLoading(true);
    try {
      const data = await api.voiceAssistant.admin.controlPlane.organizationWorkspace(orgId);
      setWorkspace(data);
    } catch (err) {
      toast.error('Workspace konnte nicht geladen werden', { description: getErrorMessage(err) });
      setWorkspace(null);
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void loadCore();
  }, [canAccess, loadCore]);

  useEffect(() => {
    const onPopState = () => {
      setActiveSection(readVoiceControlPlaneSection(window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const filteredOrganizations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return organizations;
    return organizations.filter(
      (row) =>
        row.organizationName.toLowerCase().includes(term) ||
        row.organizationId.toLowerCase().includes(term) ||
        (row.planCode?.toLowerCase().includes(term) ?? false),
    );
  }, [organizations, search]);

  const orgColumns: DataTableColumn<VoiceControlPlaneOrganizationRow>[] = [
    {
      key: 'org',
      header: 'Organisation',
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{row.organizationName}</p>
          <p className="text-[10px] text-muted-foreground truncate">{row.planCode ?? 'Kein Tarif'}</p>
        </div>
      ),
    },
    {
      key: 'voice',
      header: 'Voice Status',
      cell: (row) => <StatusChip tone={statusTone(row.assistantStatus)}>{row.assistantStatus}</StatusChip>,
    },
    {
      key: 'minutes',
      header: 'Minuten',
      numeric: true,
      cell: (row) => (
        <span className="tabular-nums text-xs">
          {row.consumedMinutes.toFixed(1)} / {row.remainingMinutes.toFixed(1)} übrig
        </span>
      ),
    },
    {
      key: 'budget',
      header: 'Budget',
      cell: (row) => (
        <span className="text-xs tabular-nums">{centsToEuros(row.monthlyBudgetCents)}</span>
      ),
    },
    {
      key: 'concurrency',
      header: 'Parallelität',
      numeric: true,
      cell: (row) => <span className="tabular-nums text-xs">{row.maxConcurrentCalls ?? '—'}</span>,
    },
    {
      key: 'activity',
      header: 'Letzte Aktivität',
      cell: (row) => <span className="text-[10px] text-muted-foreground">{timeAgo(row.lastCallAt)}</span>,
    },
    {
      key: 'errors',
      header: 'Fehler',
      numeric: true,
      align: 'right',
      cell: (row) => (
        <span className={row.openErrors > 0 ? 'text-amber-600 font-semibold tabular-nums' : 'tabular-nums'}>
          {row.openErrors}
        </span>
      ),
    },
  ];

  const phoneColumns: DataTableColumn<VoiceControlPlanePhoneNumberRow>[] = [
    {
      key: 'number',
      header: 'Nummer',
      cell: (row) => <span className="font-mono text-xs">{row.maskedPhoneNumber}</span>,
    },
    { key: 'org', header: 'Organisation', cell: (row) => row.organizationName },
    { key: 'status', header: 'Status', cell: (row) => <StatusChip tone={statusTone(row.status)}>{row.status}</StatusChip> },
    { key: 'region', header: 'Region', cell: (row) => row.region ?? '—' },
    { key: 'regulatory', header: 'Regulatory', cell: (row) => row.regulatoryStatus ?? '—' },
    {
      key: 'el',
      header: 'ElevenLabs',
      cell: (row) => (
        <StatusChip tone={row.elevenLabsAssigned ? 'success' : 'warning'}>
          {row.elevenLabsAssigned ? 'Zugeordnet' : 'Offen'}
        </StatusChip>
      ),
    },
  ];

  const webhookColumns: DataTableColumn<VoiceControlPlaneWebhookEventRow>[] = [
    { key: 'provider', header: 'Provider', cell: (row) => row.provider },
    { key: 'type', header: 'Event', cell: (row) => row.eventType ?? '—' },
    { key: 'status', header: 'Status', cell: (row) => <StatusChip tone={statusTone(row.status)}>{row.status}</StatusChip> },
    { key: 'org', header: 'Organisation', cell: (row) => row.organizationName ?? '—' },
    { key: 'retries', header: 'Retries', numeric: true, cell: (row) => row.retryCount },
    {
      key: 'diag',
      header: 'Diagnose',
      cell: (row) => (
        <span className="text-[10px] text-muted-foreground line-clamp-2 max-w-[200px]">
          {row.diagnosticSummary ?? row.errorMessage ?? '—'}
        </span>
      ),
    },
  ];

  const auditColumns: DataTableColumn<VoiceControlPlaneAuditEventRow>[] = [
    { key: 'time', header: 'Zeit', cell: (row) => new Date(row.createdAt).toLocaleString('de-DE') },
    { key: 'category', header: 'Kategorie', cell: (row) => row.category },
    { key: 'org', header: 'Organisation', cell: (row) => row.organizationName },
    { key: 'action', header: 'Aktion', cell: (row) => row.action },
    { key: 'reason', header: 'Grund', cell: (row) => row.reasonCode ?? row.message ?? '—' },
  ];

  const usageColumns: DataTableColumn<VoiceMasterAdminOrgBilling>[] = [
    { key: 'org', header: 'Org ID', cell: (row) => <span className="font-mono text-[10px]">{row.organizationId}</span> },
    { key: 'minutes', header: 'Minuten', numeric: true, cell: (row) => row.consumedMinutes.toFixed(1) },
    { key: 'twilio', header: 'Provider-Kosten', cell: (row) => centsToEuros(row.providerCostCents) },
    { key: 'revenue', header: 'Umsatz', cell: (row) => centsToEuros(row.revenueCents) },
    { key: 'margin', header: 'Marge', cell: (row) => `${centsToEuros(row.marginCents)} (${row.marginPercent ?? 0}%)` },
  ];

  const openSuspend = (orgId: string, orgName: string) => {
    setSecureAction({
      title: 'Organisation suspendieren',
      description: `Voice-Dienste für ${orgName} werden gesperrt.`,
      confirmLabel: 'Suspendieren',
      tone: 'critical',
      onConfirm: async (reason) => {
        await api.voiceAssistant.admin.controlPlane.suspendOrganization(
          orgId,
          { reason, confirm: true },
          createIdempotencyKey('suspend'),
        );
        toast.success('Organisation suspendiert');
        await loadCore();
      },
    });
  };

  const openReplay = (eventId: string) => {
    setSecureAction({
      title: 'Event replayen',
      description: 'Das Webhook-Event wird erneut in die Verarbeitung eingestellt. Keine vollständigen Transkripte werden angezeigt.',
      confirmLabel: 'Replay starten',
      onConfirm: async (reason) => {
        await api.voiceAssistant.admin.controlPlane.replayWebhookEvent(
          eventId,
          { reason, confirm: true },
          createIdempotencyKey('replay'),
        );
        toast.success('Replay gestartet');
        await loadCore();
      },
    });
  };

  const openDeploy = (orgId: string) => {
    setSecureAction({
      title: 'Agent neu deployen',
      description: 'Der aktuelle Draft wird als neue aktive Version ausgerollt.',
      confirmLabel: 'Deploy',
      onConfirm: async () => {
        await api.voiceAssistant.admin.controlPlane.deployAgent(
          orgId,
          { confirm: true },
          createIdempotencyKey('deploy'),
        );
        toast.success('Deployment gestartet');
        await loadWorkspace(orgId);
      },
    });
  };

  const openRollback = (orgId: string) => {
    setSecureAction({
      title: 'Rollback',
      description: 'Rollback auf die zuletzt aktive Agent-Version.',
      confirmLabel: 'Rollback',
      tone: 'critical',
      onConfirm: async () => {
        await api.voiceAssistant.admin.controlPlane.rollbackAgent(orgId, { confirm: true });
        toast.success('Rollback ausgeführt');
        await loadWorkspace(orgId);
      },
    });
  };

  const openProvisionResume = (orgId: string) => {
    setSecureAction({
      title: 'Provisionierung fortsetzen',
      description: 'Subaccount-Provisionierung wird mit Bestätigung fortgesetzt.',
      confirmLabel: 'Fortsetzen',
      onConfirm: async (reason) => {
        await api.voiceAssistant.admin.provisioning.twilioProvisionSubaccount(
          orgId,
          { confirm: true, friendlyName: reason.slice(0, 40) },
          createIdempotencyKey('provision'),
        );
        toast.success('Provisionierung fortgesetzt');
        await loadWorkspace(orgId);
      },
    });
  };

  const openReconnectNumber = (orgId: string, phoneNumberId: string) => {
    setSecureAction({
      title: 'Nummer neu verbinden',
      description: 'ElevenLabs-Import und Agent-Zuordnung werden erneut ausgeführt.',
      confirmLabel: 'Neu verbinden',
      onConfirm: async () => {
        await api.voiceAssistant.admin.provisioning.elevenLabsImport(
          orgId,
          phoneNumberId,
          { confirm: true },
          createIdempotencyKey('reconnect'),
        );
        toast.success('Nummer wird neu verbunden');
        await loadCore();
        if (selectedOrgId === orgId) await loadWorkspace(orgId);
      },
    });
  };

  if (!canAccess) {
    return (
      <div className="p-6" data-testid="voice-control-plane-denied">
        <EmptyState
          title="Kein Zugriff"
          description="Die Voice AI Control Plane ist nur für Master Admins verfügbar."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-1" data-testid="voice-control-plane">
      <PageHeader
        title="Voice AI Control Plane"
        actions={
          <Button type="button" size="sm" variant="outline" onClick={() => void loadCore()} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')} />
            Aktualisieren
          </Button>
        }
      />

      <SectionTabBar activeSection={activeSection} onSectionChange={navigateSection} />

      {error && <ErrorState title="Control Plane konnte nicht geladen werden" description={error} onRetry={() => void loadCore()} />}

      {!error && activeSection === 'platform' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="ElevenLabs"
              value={platformStatus?.providers.elevenLabs.label ?? '—'}
              icon={<Bot className="h-4 w-4" />}
            />
            <MetricCard
              label="Twilio IE1"
              value={platformStatus?.providers.twilioIe1.label ?? '—'}
              icon={<Phone className="h-4 w-4" />}
            />
            <MetricCard
              label="MCP Gateway"
              value={platformStatus?.providers.mcpGateway.label ?? '—'}
              icon={<Activity className="h-4 w-4" />}
            />
            <MetricCard
              label="Queue Backlog"
              value={platformStatus?.queues.webhookBacklog ?? 0}
              icon={<Webhook className="h-4 w-4" />}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="DLQ (24h)" value={platformStatus?.webhooks.dlqCount24h ?? 0} />
            <MetricCard
              label="Eventverzögerung"
              value={
                platformStatus?.webhooks.avgProcessingDelayMs != null
                  ? `${platformStatus.webhooks.avgProcessingDelayMs} ms`
                  : '—'
              }
            />
            <MetricCard label="Queue waiting" value={platformStatus?.queues.waiting ?? 0} />
            <MetricCard label="Queue failed" value={platformStatus?.queues.failed ?? 0} />
          </div>

          {(platformStatus?.activeIncidents.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Aktive Incidents
              </p>
              {platformStatus?.activeIncidents.map((incident) => (
                <p key={incident.id} className="text-xs text-muted-foreground">
                  [{incident.severity}] {incident.message}
                </p>
              ))}
            </div>
          ) : (
            <EmptyState compact title="Keine aktiven Incidents" description="Alle Provider und Queues im Normalbetrieb." />
          )}
        </div>
      )}

      {!error && activeSection === 'organizations' && (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Organisationen suchen…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs outline-none focus:border-[color:var(--brand)]"
            />
          </div>
          <DataTable
            columns={orgColumns}
            rows={filteredOrganizations}
            getRowKey={(row) => row.organizationId}
            loading={loading}
            onRowClick={(row) => void loadWorkspace(row.organizationId)}
            empty={<EmptyState title="Keine Organisationen" description="Noch keine Voice-Organisationen vorhanden." />}
            rowActions={(row) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    void loadWorkspace(row.organizationId);
                  }}
                >
                  Workspace
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    openSuspend(row.organizationId, row.organizationName);
                  }}
                >
                  Suspend
                </button>
              </div>
            )}
          />
        </div>
      )}

      {!error && activeSection === 'provisioning' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block font-semibold">Organisation</span>
              <select
                value={provisioningOrgId}
                onChange={(event) => setProvisioningOrgId(event.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs min-w-[240px]"
              >
                <option value="">Organisation wählen…</option>
                {organizations.map((org) => (
                  <option key={org.organizationId} value={org.organizationId}>
                    {org.organizationName}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              disabled={!provisioningOrgId}
              onClick={() => provisioningOrgId && void loadWorkspace(provisioningOrgId)}
            >
              Jobs laden
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!provisioningOrgId}
              onClick={() => provisioningOrgId && openProvisionResume(provisioningOrgId)}
            >
              Provisionierung fortsetzen
            </Button>
          </div>
          {workspace?.provisioningJobs?.length ? (
            <DataTable
              columns={[
                { key: 'type', header: 'Job', cell: (row) => row.jobType },
                { key: 'status', header: 'Status', cell: (row) => <StatusChip tone={statusTone(row.status)}>{row.status}</StatusChip> },
                { key: 'step', header: 'Schritt', cell: (row) => row.currentStep ?? row.resumeStep ?? '—' },
                { key: 'error', header: 'Fehler', cell: (row) => row.lastError ?? '—' },
              ]}
              rows={workspace.provisioningJobs}
              getRowKey={(row) => row.id}
              loading={workspaceLoading}
            />
          ) : (
            <EmptyState title="Keine Provisioning-Jobs" description="Organisation wählen und Jobs laden." />
          )}
        </div>
      )}

      {!error && activeSection === 'phone-numbers' && (
        <DataTable
          columns={phoneColumns}
          rows={phoneNumbers}
          getRowKey={(row) => row.id}
          loading={loading}
          empty={<EmptyState title="Keine Nummern" description="Es sind noch keine maskierten Telefonnummern registriert." />}
        />
      )}

      {!error && activeSection === 'deployments' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Agent Deployments pro Organisation — wähle eine Organisation im Workspace-Drawer.
          </p>
          <DataTable
            columns={orgColumns.filter((col) => ['org', 'voice', 'errors'].includes(col.key))}
            rows={filteredOrganizations}
            getRowKey={(row) => row.organizationId}
            loading={loading}
            onRowClick={(row) => void loadWorkspace(row.organizationId)}
            rowActions={(row) => (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                onClick={(event) => {
                  event.stopPropagation();
                  openDeploy(row.organizationId);
                }}
              >
                Deploy
              </button>
            )}
          />
        </div>
      )}

      {!error && activeSection === 'webhooks' && (
        <DataTable
          columns={webhookColumns}
          rows={webhookEvents}
          getRowKey={(row) => row.id}
          loading={loading}
          empty={<EmptyState title="Keine Events" description="Noch keine Webhook-Events erfasst." />}
          rowActions={(row) => (
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-[10px] font-semibold hover:bg-muted"
              onClick={() => openReplay(row.id)}
            >
              Replay
            </button>
          )}
        />
      )}

      {!error && activeSection === 'usage' && (
        <DataTable
          columns={usageColumns}
          rows={usageBilling}
          getRowKey={(row) => row.organizationId}
          loading={loading}
          empty={<EmptyState title="Keine Usage-Daten" description="Billing-Daten werden geladen sobald Organisationen aktiv sind." />}
        />
      )}

      {!error && activeSection === 'audit' && (
        <DataTable
          columns={auditColumns}
          rows={auditEvents}
          getRowKey={(row) => row.id}
          loading={loading}
          empty={<EmptyState title="Kein Audit-Trail" description="Noch keine sicheren Aktionen protokolliert." />}
        />
      )}

      <DetailDrawer
        open={Boolean(selectedOrgId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrgId(null);
            setWorkspace(null);
          }
        }}
        eyebrow="Organisation Workspace"
        title={workspace?.detail?.organization?.companyName ?? 'Organisation'}
        description={selectedOrgId ? `Org ID: ${selectedOrgId}` : undefined}
        widthClassName="sm:max-w-xl"
        footer={
          selectedOrgId ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => openDeploy(selectedOrgId)}>
                Agent deployen
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => openRollback(selectedOrgId)}>
                Rollback
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() =>
                  openSuspend(selectedOrgId, workspace?.detail?.organization?.companyName ?? 'Organisation')
                }
              >
                Suspendieren
              </Button>
            </div>
          ) : undefined
        }
      >
        {workspaceLoading ? (
          <div className="p-5 text-xs text-muted-foreground">Lade Workspace…</div>
        ) : !workspace ? (
          <EmptyState title="Kein Workspace" description="Organisation aus der Tabelle wählen." />
        ) : (
          <div className="space-y-5 p-5 text-xs">
            <section>
              <h4 className="sq-section-label mb-2">Subaccounts</h4>
              {workspace.providerAccounts.length === 0 ? (
                <p className="text-muted-foreground">Keine Provider-Accounts</p>
              ) : (
                workspace.providerAccounts.map((account) => (
                  <div key={account.id} className="flex justify-between gap-2 py-1">
                    <span>{account.provider}</span>
                    <span className="font-mono">{account.maskedExternalRef ?? '—'}</span>
                  </div>
                ))
              )}
            </section>

            <section>
              <h4 className="sq-section-label mb-2">Nummern (maskiert)</h4>
              {workspace.phoneNumbers.map((number) => (
                <div key={number.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="font-mono">{number.maskedPhoneNumber}</span>
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-[color:var(--brand)]"
                    onClick={() => selectedOrgId && openReconnectNumber(selectedOrgId, number.id)}
                  >
                    Neu verbinden
                  </button>
                </div>
              ))}
            </section>

            <section>
              <h4 className="sq-section-label mb-2">Agent Deployment</h4>
              <p className="text-muted-foreground">
                Draft: {workspace.agentDeployment.draft ? 'vorhanden' : 'keiner'} · Diff:{' '}
                {workspace.agentDeployment.diff ? 'verfügbar' : '—'}
              </p>
            </section>

            <section>
              <h4 className="sq-section-label mb-2 flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                Billing (Master)
              </h4>
              {workspace.billing ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Minuten</p>
                    <p className="font-bold tabular-nums">{workspace.billing.consumedMinutes.toFixed(1)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Marge</p>
                    <p className="font-bold tabular-nums">{centsToEuros(workspace.billing.marginCents)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Keine Billing-Daten</p>
              )}
            </section>

            <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
              Keine vollständigen Transkripte oder unmaskierten Telefonnummern in der Master-Ansicht.
            </p>
          </div>
        )}
      </DetailDrawer>

      <VoiceSecureActionDialog request={secureAction} onClose={() => setSecureAction(null)} />
    </div>
  );
}
