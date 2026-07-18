import { Copy, Search } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { VoiceSectionHeader } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import type { VoiceControlPlaneOrganizationRow } from '../../../lib/api';
import {
  DEFAULT_VOICE_ORG_FILTERS,
  filterOrganizations,
  maskOrgId,
  nextOrgAction,
  problemStatusTone,
  uniquePlanCodes,
  type VoiceOrgFilters,
} from './voice-platform-overview.ops';

function centsToEuros(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'gerade eben';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `vor ${sec}s`;
  if (sec < 3600) return `vor ${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `vor ${Math.floor(sec / 3600)}h`;
  return `vor ${Math.floor(sec / 86400)}d`;
}

interface VoiceOrganizationsPanelProps {
  organizations: VoiceControlPlaneOrganizationRow[];
  filters: VoiceOrgFilters;
  onFiltersChange: (patch: Partial<VoiceOrgFilters>) => void;
  loading?: boolean;
  onOpenWorkspace: (orgId: string) => void;
  onSuspend: (orgId: string, orgName: string) => void;
}

export function VoiceOrganizationsPanel({
  organizations,
  filters,
  onFiltersChange,
  loading,
  onOpenWorkspace,
  onSuspend,
}: VoiceOrganizationsPanelProps) {
  const filtered = filterOrganizations(organizations, filters);
  const planOptions = uniquePlanCodes(organizations);

  const copyOrgId = async (orgId: string) => {
    try {
      await navigator.clipboard.writeText(orgId);
      toast.success('Organisations-ID kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  return (
    <div className="space-y-4" data-testid="voice-organizations-panel">
      <VoiceSectionHeader
        title="Voice-Organisationen"
        description="Organisationsname ist primär — IDs nur für Diagnose. Keine vollständigen SIDs oder Secrets."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.search}
            onChange={e => onFiltersChange({ search: e.target.value })}
            placeholder="Organisation suchen…"
            aria-label="Organisationen suchen"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs outline-none focus:border-[color:var(--brand)]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Tarif"
            value={filters.plan}
            onChange={v => onFiltersChange({ plan: v })}
            options={[{ value: 'all', label: 'Alle Tarife' }, ...planOptions.map(p => ({ value: p, label: p }))]}
          />
          <FilterSelect
            label="Rollout"
            value={filters.rollout}
            onChange={v => onFiltersChange({ rollout: v })}
            options={[
              { value: 'all', label: 'Alle' },
              { value: 'ENABLED', label: 'Enabled' },
              { value: 'DISABLED', label: 'Disabled' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ]}
          />
          <FilterSelect
            label="Provider"
            value={filters.providerHealth}
            onChange={v => onFiltersChange({ providerHealth: v })}
            options={[
              { value: 'all', label: 'Alle' },
              { value: 'healthy', label: 'Healthy' },
              { value: 'degraded', label: 'Degraded' },
              { value: 'error', label: 'Error' },
              { value: 'not_configured', label: 'Not configured' },
            ]}
          />
          <FilterSelect
            label="Budget"
            value={filters.budgetStatus}
            onChange={v => onFiltersChange({ budgetStatus: v })}
            options={[
              { value: 'all', label: 'Alle' },
              { value: 'ok', label: 'OK' },
              { value: 'near_limit', label: 'Near limit' },
              { value: 'over_limit', label: 'Over limit' },
              { value: 'not_set', label: 'Not set' },
            ]}
          />
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-semibold">
            <input
              type="checkbox"
              checked={filters.provisioningFailed}
              onChange={e => onFiltersChange({ provisioningFailed: e.target.checked })}
            />
            Provisioning-Fehler
          </label>
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-semibold">
            <input
              type="checkbox"
              checked={filters.incidentsOnly}
              onChange={e => onFiltersChange({ incidentsOnly: e.target.checked })}
            />
            Incidents
          </label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-border/40 bg-muted/20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Keine Organisationen" description="Filter anpassen oder auf neue Mandanten warten." />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filtered.map(row => {
            const action = nextOrgAction(row);
            return (
              <article
                key={row.organizationId}
                className="surface-premium rounded-xl border border-border/50 p-4 shadow-[var(--shadow-1)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-foreground">{row.organizationName}</h3>
                    <button
                      type="button"
                      onClick={() => void copyOrgId(row.organizationId)}
                      className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                      title="Organisations-ID kopieren"
                    >
                      <span className="font-mono">{maskOrgId(row.organizationId)}</span>
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <StatusChip tone={problemStatusTone(row.problemStatus)} className="text-[9px]">
                    {row.problemStatus}
                  </StatusChip>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] md:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Tarif</dt>
                    <dd className="font-semibold">{row.planCode ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Subscription</dt>
                    <dd className="font-semibold">{row.subscriptionStatus ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Rollout</dt>
                    <dd className="font-semibold">{row.rolloutStatus ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Voice Status</dt>
                    <dd className="font-semibold">{row.assistantStatus}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Nummer</dt>
                    <dd className="font-mono font-semibold">{row.maskedPhoneNumber ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Agent Deployment</dt>
                    <dd className="font-semibold">{row.agentDeploymentStatus ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Minuten</dt>
                    <dd className="tabular-nums font-semibold">
                      {row.consumedMinutes.toFixed(1)} / {row.remainingMinutes.toFixed(1)} übrig
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Budget</dt>
                    <dd className="font-semibold">{centsToEuros(row.monthlyBudgetCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Letzte Aktivität</dt>
                    <dd className="font-semibold">{timeAgo(row.lastCallAt)}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-3">
                  {action ? (
                    <p className="text-[10px] font-semibold text-[color:var(--brand-ink)]">Nächste Aktion: {action}</p>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Keine dringende Aktion</span>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="rounded-lg border border-border/60 px-2.5 py-1.5 text-[10px] font-semibold"
                      onClick={() => onOpenWorkspace(row.organizationId)}
                    >
                      Workspace
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--status-critical)]/30 px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--status-critical)]"
                      onClick={() => onSuspend(row.organizationId, row.organizationName)}
                    >
                      Suspend
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className={cn('text-[10px] font-semibold')}>
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-[10px]"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export { DEFAULT_VOICE_ORG_FILTERS };
