import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DetailDrawer, StatusChip, Timeline } from '../../../../../components/patterns';
import { api, type ProcessingActivityRegisterDetail } from '../../../../../lib/api';
import { availableLifecycleActions, isRecordEditable } from '../../../../lib/data-processing-lifecycle.permissions';
import type { LifecycleActionKind } from '../../../../lib/data-processing-lifecycle.types';
import { executeLifecycleAction } from '../../../../lib/data-processing-lifecycle.api';
import { parseLifecycleApiError } from '../../../../lib/data-processing-lifecycle.errors';
import {
  mapDpaAuditTimeline,
  mapReviewCycleTimeline,
} from '../../../../lib/data-processing-timeline.mappers';
import { useLanguage } from '../../../../i18n/LanguageContext';
import { useRentalOrg } from '../../../../RentalContext';
import { LIFECYCLE_STATUS_LABELS } from '../data-processing.constants';
import { LifecycleActionDialog } from './LifecycleActionDialog';
import { DetailPanel, DetailRow, DetailSection, SecondaryId } from './shared/DetailPrimitives';
import { FourEyesBanner } from './shared/FourEyesBanner';
import { LifecycleActionFooter } from './shared/LifecycleActionFooter';
import { LifecycleBlockersPanel } from './shared/LifecycleBlockersPanel';
import { LifecycleStatusHeader } from './shared/LifecycleStatusHeader';
import { VersionHistoryPanel } from './shared/VersionHistoryPanel';

interface Props {
  activityId: string | null;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage?: boolean;
  onUpdated?: () => void;
  onNavigate?: (target: { kind: string; id: string; activityId?: string }) => void;
}

export function ProcessingActivityDetailDrawer({
  activityId,
  orgId,
  open,
  onOpenChange,
  canManage,
  onUpdated,
  onNavigate,
}: Props) {
  const { t } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const [detail, setDetail] = useState<ProcessingActivityRegisterDetail | null>(null);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof api.dataProcessing.register.versions>>>([]);
  const [reviewCycle, setReviewCycle] = useState<Awaited<ReturnType<typeof api.dataProcessing.review.getCycle>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<LifecycleActionKind | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<LifecycleActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const [d, v] = await Promise.all([
          api.dataProcessing.register.get(orgId, id),
          api.dataProcessing.register.versions(orgId, id),
        ]);
        setDetail(d);
        setVersions(v);
        setViewingVersionId(d.id);

        if (d.activeReviewCycleId) {
          const cycle = await api.dataProcessing.review.getCycle(orgId, d.activeReviewCycleId);
          setReviewCycle(cycle);
        } else {
          setReviewCycle(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t('dataProcessing.detail.error.load'));
        setDetail(null);
      } finally {
        setLoading(false);
      }
    },
    [orgId, t],
  );

  useEffect(() => {
    if (!open || !activityId) {
      setDetail(null);
      setVersions([]);
      setReviewCycle(null);
      setError(null);
      return;
    }
    void loadDetail(activityId);
  }, [open, activityId, loadDetail]);

  const handleVersionSelect = async (version: { id: string }) => {
    setViewingVersionId(version.id);
    await loadDetail(version.id);
  };

  const lifecycleActions =
    detail && canManage
      ? availableLifecycleActions({
          entityKind: 'processing-activity',
          status: detail.status,
          isCurrentVersion: detail.isCurrentVersion,
          isTerminal: detail.statusSemantics?.isTerminal,
          hasPermission,
        })
      : [];

  const editable = detail ? isRecordEditable(detail.status, detail.isCurrentVersion) : false;

  const runAction = async (payload: {
    reason?: string;
    scheduleDate?: string;
    extendValidUntil?: string;
  }) => {
    if (!pendingAction || !detail) return;
    setActionLoading(pendingAction);
    setActionError(null);
    try {
      await executeLifecycleAction(pendingAction, {
        orgId,
        entityKind: 'processing-activity',
        entityId: detail.id,
        activityId: detail.id,
        ...payload,
      });
      setDialogOpen(false);
      setPendingAction(null);
      await loadDetail(detail.id);
      onUpdated?.();
    } catch (e) {
      const parsed = parseLifecycleApiError(e);
      setActionError(
        parsed.isConflict
          ? t('dataProcessing.lifecycle.errors.conflict', { message: parsed.message })
          : parsed.message,
      );
    } finally {
      setActionLoading(null);
    }
  };

  const timelineItems = reviewCycle
    ? mapReviewCycleTimeline(reviewCycle)
    : detail?.processors?.length
      ? mapDpaAuditTimeline(
          detail.processors.map((p, i) => ({
            id: p.id,
            eventType: 'PROCESSOR_LINK',
            summary: `${p.label} (${p.status})`,
            createdAt: detail.updatedAt,
          })),
        )
      : [];

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        widthClassName="sm:max-w-2xl"
        eyebrow={t('dataProcessing.detail.activity.eyebrow')}
        title={detail?.title ?? t('dataProcessing.detail.loading')}
        description={detail?.activityCode}
        status={
          detail ? (
            <LifecycleStatusHeader
              status={detail.status}
              versionNumber={detail.versionNumber}
              isCurrentVersion={detail.isCurrentVersion}
              statusSemantics={detail.statusSemantics}
            />
          ) : undefined
        }
        footer={
          <LifecycleActionFooter
            actions={lifecycleActions}
            loadingAction={actionLoading}
            readOnly={!canManage || !detail?.isCurrentVersion}
            onAction={(action) => {
              setPendingAction(action);
              setActionError(null);
              setDialogOpen(true);
            }}
          />
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" aria-label={t('dataProcessing.detail.loading')} />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : detail ? (
          <div className="space-y-6">
            {!editable && detail.isCurrentVersion ? (
              <p className="text-[11px] text-muted-foreground rounded-lg border border-border/60 px-3 py-2">
                {t('dataProcessing.detail.notEditable')}
              </p>
            ) : null}

            <FourEyesBanner
              fourEyesRequired={reviewCycle?.fourEyesRequired}
              reviewCycleStatus={reviewCycle?.status}
            />

            <LifecycleBlockersPanel
              blockingGaps={detail.completeness?.blockingGaps}
              warnings={detail.completeness?.warnings}
              dpiaStatus={detail.dpiaStatus}
            />

            <DetailSection title={t('dataProcessing.detail.sections.overview')}>
              <DetailPanel>
                <DetailRow label={t('dataProcessing.detail.fields.owner')} value={detail.ownerRole ?? detail.ownerUserId ?? '—'} />
                <DetailRow label={t('dataProcessing.detail.fields.reviewer')} value={detail.nextReviewDate ?? '—'} />
                <DetailRow label={t('dataProcessing.detail.fields.dpia')} value={detail.dpiaStatus} />
                <DetailRow label={t('dataProcessing.detail.fields.retention')} value={detail.retention?.description ?? detail.retention?.periodDays ?? '—'} />
                <DetailRow
                  label={t('dataProcessing.detail.fields.runtime')}
                  value={
                    detail.runtimeCoverage
                      ? `${detail.runtimeCoverage.enforcedFlows}/${detail.runtimeCoverage.totalFlows}`
                      : '—'
                  }
                />
                <DetailRow label={t('dataProcessing.detail.fields.id')} value={<SecondaryId id={detail.id} />} />
              </DetailPanel>
            </DetailSection>

            <DetailSection title={t('dataProcessing.detail.sections.scope')}>
              <div className="flex flex-wrap gap-1.5">
                {(detail.dataCategories ?? []).map((c) => (
                  <StatusChip key={c} tone="neutral">
                    {c}
                  </StatusChip>
                ))}
              </div>
              {detail.purposeSummary ? (
                <p className="text-[12px] text-muted-foreground mt-2">{detail.purposeSummary}</p>
              ) : null}
            </DetailSection>

            {detail.legalBasisAssessments?.length ? (
              <DetailSection title={t('dataProcessing.detail.sections.legalBasis')}>
                <ul className="space-y-2">
                  {detail.legalBasisAssessments.map((lb) => (
                    <li key={lb.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate?.({ kind: 'legal-basis', id: lb.id, activityId: detail.id })}
                        className="w-full text-left surface-premium rounded-lg border border-border/60 px-3 py-2 hover:bg-muted/30"
                      >
                        <span className="text-[12px] font-semibold">{lb.legalBasisType}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {LIFECYCLE_STATUS_LABELS[lb.status] ?? lb.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            {detail.enforcementPolicies?.length ? (
              <DetailSection title={t('dataProcessing.detail.sections.enforcement')}>
                <ul className="space-y-2">
                  {detail.enforcementPolicies.map((p) => (
                    <li key={p.id} className="surface-premium rounded-lg border border-border/60 px-3 py-2 text-[12px]">
                      <span className="font-semibold">{p.dataCategory ?? p.processingPurpose ?? p.id.slice(0, 8)}</span>
                      <StatusChip tone="neutral" className="ml-2">
                        {LIFECYCLE_STATUS_LABELS[p.status] ?? p.status}
                      </StatusChip>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            {detail.providerAccessSummary ? (
              <DetailSection title={t('dataProcessing.detail.sections.providers')}>
                <DetailPanel>
                  <DetailRow label={t('dataProcessing.detail.fields.providerActive')} value={detail.providerAccessSummary.active} />
                  <DetailRow label={t('dataProcessing.detail.fields.providerPending')} value={detail.providerAccessSummary.pending} />
                  <DetailRow label={t('dataProcessing.detail.fields.providerRevoked')} value={detail.providerAccessSummary.revoked} />
                  {(detail.providerAccessSummary.conflicts ?? 0) > 0 ? (
                    <p className="text-[11px] text-amber-600 font-medium pt-1">
                      {t('dataProcessing.detail.providerConflicts', {
                        count: detail.providerAccessSummary.conflicts ?? 0,
                      })}
                    </p>
                  ) : null}
                </DetailPanel>
              </DetailSection>
            ) : null}

            {detail.processors?.length ? (
              <DetailSection title={t('dataProcessing.detail.sections.dpa')}>
                <ul className="space-y-2">
                  {detail.processors.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate?.({ kind: 'dpa', id: p.id })}
                        className="w-full text-left surface-premium rounded-lg border border-border/60 px-3 py-2 hover:bg-muted/30"
                      >
                        <span className="text-[12px] font-semibold">{p.label}</span>
                        <StatusChip tone="neutral" className="ml-2">
                          {LIFECYCLE_STATUS_LABELS[p.status] ?? p.status}
                        </StatusChip>
                      </button>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            <VersionHistoryPanel
              versions={versions}
              selectedId={viewingVersionId ?? undefined}
              onSelectVersion={handleVersionSelect}
            />

            {timelineItems.length > 0 ? (
              <DetailSection title={t('dataProcessing.detail.sections.timeline')}>
                <Timeline items={timelineItems} />
              </DetailSection>
            ) : null}

            {detail.disclaimer ? (
              <p className="text-[10px] text-muted-foreground leading-relaxed">{detail.disclaimer}</p>
            ) : null}
          </div>
        ) : null}
      </DetailDrawer>

      <LifecycleActionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        action={pendingAction}
        loading={Boolean(actionLoading)}
        error={actionError}
        onConfirm={runAction}
      />
    </>
  );
}
