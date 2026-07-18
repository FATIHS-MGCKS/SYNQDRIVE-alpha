import { Activity, AlertTriangle, Bot, Phone, Webhook } from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import {
  VoiceHealthBanner,
  VoiceInlineNotice,
  VoiceMetricCard,
  VoiceSectionHeader,
} from '../../../components/voice-ui';
import type { VoiceControlPlanePlatformStatus } from '../../../lib/api';
import { healthStateTone, platformProviderRows } from './voice-platform-overview.ops';

function centsToEuros(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

interface VoicePlatformStatusPanelProps {
  status: VoiceControlPlanePlatformStatus | null;
  loading?: boolean;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  elevenLabs: <Bot className="h-4 w-4" />,
  twilioIe1: <Phone className="h-4 w-4" />,
  mcpGateway: <Activity className="h-4 w-4" />,
  webhookIngestion: <Webhook className="h-4 w-4" />,
};

export function VoicePlatformStatusPanel({ status, loading }: VoicePlatformStatusPanelProps) {
  if (loading && !status) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <VoiceMetricCard key={i} label="—" value="—" loading />
        ))}
      </div>
    );
  }

  if (!status) {
    return <EmptyState title="Kein Plattformstatus" description="Status konnte nicht geladen werden." />;
  }

  const overallTone = healthStateTone(status.overall.state);

  return (
    <div className="space-y-4" data-testid="voice-platform-status">
      <VoiceHealthBanner
        tone={
          overallTone === 'success'
            ? 'success'
            : overallTone === 'warning'
              ? 'warning'
              : overallTone === 'critical'
                ? 'blocked'
                : 'info'
        }
        title={`Plattform: ${status.overall.label}`}
        description={`Zuletzt geprüft: ${new Date(status.checkedAt).toLocaleString('de-DE')}`}
      />

      <VoiceSectionHeader
        title="Provider & Runtime"
        description="Health basiert auf Live-Prüfungen und Queue-Metriken — nicht nur auf Environment-Variablen."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {platformProviderRows(status).map(provider => (
          <VoiceMetricCard
            key={provider.key}
            label={provider.title}
            value={provider.label}
            hint={provider.message}
            icon={PROVIDER_ICONS[provider.key]}
            tone={
              provider.state === 'healthy'
                ? 'success'
                : provider.state === 'degraded'
                  ? 'degraded'
                  : provider.state === 'incident'
                    ? 'critical'
                    : provider.state === 'disabled'
                      ? 'disabled'
                      : 'neutral'
            }
          />
        ))}
      </div>

      <VoiceSectionHeader title="Betrieb heute" description="Aggregierte Voice-Metriken über alle Mandanten." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <VoiceMetricCard label="Anrufe heute" value={status.operations.callsToday} />
        <VoiceMetricCard label="Minuten heute" value={status.operations.usageMinutesToday} />
        <VoiceMetricCard
          label="Kosten heute (geschätzt)"
          value={centsToEuros(status.operations.estimatedCostTodayCents)}
          hint="Estimated — nicht final"
        />
        <VoiceMetricCard label="Aktive Voice-Orgs" value={status.operations.activeVoiceOrganizations} />
        <VoiceMetricCard
          label="Provisioning-Fehler"
          value={status.operations.failedProvisionings}
          tone={status.operations.failedProvisionings > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <VoiceMetricCard label="Queue Backlog" value={status.queues.webhookBacklog} />
        <VoiceMetricCard label="DLQ (24h)" value={status.webhooks.dlqCount24h} tone={status.webhooks.dlqCount24h > 0 ? 'warning' : 'success'} />
        <VoiceMetricCard
          label="Ø Verarbeitung"
          value={status.webhooks.avgProcessingDelayMs != null ? `${status.webhooks.avgProcessingDelayMs} ms` : '—'}
        />
        <VoiceMetricCard label="Queue failed" value={status.queues.failed} />
      </div>

      {status.activeIncidents.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Aktive Incidents ({status.activeIncidents.length})
          </p>
          <ul className="space-y-1.5">
            {status.activeIncidents.map(incident => (
              <li key={incident.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusChip tone={incident.severity === 'critical' ? 'critical' : 'watch'} className="text-[9px]">
                  {incident.severity}
                </StatusChip>
                {incident.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <VoiceInlineNotice tone="success">Keine aktiven Incidents — Queues und Provider im Normalbetrieb.</VoiceInlineNotice>
      )}
    </div>
  );
}
