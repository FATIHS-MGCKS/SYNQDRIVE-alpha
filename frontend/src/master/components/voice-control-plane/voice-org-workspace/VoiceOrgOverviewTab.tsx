import { Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '../../../../components/patterns';
import { VoiceHealthBanner, VoiceMetricCard, VoiceSectionHeader } from '../../../../components/voice-ui';
import type { VoiceControlPlaneOrgWorkspace } from '../../../../lib/api';
import { centsToEuros, formatOrgIdForDisplay, timeAgo } from './voice-org-workspace.ops';

interface VoiceOrgOverviewTabProps {
  orgId: string;
  workspace: VoiceControlPlaneOrgWorkspace;
  onRefresh: () => void;
}

function statusTone(status: string): 'success' | 'warning' | 'critical' | 'neutral' {
  if (['ACTIVE', 'CONNECTED', 'ENABLED', 'TRIAL'].includes(status)) return 'success';
  if (['FAILED', 'SUSPENDED', 'ERROR', 'CANCELLED'].includes(status)) return 'critical';
  if (['PENDING', 'DEGRADED', 'DRAFT', 'PAST_DUE'].includes(status)) return 'warning';
  return 'neutral';
}

export function VoiceOrgOverviewTab({ orgId, workspace, onRefresh }: VoiceOrgOverviewTabProps) {
  const detail = workspace.detail;
  const sub = workspace.subscription as { status?: string; planCode?: string } | null;
  const telephony = detail.telephonyStatus;

  const copyOrgId = async () => {
    try {
      await navigator.clipboard.writeText(orgId);
      toast.success('Organisations-ID kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  return (
    <div className="space-y-4" data-testid="voice-org-tab-overview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VoiceSectionHeader
          title={detail.organization?.companyName ?? 'Organisation'}
          description="Operativer Überblick — keine Transkripte oder Secrets."
        />
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Aktualisieren
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Diagnose-ID:</span>
        <code className="rounded bg-muted px-2 py-0.5 font-mono">{formatOrgIdForDisplay(orgId)}</code>
        <button type="button" onClick={() => void copyOrgId()} className="inline-flex items-center gap-1 text-[color:var(--brand)]">
          <Copy className="h-3 w-3" />
          Kopieren
        </button>
      </div>

      {detail.warnings && detail.warnings.length > 0 && (
        <VoiceHealthBanner
          tone="warning"
          title="Aktive Warnungen"
          description={detail.warnings.join(' · ')}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <VoiceMetricCard
          label="Voice Status"
          value={detail.assistant?.status ?? 'NOT_CONFIGURED'}
          tone={statusTone(detail.assistant?.status ?? 'NOT_CONFIGURED')}
        />
        <VoiceMetricCard
          label="Tarif"
          value={sub?.planCode ?? workspace.billing?.planCode ?? '—'}
        />
        <VoiceMetricCard
          label="Subscription"
          value={sub?.status ?? '—'}
          tone={statusTone(sub?.status ?? '')}
        />
        <VoiceMetricCard
          label="Readiness"
          value={detail.readiness?.ready ? 'Bereit' : 'Offen'}
          hint={`${detail.readiness?.checks.filter(c => c.ok).length ?? 0}/${detail.readiness?.checks.length ?? 0} Checks`}
          tone={detail.readiness?.ready ? 'success' : 'warning'}
        />
      </div>

      {telephony && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
          <h4 className="text-xs font-semibold">Telefonie</h4>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={statusTone(telephony.status)}>{telephony.label}</StatusChip>
            {telephony.inboundReady && <StatusChip tone="success">Inbound bereit</StatusChip>}
            {telephony.outboundEnabled && <StatusChip tone="success">Outbound aktiv</StatusChip>}
          </div>
          <p className="text-[11px] text-muted-foreground">{telephony.detail}</p>
        </div>
      )}

      {detail.readiness && (
        <div className="rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold mb-2">Readiness-Checks</h4>
          <ul className="space-y-1.5">
            {detail.readiness.checks.map(check => (
              <li key={check.key} className="flex items-center justify-between gap-2 text-xs">
                <span>{check.label}</span>
                <StatusChip tone={check.ok ? 'success' : 'warning'}>{check.ok ? 'OK' : 'Offen'}</StatusChip>
              </li>
            ))}
          </ul>
        </div>
      )}

      {workspace.billing && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <VoiceMetricCard label="Minuten (Periode)" value={workspace.billing.consumedMinutes.toFixed(1)} />
          <VoiceMetricCard label="Marge" value={centsToEuros(workspace.billing.marginCents)} />
          <VoiceMetricCard
            label="Letzte Gespräche"
            value={String(detail.recentConversations?.length ?? 0)}
            hint={detail.recentConversations?.[0] ? timeAgo(detail.recentConversations[0].startedAt) : undefined}
          />
        </div>
      )}
    </div>
  );
}
