import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DataCard, ErrorState, SectionHeader, StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterLoadingState, MasterPageSection } from '../../shell';
import { api } from '../../../lib/api';
import { formatRelativeDe, PLATFORM_OPS_REFRESH_MS } from '../platform-ops.utils';
import type { DimoR9WebhookHealthDto } from '../dimo-webhook-health.types';
import {
  dimoR9HintMessages,
  dimoR9OverallLabel,
  dimoR9OverallTone,
  type DimoR9Translate,
} from '../dimo-webhook-health.presentation';

function ChannelCard({
  title,
  channel,
  t,
}: {
  title: string;
  channel: DimoR9WebhookHealthDto['speed'];
  t: DimoR9Translate;
}) {
  const def = channel.definition;
  return (
    <DataCard bodyClassName="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm">{title}</p>
        <StatusChip tone={dimoR9OverallTone(channel.state)}>
          {dimoR9OverallLabel(t, channel.state)}
        </StatusChip>
      </div>
      <p className="text-xs text-muted-foreground">{def?.triggerSemantics ?? '—'}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t('master.platformOps.dimoWebhooks.providerStatusLabel')}</dt>
        <dd>{def?.status ?? t('master.platformOps.dimoWebhooks.unknownStatus')}</dd>
        <dt className="text-muted-foreground">{t('master.platformOps.dimoWebhooks.failureCountLabel')}</dt>
        <dd>{def?.failureCount ?? '—'}</dd>
        <dt className="text-muted-foreground">{t('master.platformOps.dimoWebhooks.subscriptionsLabel')}</dt>
        <dd>
          {channel.subscriberCount} / {channel.expectedSubscriberTokenIds.length}
        </dd>
        <dt className="text-muted-foreground">{t('master.platformOps.dimoWebhooks.tokenIdsLabel')}</dt>
        <dd className="font-mono break-all">{channel.subscriberTokenIds.join(', ') || '—'}</dd>
      </dl>
    </DataCard>
  );
}

export function DimoWebhooksDiagnosticsPanel() {
  const { t } = useLanguage();
  const [data, setData] = useState<DimoR9WebhookHealthDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (manualRefresh = false) => {
      if (!manualRefresh) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await api.admin.platformOps.dimoWebhookHealth(
          manualRefresh ? { refresh: true } : undefined,
        );
        setData(res);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t('master.platformOps.dimoWebhooks.loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load(false);
    const timer = setInterval(() => void load(false), PLATFORM_OPS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && !data) return <MasterLoadingState variant="card" />;
  if (error && !data) {
    return (
      <ErrorState
        title={t('master.platformOps.dimoWebhooks.panelTitle')}
        error={error}
        onRetry={() => void load(true)}
      />
    );
  }
  if (!data) return null;

  const hints = dimoR9HintMessages(t, data);

  return (
    <div className="space-y-4" data-testid="dimo-webhooks-diagnostics">
      <DataCard bodyClassName="p-4 flex flex-wrap items-center gap-3">
        <StatusChip tone={dimoR9OverallTone(data.overall)} dot>
          {dimoR9OverallLabel(t, data.overall)}
        </StatusChip>
        <span className="text-xs text-muted-foreground">
          {t('master.platformOps.dimoWebhooks.providerAccessPrefix')}: {data.providerAccessState}
          {data.checkedAt
            ? ` · ${t('master.platformOps.dimoWebhooks.lastCheckedPrefix')} ${formatRelativeDe(data.checkedAt)}`
            : ''}
          {data.servedFromCache
            ? ` · ${t('master.platformOps.dimoWebhooks.cacheSuffix')}`
            : ` · ${t('master.platformOps.dimoWebhooks.liveSuffix')}`}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('master.platformOps.dimoWebhooks.autoRefreshPrefix')} {Math.round(data.refreshCadenceMs / 1000)}
          {t('master.platformOps.dimoWebhooks.secondsSuffix')} ·{' '}
          {t('master.platformOps.dimoWebhooks.manualMinPrefix')}{' '}
          {Math.round(data.minManualRefreshIntervalMs / 1000)}
          {t('master.platformOps.dimoWebhooks.secondsSuffix')}
        </span>
        <button
          type="button"
          className="sq-btn-secondary text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 ml-auto"
          disabled={refreshing}
          onClick={() => void load(true)}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {t('master.platformOps.dimoWebhooks.refreshNow')}
        </button>
      </DataCard>

      {data.wakePipelineEvidence === 'NOT_EVALUATED' && (
        <p className="text-xs text-muted-foreground px-1">
          {t('master.platformOps.dimoWebhooks.wakeDisclaimer')}
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
        <ChannelCard
          title={t('master.platformOps.dimoWebhooks.speedCardTitle')}
          channel={data.speed}
          t={t}
        />
        <ChannelCard
          title={t('master.platformOps.dimoWebhooks.ignitionCardTitle')}
          channel={data.ignition}
          t={t}
        />
      </div>

      <MasterPageSection>
        <SectionHeader title={t('master.platformOps.dimoWebhooks.cohortSectionTitle')} />
        <DataCard bodyClassName="p-4 text-xs space-y-2 font-mono">
          <p>
            {t('master.platformOps.dimoWebhooks.expectedLabel')}: {data.cohort.expectedTokenIds.join(', ')}
          </p>
          <p>
            {t('master.platformOps.dimoWebhooks.excludedLabel')}: {data.cohort.excludedTokenIds.join(', ')}
          </p>
          {data.cohort.excludedSubscribedTokenIds.length > 0 && (
            <p className="text-red-600">
              {t('master.platformOps.dimoWebhooks.excludedSubscribedLabel')}:{' '}
              {data.cohort.excludedSubscribedTokenIds.join(', ')}
            </p>
          )}
          {data.lastProviderError && (
            <p className="text-muted-foreground">
              {t('master.platformOps.dimoWebhooks.lastErrorPrefix')} ({data.lastProviderError.state}):{' '}
              {data.lastProviderError.message}
            </p>
          )}
        </DataCard>
      </MasterPageSection>
    </div>
  );
}
