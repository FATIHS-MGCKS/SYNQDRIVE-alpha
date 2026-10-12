import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DataCard, ErrorState, SectionHeader, StatusChip } from '../../../components/patterns';
import { MasterLoadingState, MasterPageSection } from '../../shell';
import { api } from '../../../lib/api';
import { formatRelativeDe } from '../platform-ops.utils';
import { PLATFORM_OPS_REFRESH_MS } from '../platform-ops.utils';
import type { DimoR9WebhookHealthDto } from '../dimo-webhook-health.types';
import {
  DIMO_R9_OVERALL_LABEL_DE,
  dimoR9HintMessagesDe,
  dimoR9OverallTone,
} from '../dimo-webhook-health.presentation';

function ChannelCard({
  title,
  channel,
}: {
  title: string;
  channel: DimoR9WebhookHealthDto['speed'];
}) {
  const def = channel.definition;
  return (
    <DataCard bodyClassName="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm">{title}</p>
        <StatusChip tone={dimoR9OverallTone(channel.state)}>
          {DIMO_R9_OVERALL_LABEL_DE[channel.state]}
        </StatusChip>
      </div>
      <p className="text-xs text-muted-foreground">{def?.triggerSemantics ?? '—'}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Provider-Status</dt>
        <dd>{def?.status ?? 'unbekannt'}</dd>
        <dt className="text-muted-foreground">Failure Count</dt>
        <dd>{def?.failureCount ?? '—'}</dd>
        <dt className="text-muted-foreground">Abonnements</dt>
        <dd>
          {channel.subscriberCount} / {channel.expectedSubscriberTokenIds.length}
        </dd>
        <dt className="text-muted-foreground">Token-IDs</dt>
        <dd className="font-mono break-all">{channel.subscriberTokenIds.join(', ') || '—'}</dd>
      </dl>
    </DataCard>
  );
}

export function DimoWebhooksDiagnosticsPanel() {
  const [data, setData] = useState<DimoR9WebhookHealthDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manualRefresh = false) => {
    if (!manualRefresh) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await api.admin.platformOps.dimoWebhookHealth(
        manualRefresh ? { refresh: true } : undefined,
      );
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'DIMO Webhook-Status konnte nicht geladen werden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const t = setInterval(() => void load(false), PLATFORM_OPS_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) return <MasterLoadingState variant="card" />;
  if (error && !data) return <ErrorState title="DIMO Webhooks" error={error} onRetry={() => void load(true)} />;
  if (!data) return null;

  const hints = dimoR9HintMessagesDe(data);

  return (
    <div className="space-y-4" data-testid="dimo-webhooks-diagnostics">
      <DataCard bodyClassName="p-4 flex flex-wrap items-center gap-3">
        <StatusChip tone={dimoR9OverallTone(data.overall)} dot>
          {DIMO_R9_OVERALL_LABEL_DE[data.overall]}
        </StatusChip>
        <span className="text-xs text-muted-foreground">
          Provider-Zugang: {data.providerAccessState}
          {data.checkedAt ? ` · Zuletzt geprüft ${formatRelativeDe(data.checkedAt)}` : ''}
          {data.servedFromCache ? ' · Cache' : ' · Live'}
        </span>
        <span className="text-xs text-muted-foreground">
          Auto-Refresh alle {Math.round(data.refreshCadenceMs / 1000)}s · manuell min.{' '}
          {Math.round(data.minManualRefreshIntervalMs / 1000)}s
        </span>
        <button
          type="button"
          className="sq-btn-secondary text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 ml-auto"
          disabled={refreshing}
          onClick={() => void load(true)}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Jetzt prüfen
        </button>
      </DataCard>

      {data.wakePipelineEvidence === 'NOT_EVALUATED' && (
        <p className="text-xs text-muted-foreground px-1">
          Wake-to-Snapshot und Trip-FSM werden hier nicht End-to-End bewertet — nur DIMO-Webhook-Definitionen
          und Abonnements.
        </p>
      )}

      {hints.length > 0 && (
        <DataCard bodyClassName="p-4 space-y-1">
          {hints.map((h) => (
            <p key={h} className="text-sm text-amber-800 dark:text-amber-200">{h}</p>
          ))}
        </DataCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChannelCard title="Speed-Webhooks" channel={data.speed} />
        <ChannelCard title="Ignition-Webhooks" channel={data.ignition} />
      </div>

      <MasterPageSection>
        <SectionHeader title="Cohort & Ausschlüsse" />
        <DataCard bodyClassName="p-4 text-xs space-y-2 font-mono">
          <p>
            Erwartet: {data.cohort.expectedTokenIds.join(', ')}
          </p>
          <p>
            Ausgeschlossen: {data.cohort.excludedTokenIds.join(', ')}
          </p>
          {data.cohort.excludedSubscribedTokenIds.length > 0 && (
            <p className="text-red-600">
              Unerwartet abonniert (ausgeschlossen): {data.cohort.excludedSubscribedTokenIds.join(', ')}
            </p>
          )}
          {data.lastProviderError && (
            <p className="text-muted-foreground">
              Letzter Fehler ({data.lastProviderError.state}): {data.lastProviderError.message}
            </p>
          )}
        </DataCard>
      </MasterPageSection>
    </div>
  );
}
