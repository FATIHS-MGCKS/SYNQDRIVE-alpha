import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  ExternalLink,
  Phone,
  PhoneCall,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { cn } from '../../components/ui/utils';
import { api, getErrorMessage } from '../../lib/api';
import type {
  VoiceAssistantAdminOrgDetail,
  VoiceAssistantAdminOverview,
  VoiceAssistantAdminOverviewRow,
} from '../../lib/api';

type FilterMode = 'all' | 'configured' | 'issues';

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
  if (status === 'ACTIVE') return 'success';
  if (status === 'INACTIVE') return 'critical';
  if (status === 'NOT_CONFIGURED') return 'noData';
  return 'warning';
}

function ReadinessBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[88px]">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            percent >= 100 ? 'bg-emerald-500' : percent >= 60 ? 'bg-amber-500' : 'bg-red-400',
          )}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  );
}

export function VoiceAssistantAdminView() {
  const [overview, setOverview] = useState<VoiceAssistantAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<VoiceAssistantAdminOrgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncingOrgId, setSyncingOrgId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.voiceAssistant.admin.overview();
      setOverview(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(async (orgId: string) => {
    setSelectedOrgId(orgId);
    setDetailLoading(true);
    try {
      const detail = await api.voiceAssistant.admin.orgDetail(orgId);
      setOrgDetail(detail);
    } catch (err) {
      toast.error('Could not load organization detail', { description: getErrorMessage(err) });
      setOrgDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const syncOrganization = async (orgId: string) => {
    setSyncingOrgId(orgId);
    try {
      const result = await api.voiceAssistant.admin.syncOrganization(orgId);
      toast.success('Sync completed', {
        description: result.message ?? `${result.synced} new conversation(s)`,
      });
      await load();
      if (selectedOrgId === orgId) {
        await loadDetail(orgId);
      }
    } catch (err) {
      toast.error('Sync failed', { description: getErrorMessage(err) });
    } finally {
      setSyncingOrgId(null);
    }
  };

  const filteredRows = useMemo(() => {
    const rows = overview?.assistants ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterMode === 'configured' && row.assistantStatus === 'NOT_CONFIGURED') return false;
      if (
        filterMode === 'issues' &&
        !row.providerWarning &&
        !row.lastError &&
        row.readinessPercent >= 100 &&
        row.assistantStatus !== 'NOT_CONFIGURED'
      ) {
        return false;
      }
      if (!term) return true;
      return (
        row.organizationName.toLowerCase().includes(term) ||
        row.organizationId.toLowerCase().includes(term) ||
        (row.phoneNumber?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [overview?.assistants, search, filterMode]);

  const configuredCount = overview?.summary.configuredOrgs ?? 0;

  const columns: DataTableColumn<VoiceAssistantAdminOverviewRow>[] = [
    {
      key: 'org',
      header: 'Organization',
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{row.organizationName}</p>
          {row.providerWarning && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate">{row.providerWarning}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusChip tone={statusTone(row.assistantStatus)}>{row.assistantStatus}</StatusChip>,
    },
    {
      key: 'readiness',
      header: 'Readiness',
      cell: (row) =>
        row.assistantStatus === 'NOT_CONFIGURED' ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <ReadinessBar percent={row.readinessPercent} />
        ),
    },
    {
      key: 'provider',
      header: 'Provider',
      cell: (row) => (
        <div className="text-xs">
          <StatusChip tone={row.elevenLabsConnected ? 'success' : 'critical'}>
            {row.elevenLabsConnected ? 'Connected' : 'Not configured'}
          </StatusChip>
          <p className="text-[10px] text-muted-foreground mt-1">
            Agent {row.agentProvisioned ? 'yes' : 'no'}
          </p>
        </div>
      ),
    },
    {
      key: 'telephony',
      header: 'Telephony',
      cell: (row) => (
        <div className="text-xs text-muted-foreground">
          <p>{row.telephonyLabel ?? (row.telephonyEnabled ? 'Enabled' : 'Off')}</p>
          <p className="text-[10px] truncate max-w-[120px]">{row.phoneNumber ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'calls',
      header: 'Calls',
      numeric: true,
      cell: (row) => (
        <div className="text-xs tabular-nums">
          <p className="font-semibold text-foreground">{row.totalCalls}</p>
          <p className="text-[10px] text-muted-foreground">today {row.callsToday}</p>
        </div>
      ),
    },
    {
      key: 'escalated',
      header: 'Escalated',
      numeric: true,
      align: 'right',
      cell: (row) => (
        <span className={row.escalatedCalls > 0 ? 'text-amber-600 font-semibold' : ''}>
          {row.escalatedCalls}
        </span>
      ),
    },
    {
      key: 'sync',
      header: 'Last sync',
      cell: (row) => (
        <span className="text-[10px] text-muted-foreground">{timeAgo(row.lastSyncedAt)}</span>
      ),
    },
  ];

  const selectedRow = overview?.assistants.find((a) => a.organizationId === selectedOrgId);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-1">
      <PageHeader
        title="Voice Assistant Overview"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="sq-press inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      {!overview?.providerConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            ElevenLabs provider is not configured on the server.
          </div>
          <p className="mt-1 text-muted-foreground">
            Organizations can configure assistants, but provisioning and sync will remain degraded until the provider is connected.
          </p>
        </div>
      )}

      {error && <ErrorState title="Could not load overview" description={error} onRetry={() => void load()} />}

      {!error && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Organizations" value={overview?.summary.totalOrgs ?? 0} icon={<Building2 className="h-4 w-4" />} />
            <MetricCard
              label="Configured"
              value={configuredCount}
              icon={<Bot className="h-4 w-4" />}
              hint={`${overview?.summary.activeOrgs ?? 0} active`}
            />
            <MetricCard label="Total calls" value={overview?.summary.totalCalls ?? 0} icon={<PhoneCall className="h-4 w-4" />} />
            <MetricCard
              label="Talk minutes"
              value={(overview?.summary.totalMinutes ?? 0).toFixed(1)}
              icon={<Phone className="h-4 w-4" />}
            />
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            {overview?.summary.costTrackingMessage ?? 'Cost tracking not connected yet'}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organizations…"
                className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-xs outline-none focus:border-[color:var(--brand)]"
              />
            </div>
            {(['all', 'configured', 'issues'] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={cn(
                  'rounded-xl px-3 py-2 text-xs font-semibold capitalize',
                  filterMode === mode ? 'sq-tab-active' : 'sq-tab text-muted-foreground',
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <DataTable
            columns={columns}
            rows={filteredRows}
            getRowKey={(row) => row.organizationId}
            loading={loading}
            onRowClick={(row) => void loadDetail(row.organizationId)}
            empty={
              configuredCount === 0 ? (
                <EmptyState
                  title="No voice assistants configured"
                  description="Organizations will appear here once an assistant row exists or conversations are synced."
                />
              ) : (
                <EmptyState title="No organizations match" description="Try adjusting search or filters." />
              )
            }
            rowActions={(row) => (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void loadDetail(row.organizationId);
                  }}
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                >
                  View
                </button>
                <button
                  type="button"
                  disabled={row.assistantStatus === 'NOT_CONFIGURED' || syncingOrgId === row.organizationId}
                  onClick={(e) => {
                    e.stopPropagation();
                    void syncOrganization(row.organizationId);
                  }}
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-40"
                >
                  {syncingOrgId === row.organizationId ? 'Syncing…' : 'Sync'}
                </button>
              </div>
            )}
          />
        </>
      )}

      <DetailDrawer
        open={Boolean(selectedOrgId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrgId(null);
            setOrgDetail(null);
          }
        }}
        eyebrow="Organization voice assistant"
        title={orgDetail?.organization?.companyName ?? selectedRow?.organizationName ?? 'Organization'}
        description={selectedOrgId ? `Org ID: ${selectedOrgId}` : undefined}
        status={
          selectedRow ? (
            <StatusChip tone={statusTone(selectedRow.assistantStatus)}>{selectedRow.assistantStatus}</StatusChip>
          ) : undefined
        }
        widthClassName="sm:max-w-xl"
        footer={
          selectedOrgId ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={selectedRow?.assistantStatus === 'NOT_CONFIGURED' || syncingOrgId === selectedOrgId}
                onClick={() => void syncOrganization(selectedOrgId)}
                className="sq-press rounded-xl bg-[color:var(--brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {syncingOrgId === selectedOrgId ? 'Syncing…' : 'Sync conversations'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(selectedOrgId);
                  toast.success('Organization ID copied');
                }}
                className="sq-press inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-semibold"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Copy org ID
              </button>
            </div>
          ) : undefined
        }
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">Loading…</div>
        ) : !orgDetail ? (
          <EmptyState title="No detail loaded" description="Select an organization from the table." />
        ) : !orgDetail.exists ? (
          <div className="space-y-4 p-5">
            <EmptyState
              title="No assistant configured"
              description="This organization does not have a voice assistant row yet."
            />
            {orgDetail.warnings?.map((warning) => (
              <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
                {warning}
              </p>
            ))}
          </div>
        ) : (
          <div className="space-y-5 p-5">
            {orgDetail.warnings && orgDetail.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
                {orgDetail.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {warning}
                  </p>
                ))}
              </div>
            )}

            <section>
              <h4 className="sq-section-label mb-2">Configuration</h4>
              <div className="grid gap-2 text-xs">
                {[
                  { label: 'Assistant', value: orgDetail.assistant?.name ?? '—' },
                  { label: 'Voice', value: orgDetail.assistant?.voiceName ?? '—' },
                  { label: 'Language', value: orgDetail.assistant?.language ?? '—' },
                  { label: 'Phone', value: orgDetail.assistant?.phoneNumber ?? 'Not assigned' },
                  { label: 'Inbound', value: orgDetail.assistant?.inboundEnabled ? 'On' : 'Off' },
                  { label: 'Outbound', value: orgDetail.assistant?.outboundEnabled ? 'On' : 'Off' },
                  {
                    label: 'Agent',
                    value: orgDetail.assistant?.hasAgent ? 'Provisioned' : 'Not provisioned',
                  },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-semibold text-foreground text-right">{item.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {orgDetail.telephonyStatus && (
              <section>
                <h4 className="sq-section-label mb-2">Telephony</h4>
                <StatusChip tone={orgDetail.telephonyStatus.inboundReady ? 'success' : 'warning'}>
                  {orgDetail.telephonyStatus.label}
                </StatusChip>
                <p className="text-xs text-muted-foreground mt-2">{orgDetail.telephonyStatus.detail}</p>
              </section>
            )}

            {orgDetail.readiness && (
              <section>
                <h4 className="sq-section-label mb-2">Readiness checklist</h4>
                <div className="space-y-1.5">
                  {orgDetail.readiness.checks.map((check) => (
                    <div key={check.key} className="flex items-center gap-2 text-xs">
                      {check.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                      <span className={check.ok ? 'text-muted-foreground' : 'text-foreground'}>{check.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h4 className="sq-section-label mb-2">Usage</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Total calls', value: orgDetail.assistant?.totalCalls ?? 0 },
                  { label: 'Answered', value: orgDetail.assistant?.answeredCalls ?? 0 },
                  { label: 'Missed', value: orgDetail.assistant?.missedCalls ?? 0 },
                  { label: 'Escalated', value: orgDetail.assistant?.escalatedCalls ?? 0 },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    <p className="text-lg font-bold tabular-nums">{item.value}</p>
                  </div>
                ))}
              </div>
            </section>

            {orgDetail.recentConversations && orgDetail.recentConversations.length > 0 ? (
              <section>
                <h4 className="sq-section-label mb-2">Recent conversations (summary)</h4>
                <div className="space-y-2">
                  {orgDetail.recentConversations.map((c) => (
                    <div key={c.id} className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{c.callerNumber ?? 'Unknown'}</span>
                        <StatusChip tone={c.escalated ? 'warning' : 'neutral'}>{c.outcome}</StatusChip>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(c.startedAt).toLocaleString()} · {c.durationSeconds ? `${c.durationSeconds}s` : '—'}
                      </p>
                      {c.summary && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{c.summary}</p>}
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState compact title="No calls yet" description="Sync conversations after the assistant is active." />
            )}

            <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
              {orgDetail.costTracking?.message ?? 'Cost tracking not connected yet'}
            </p>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
