import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../components/patterns/chrome-tab-bar';
import {
  DataTable,
  EmptyState,
  ErrorState,
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
  buildVoiceOrgWorkspaceSearch,
  readVoiceOrgId,
  readVoiceOrgWorkspaceTab,
  type VoiceOrgWorkspaceTab,
} from './voice-control-plane/voice-org-workspace/voice-org-workspace-navigation';
import { VoiceOrgWorkspace } from './voice-control-plane/voice-org-workspace/VoiceOrgWorkspace';
import type { VoiceProvisioningStepView } from './voice-control-plane/voice-org-workspace/voice-org-provisioning.ops';
import {
  buildPublishAgentAction,
  buildRefreshProvisioningAction,
  buildReplayWebhookAction,
  buildRetryNumberImportAction,
  buildRetryTwilioSubaccountAction,
  buildRollbackAgentAction,
  buildSuspendOrgAction,
} from './voice-control-plane/voice-org-workspace/voice-org-workspace.actions';
import { VoicePlatformStatusPanel } from './voice-control-plane/VoicePlatformStatusPanel';
import {
  DEFAULT_VOICE_ORG_FILTERS,
  VoiceOrganizationsPanel,
} from './voice-control-plane/VoiceOrganizationsPanel';
import type { VoiceOrgFilters } from './voice-control-plane/voice-platform-overview.ops';
import { filterOrganizations } from './voice-control-plane/voice-platform-overview.ops';
import {
  VoiceSecureActionDialog,
  type VoiceSecureActionRequest,
} from './voice-control-plane/VoiceSecureActionDialog';

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
  const [orgFilters, setOrgFilters] = useState<VoiceOrgFilters>(DEFAULT_VOICE_ORG_FILTERS);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    readVoiceOrgId(window.location.search),
  );
  const [orgWorkspaceTab, setOrgWorkspaceTab] = useState<VoiceOrgWorkspaceTab>(
    readVoiceOrgWorkspaceTab(window.location.search),
  );
  const [workspace, setWorkspace] = useState<VoiceControlPlaneOrgWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
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
    setWorkspaceError(null);
    try {
      const data = await api.voiceAssistant.admin.controlPlane.organizationWorkspace(orgId);
      setWorkspace(data);
    } catch (err) {
      const message = getErrorMessage(err);
      setWorkspaceError(message);
      toast.error('Workspace konnte nicht geladen werden', { description: message });
      setWorkspace(null);
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  const openOrgWorkspace = useCallback(
    (orgId: string, tab: VoiceOrgWorkspaceTab = 'overview') => {
      setOrgWorkspaceTab(tab);
      const nextUrl = `${window.location.pathname}${buildVoiceOrgWorkspaceSearch(activeSection, orgId, tab)}`;
      window.history.pushState(null, '', nextUrl);
      void loadWorkspace(orgId);
    },
    [activeSection, loadWorkspace],
  );

  const closeOrgWorkspace = useCallback(() => {
    setSelectedOrgId(null);
    setWorkspace(null);
    setWorkspaceError(null);
    const nextUrl = `${window.location.pathname}${buildVoiceControlPlaneSearch(activeSection)}`;
    window.history.pushState(null, '', nextUrl);
  }, [activeSection]);

  const navigateOrgTab = useCallback(
    (tab: VoiceOrgWorkspaceTab) => {
      if (!selectedOrgId) return;
      setOrgWorkspaceTab(tab);
      const nextUrl = `${window.location.pathname}${buildVoiceOrgWorkspaceSearch(activeSection, selectedOrgId, tab)}`;
      window.history.pushState(null, '', nextUrl);
    },
    [activeSection, selectedOrgId],
  );

  const actionContext = useCallback(
    () => ({
      orgId: selectedOrgId!,
      orgName: workspace?.detail?.organization?.companyName ?? 'Organisation',
      onRefresh: async () => {
        if (selectedOrgId) await loadWorkspace(selectedOrgId);
        await loadCore();
      },
    }),
    [selectedOrgId, workspace, loadWorkspace, loadCore],
  );

  useEffect(() => {
    if (!canAccess) return;
    void loadCore();
    const orgId = readVoiceOrgId(window.location.search);
    if (orgId) {
      setSelectedOrgId(orgId);
      setOrgWorkspaceTab(readVoiceOrgWorkspaceTab(window.location.search));
      void loadWorkspace(orgId);
    }
    const interval = window.setInterval(() => {
      if (activeSection === 'platform' || activeSection === 'organizations') {
        void loadCore();
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [canAccess, loadCore, activeSection]);

  useEffect(() => {
    const onPopState = () => {
      setActiveSection(readVoiceControlPlaneSection(window.location.search));
      const orgId = readVoiceOrgId(window.location.search);
      setSelectedOrgId(orgId);
      setOrgWorkspaceTab(readVoiceOrgWorkspaceTab(window.location.search));
      if (orgId) void loadWorkspace(orgId);
      else {
        setWorkspace(null);
        setWorkspaceError(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [loadWorkspace]);

  const filteredOrganizations = useMemo(
    () => filterOrganizations(organizations, orgFilters),
    [organizations, orgFilters],
  );

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
    setSecureAction(
      buildSuspendOrgAction({
        orgId,
        orgName,
        onRefresh: async () => {
          await loadCore();
          if (selectedOrgId === orgId) await loadWorkspace(orgId);
        },
      }),
    );
  };

  const openReplay = (eventId: string) => {
    const event = webhookEvents.find(row => row.id === eventId);
    const orgId = selectedOrgId ?? event?.organizationId ?? '';
    const orgName =
      event?.organizationName ??
      organizations.find(row => row.organizationId === orgId)?.organizationName ??
      'Organisation';
    setSecureAction(
      buildReplayWebhookAction({
        orgId,
        orgName,
        webhookEventId: eventId,
        onRefresh: async () => {
          await loadCore();
          if (selectedOrgId) await loadWorkspace(selectedOrgId);
        },
      }),
    );
  };

  const openPublishAgent = () => {
    if (!selectedOrgId) return;
    setSecureAction(buildPublishAgentAction(actionContext()));
  };

  const openRollbackAgent = () => {
    if (!selectedOrgId) return;
    setSecureAction(buildRollbackAgentAction(actionContext()));
  };

  const openRefreshProvisioning = () => {
    if (!selectedOrgId) return;
    setSecureAction(buildRefreshProvisioningAction(actionContext()));
  };

  const openReconnectNumber = (phoneNumberId: string) => {
    if (!selectedOrgId) return;
    setSecureAction(
      buildRetryNumberImportAction({
        ...actionContext(),
        phoneNumberId,
      }),
    );
  };

  const openProvisionResume = (orgId: string) => {
    const orgName =
      organizations.find(o => o.organizationId === orgId)?.organizationName ?? 'Organisation';
    setSecureAction(
      buildRetryTwilioSubaccountAction({
        orgId,
        orgName,
        onRefresh: async () => {
          await loadCore();
          if (selectedOrgId === orgId) await loadWorkspace(orgId);
        },
      }),
    );
  };

  const handleProvisioningStepAction = (step: VoiceProvisioningStepView) => {
    if (!selectedOrgId) return;
    const ctx = actionContext();
    if (step.actionKind === 'retry_twilio') {
      setSecureAction(buildRetryTwilioSubaccountAction(ctx));
    } else if (step.actionKind === 'retry_import') {
      const phoneId = workspace?.phoneNumbers[0]?.id;
      if (phoneId) setSecureAction(buildRetryNumberImportAction({ ...ctx, phoneNumberId: phoneId }));
    } else if (step.actionKind === 'deploy_agent') {
      setSecureAction(buildPublishAgentAction(ctx));
    }
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
        title="Voice Betriebszentrum"
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
        <VoicePlatformStatusPanel status={platformStatus} loading={loading} />
      )}

      {!error && activeSection === 'organizations' && (
        <VoiceOrganizationsPanel
          organizations={organizations}
          filters={orgFilters}
          onFiltersChange={patch => setOrgFilters(current => ({ ...current, ...patch }))}
          loading={loading}
          onOpenWorkspace={orgId => openOrgWorkspace(orgId)}
          onSuspend={openSuspend}
        />
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
              onClick={() => provisioningOrgId && openOrgWorkspace(provisioningOrgId, 'provisioning')}
            >
              Operations-Workspace öffnen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!provisioningOrgId}
              onClick={() => provisioningOrgId && openProvisionResume(provisioningOrgId)}
            >
              Fehlgeschlagenen Schritt erneut versuchen
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
            <EmptyState title="Keine Provisioning-Jobs" description="Organisation wählen und Operations-Workspace öffnen." />
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
            Agent Deployments pro Organisation — öffnen Sie den Operations-Workspace.
          </p>
          <DataTable
            columns={orgColumns.filter((col) => ['org', 'voice', 'errors'].includes(col.key))}
            rows={filteredOrganizations}
            getRowKey={(row) => row.organizationId}
            loading={loading}
            onRowClick={(row) => openOrgWorkspace(row.organizationId, 'agent')}
            rowActions={(row) => (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                onClick={(event) => {
                  event.stopPropagation();
                  openOrgWorkspace(row.organizationId, 'agent');
                }}
              >
                Agent-Version veröffentlichen
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
              Webhook-Ereignis erneut verarbeiten
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

      <VoiceOrgWorkspace
        open={Boolean(selectedOrgId)}
        orgId={selectedOrgId}
        orgName={workspace?.detail?.organization?.companyName ?? 'Organisation'}
        activeTab={orgWorkspaceTab}
        onTabChange={navigateOrgTab}
        onClose={closeOrgWorkspace}
        workspace={workspace}
        workspaceLoading={workspaceLoading}
        workspaceError={workspaceError}
        webhookEvents={webhookEvents}
        auditEvents={auditEvents}
        onRefresh={async () => {
          if (selectedOrgId) await loadWorkspace(selectedOrgId);
        }}
        onRefreshProvisioning={openRefreshProvisioning}
        onReconnectNumber={openReconnectNumber}
        onPublishAgent={openPublishAgent}
        onRollbackAgent={openRollbackAgent}
        onReplayWebhook={openReplay}
        onSuspend={() =>
          selectedOrgId &&
          openSuspend(selectedOrgId, workspace?.detail?.organization?.companyName ?? 'Organisation')
        }
        onProvisioningStepAction={handleProvisioningStepAction}
      />

      <VoiceSecureActionDialog request={secureAction} onClose={() => setSecureAction(null)} />
    </div>
  );
}
