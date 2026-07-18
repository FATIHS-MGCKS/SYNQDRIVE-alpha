import { useState } from 'react';
import { ChevronDown, ExternalLink, FileText } from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import { VoiceInlineNotice, VoiceSectionHeader, VoiceSkeleton } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import { api } from '../../../lib/api';
import type { VoiceAssistantData } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { knowledgeStatusTone } from './voice-knowledge-center.ops';
import type { VoiceKnowledgeSourceSnapshot, VoiceKnowledgeSourceStatus } from './voice-knowledge-center.types';
import { useVoiceKnowledgeCenter } from './useVoiceKnowledgeCenter';

interface VoiceKnowledgeCenterPanelProps {
  orgId: string;
  assistant: VoiceAssistantData;
  onNavigateSettings?: (target: string) => void;
}

export function VoiceKnowledgeCenterPanel({
  orgId,
  assistant,
  onNavigateSettings,
}: VoiceKnowledgeCenterPanelProps) {
  const { t } = useLanguage();
  const { center, loading, error } = useVoiceKnowledgeCenter(orgId, assistant);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <VoiceSkeleton variant="hero" />
        <VoiceSkeleton variant="metrics" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <VoiceSectionHeader
        title={t('voice.knowledge.title')}
        description={t('voice.knowledge.description')}
        actions={
          <StatusChip
            tone={center.freshness === 'good' ? 'success' : center.freshness === 'partial' ? 'watch' : 'critical'}
            className="text-[9px]"
          >
            {t(`voice.knowledge.freshness.${center.freshness}` as 'voice.knowledge.freshness.good')}
          </StatusChip>
        }
      />

      <VoiceInlineNotice tone="info" title={t('voice.knowledge.staticVsLiveTitle')}>
        {t('voice.knowledge.staticVsLiveDesc')}
      </VoiceInlineNotice>

      {error && (
        <VoiceInlineNotice tone="blocked">{error}</VoiceInlineNotice>
      )}

      {center.gaps.length > 0 && (
        <VoiceInlineNotice tone="warning" title={t('voice.knowledge.gapsTitle')}>
          {t('voice.knowledge.gapsDesc', { count: center.gaps.length })}
        </VoiceInlineNotice>
      )}

      <div className="space-y-2 md:hidden">
        {center.sources.map(source => (
          <MobileKnowledgeCard
            key={source.id}
            source={source}
            orgId={orgId}
            expanded={expandedId === source.id}
            onToggle={() => setExpandedId(prev => (prev === source.id ? null : source.id))}
            t={t}
          />
        ))}
      </div>

      <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3">
        {center.sources.map(source => (
          <DesktopKnowledgeCard key={source.id} source={source} orgId={orgId} t={t} />
        ))}
      </div>

      {onNavigateSettings && center.gaps.length > 0 && (
        <button
          type="button"
          onClick={() => onNavigateSettings('settings')}
          className="sq-press inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-4 py-2 text-[11px] font-semibold"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          {t('voice.knowledge.openSettings')}
        </button>
      )}
    </div>
  );
}

function statusLabel(
  t: ReturnType<typeof useLanguage>['t'],
  status: VoiceKnowledgeSourceStatus,
): string {
  switch (status) {
    case 'CONNECTED':
      return t('voice.knowledge.status.connected');
    case 'INCOMPLETE':
      return t('voice.knowledge.status.incomplete');
    case 'STALE':
      return t('voice.knowledge.status.stale');
    case 'NOT_PUBLISHED':
      return t('voice.knowledge.status.not_published');
    case 'ERROR':
      return t('voice.knowledge.status.error');
    default:
      return status;
  }
}

function DesktopKnowledgeCard({
  source,
  orgId,
  t,
}: {
  source: VoiceKnowledgeSourceSnapshot;
  orgId: string;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  return (
    <article className="rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold text-foreground">
            {t(source.labelKey as 'voice.knowledge.source.organization')}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {t(source.dataSourceKey as 'voice.knowledge.dataSource.organizationProfile')}
          </p>
        </div>
        <StatusChip tone={knowledgeStatusTone(source.status)} className="text-[9px]">
          {statusLabel(t, source.status)}
        </StatusChip>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{source.detail}</p>

      <dl className="mt-3 space-y-1 text-[10px] text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>{t('voice.knowledge.origin')}</dt>
          <dd className="font-medium text-foreground">
            {source.origin === 'live' ? t('voice.knowledge.originLive') : t('voice.knowledge.originStatic')}
          </dd>
        </div>
        {source.lastUpdatedAt && (
          <div className="flex justify-between gap-2">
            <dt>{t('voice.knowledge.lastUpdated')}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {new Date(source.lastUpdatedAt).toLocaleDateString()}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt>{t('voice.knowledge.publishedLabel')}</dt>
          <dd className="font-medium text-foreground">
            {source.published ? t('voice.knowledge.publishedYes') : t('voice.knowledge.publishedNo')}
          </dd>
        </div>
      </dl>

      {source.previewDocumentId && source.previewAllowed && (
        <button
          type="button"
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-semibold"
          onClick={() => void api.legalDocuments.open(orgId, source.previewDocumentId!)}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          {t('voice.knowledge.safePreview')}
        </button>
      )}
    </article>
  );
}

function MobileKnowledgeCard({
  source,
  orgId,
  expanded,
  onToggle,
  t,
}: {
  source: VoiceKnowledgeSourceSnapshot;
  orgId: string;
  expanded: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  return (
    <div className="rounded-xl border border-border/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground">
            {t(source.labelKey as 'voice.knowledge.source.organization')}
          </p>
          <StatusChip tone={knowledgeStatusTone(source.status)} className="mt-1 text-[9px]">
            {statusLabel(t, source.status)}
          </StatusChip>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-4 py-3 text-[11px] text-muted-foreground">
          <p>{source.detail}</p>
          <p className="mt-2 text-[10px]">
            {t(source.dataSourceKey as 'voice.knowledge.dataSource.organizationProfile')}
          </p>
          {source.previewDocumentId && source.previewAllowed && (
            <button
              type="button"
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-semibold"
              onClick={() => void api.legalDocuments.open(orgId, source.previewDocumentId!)}
            >
              <Icon name="file-text" className="h-3.5 w-3.5" />
              {t('voice.knowledge.safePreview')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
