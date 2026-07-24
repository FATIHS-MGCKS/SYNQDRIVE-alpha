import { useEffect, useState, type ReactNode } from 'react';
import { History, Loader2 } from 'lucide-react';
import type {
  EvaluationsRecommendationEventRecord,
  EvaluationsRecommendationRecord,
  EvaluationsRecommendationStatus,
} from '@synq/evaluations-insights/evaluations-recommendations';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { EVALUATIONS_TOUCH_TARGET_CLASS } from './evaluations-responsive.constants';
import {
  formatRecommendationDueDate,
  formatRecommendationMoney,
} from '../../lib/evaluations-recommendations-format';
import { EvaluationsRecommendationIntegrations } from './EvaluationsRecommendationIntegrations';
import type { EvaluationsDataQualityNavigationOptions } from '../../lib/evaluations-data-quality-navigation';

const STATUS_KEYS: Record<EvaluationsRecommendationStatus, TranslationKey> = {
  NEW: 'evaluations.actionCenter.status.NEW',
  REVIEWED: 'evaluations.actionCenter.status.REVIEWED',
  ACCEPTED: 'evaluations.actionCenter.status.ACCEPTED',
  REJECTED: 'evaluations.actionCenter.status.REJECTED',
  PLANNED: 'evaluations.actionCenter.status.PLANNED',
  IN_PROGRESS: 'evaluations.actionCenter.status.IN_PROGRESS',
  IMPLEMENTED: 'evaluations.actionCenter.status.IMPLEMENTED',
  MEASURING_IMPACT: 'evaluations.actionCenter.status.MEASURING_IMPACT',
  COMPLETED: 'evaluations.actionCenter.status.COMPLETED',
  CANCELLED: 'evaluations.actionCenter.status.CANCELLED',
};

const CONFIDENCE_KEYS = {
  LOW: 'evaluations.actionCenter.confidence.LOW',
  MEDIUM: 'evaluations.actionCenter.confidence.MEDIUM',
  HIGH: 'evaluations.actionCenter.confidence.HIGH',
  VERY_HIGH: 'evaluations.actionCenter.confidence.VERY_HIGH',
} as const satisfies Record<EvaluationsRecommendationRecord['confidence'], TranslationKey>;

interface EvaluationsRecommendationDetailDrawerProps {
  open: boolean;
  recommendation: EvaluationsRecommendationRecord | null;
  canManage: boolean;
  pending: boolean;
  orgMembers: { id: string; name: string }[];
  events: EvaluationsRecommendationEventRecord[];
  eventsLoading: boolean;
  availableTransitions: EvaluationsRecommendationStatus[];
  onOpenChange: (open: boolean) => void;
  onTransition: (
    id: string,
    status: EvaluationsRecommendationStatus,
    reason?: string,
  ) => Promise<void>;
  onUpdate: (
    id: string,
    patch: Partial<Pick<EvaluationsRecommendationRecord, 'ownerId' | 'dueAt' | 'priority'>>,
  ) => Promise<void>;
  analyticsLocale: string;
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenServiceCase?: (serviceCaseId: string, vehicleId?: string) => void;
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="sq-section-label mb-1">{label}</p>
      <div className="text-[12px] leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function EvaluationsRecommendationDetailDrawer({
  open,
  recommendation,
  canManage,
  pending,
  orgMembers,
  events,
  eventsLoading,
  availableTransitions,
  onOpenChange,
  onTransition,
  onUpdate,
  analyticsLocale,
  onNavigate,
  onOpenTask,
  onOpenServiceCase,
}: EvaluationsRecommendationDetailDrawerProps) {
  const { t } = useLanguage();
  const [rejectReason, setRejectReason] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueAt, setDueAt] = useState('');

  useEffect(() => {
    if (!recommendation) return;
    setOwnerId(recommendation.ownerId ?? '');
    setDueAt(recommendation.dueAt ? recommendation.dueAt.slice(0, 10) : '');
    setRejectReason('');
  }, [recommendation]);

  if (!recommendation) return null;

  const showRejectReason = availableTransitions.includes('REJECTED');

  const primaryActions = availableTransitions.filter((s) =>
    ['REVIEWED', 'ACCEPTED', 'PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'MEASURING_IMPACT', 'COMPLETED'].includes(
      s,
    ),
  );

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={recommendation.title}
      eyebrow={t('evaluations.actionCenter.drawerEyebrow')}
      description={recommendation.description}
      closeLabel={t('evaluations.actionCenter.close')}
      status={
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          {t(STATUS_KEYS[recommendation.status])}
        </span>
      }
      footer={
        canManage ? (
          <div className="flex flex-col gap-2">
            {primaryActions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {primaryActions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={pending}
                    onClick={() => void onTransition(recommendation.id, status)}
                    className={cn('sq-cta px-3 py-2 text-[11px] font-semibold', EVALUATIONS_TOUCH_TARGET_CLASS)}
                  >
                    {pending ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
                    {t(`evaluations.actionCenter.action.${status}` as TranslationKey)}
                  </button>
                ))}
              </div>
            ) : null}
            {showRejectReason ? (
              <div className="space-y-2">
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.actionCenter.rejectReason')}
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                    aria-label={t('evaluations.actionCenter.rejectReason')}
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || rejectReason.trim().length < 10}
                  onClick={() => void onTransition(recommendation.id, 'REJECTED', rejectReason)}
                  className={cn(
                    'rounded-lg border border-red-500/40 px-3 py-2 text-[11px] font-semibold text-red-600 dark:text-red-300',
                    EVALUATIONS_TOUCH_TARGET_CLASS,
                  )}
                >
                  {t('evaluations.actionCenter.action.REJECTED')}
                </button>
              </div>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <DetailBlock label={t('evaluations.actionCenter.field.problem')}>
          {recommendation.description}
        </DetailBlock>
        <DetailBlock label={t('evaluations.actionCenter.field.cause')}>
          {recommendation.rationale}
        </DetailBlock>
        <DetailBlock label={t('evaluations.actionCenter.field.measure')}>
          {recommendation.title}
        </DetailBlock>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DetailBlock label={t('evaluations.actionCenter.field.expectedBenefit')}>
            <span className="tabular-nums">
              {formatRecommendationMoney(recommendation.expectedBenefit, analyticsLocale)}
            </span>
          </DetailBlock>
          <DetailBlock label={t('evaluations.actionCenter.field.estimatedCost')}>
            <span className="tabular-nums">
              {formatRecommendationMoney(recommendation.estimatedCost, analyticsLocale)}
            </span>
          </DetailBlock>
          <DetailBlock label={t('evaluations.actionCenter.field.netBenefit')}>
            <span className="tabular-nums font-semibold">
              {formatRecommendationMoney(recommendation.expectedNetBenefit, analyticsLocale)}
            </span>
          </DetailBlock>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DetailBlock label={t('evaluations.actionCenter.field.confidence')}>
            {t(CONFIDENCE_KEYS[recommendation.confidence])}
          </DetailBlock>
          <DetailBlock label={t('evaluations.actionCenter.field.dataBasis')}>
            {recommendation.sourceType} · {recommendation.sourceId}
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {recommendation.calculationVersion}
            </span>
          </DetailBlock>
        </div>

        {canManage ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
              {t('evaluations.actionCenter.field.owner')}
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                aria-label={t('evaluations.actionCenter.field.owner')}
              >
                <option value="">{t('evaluations.actionCenter.ownerUnassigned')}</option>
                {orgMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
              {t('evaluations.actionCenter.field.due')}
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                aria-label={t('evaluations.actionCenter.field.due')}
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void onUpdate(recommendation.id, {
                  ownerId: ownerId || null,
                  dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                })
              }
              className={cn('sq-cta px-3 py-2 text-[11px] font-semibold sm:col-span-2', EVALUATIONS_TOUCH_TARGET_CLASS)}
            >
              {t('evaluations.actionCenter.saveAssignment')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailBlock label={t('evaluations.actionCenter.field.owner')}>
              {recommendation.ownerId
                ? orgMembers.find((m) => m.id === recommendation.ownerId)?.name ??
                  recommendation.ownerId
                : t('evaluations.actionCenter.ownerUnassigned')}
            </DetailBlock>
            <DetailBlock label={t('evaluations.actionCenter.field.due')}>
              {formatRecommendationDueDate(recommendation.dueAt, analyticsLocale)}
            </DetailBlock>
          </div>
        )}

        {recommendation.affectedEntities.length > 0 ? (
          <DetailBlock label={t('evaluations.actionCenter.field.entities')}>
            <ul className="space-y-1">
              {recommendation.affectedEntities.map((entity) => (
                <li key={`${entity.entityType}:${entity.entityId}`} className="text-[11px]">
                  <span className="font-medium">{entity.label ?? entity.entityId}</span>
                  <span className="text-muted-foreground"> · {entity.entityType}</span>
                </li>
              ))}
            </ul>
          </DetailBlock>
        ) : null}

        <EvaluationsRecommendationIntegrations
          recommendation={recommendation}
          onNavigate={onNavigate}
          onOpenTask={onOpenTask}
          onOpenServiceCase={onOpenServiceCase}
        />

        <section aria-labelledby="eval-rec-history-title">
          <h3
            id="eval-rec-history-title"
            className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            {t('evaluations.actionCenter.history')}
          </h3>
          {eventsLoading ? (
            <p className="text-[11px] text-muted-foreground" role="status">
              {t('evaluations.actionCenter.historyLoading')}
            </p>
          ) : events.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t('evaluations.actionCenter.historyEmpty')}</p>
          ) : (
            <ol className="space-y-2">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="rounded-lg border border-border/50 px-3 py-2 text-[11px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{event.eventType}</span>
                    <time className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(event.createdAt).toLocaleString(analyticsLocale)}
                    </time>
                  </div>
                  {event.previousStatus || event.newStatus ? (
                    <p className="mt-1 text-muted-foreground">
                      {event.previousStatus ?? '—'} → {event.newStatus ?? '—'}
                    </p>
                  ) : null}
                  {event.metadata && typeof event.metadata === 'object' && 'rejectionReason' in event.metadata ? (
                    <p className="mt-1 text-foreground">
                      {String((event.metadata as { rejectionReason?: string }).rejectionReason)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </DetailDrawer>
  );
}
