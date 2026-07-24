import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DetailDrawer, StatusChip, Timeline } from '../../../../../components/patterns';
import { api, type DataProcessingAgreementDetail } from '../../../../../lib/api';
import { availableLifecycleActions, isRecordEditable } from '../../../../lib/data-processing-lifecycle.permissions';
import type { LifecycleActionKind } from '../../../../lib/data-processing-lifecycle.types';
import { executeLifecycleAction } from '../../../../lib/data-processing-lifecycle.api';
import { parseLifecycleApiError } from '../../../../lib/data-processing-lifecycle.errors';
import { mapDpaAuditTimeline } from '../../../../lib/data-processing-timeline.mappers';
import { useLanguage } from '../../../../i18n/LanguageContext';
import { useRentalOrg } from '../../../../RentalContext';
import { LIFECYCLE_STATUS_LABELS } from '../data-processing.constants';
import { LifecycleActionDialog } from './LifecycleActionDialog';
import { DetailPanel, DetailRow, DetailSection, SecondaryId } from './shared/DetailPrimitives';
import { LifecycleActionFooter } from './shared/LifecycleActionFooter';
import { LifecycleBlockersPanel } from './shared/LifecycleBlockersPanel';
import { LifecycleStatusHeader } from './shared/LifecycleStatusHeader';

interface Props {
  dpaId: string | null;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage?: boolean;
  onUpdated?: () => void;
  onNavigate?: (target: { kind: string; id: string }) => void;
}

export function DpaDetailDrawer({
  dpaId,
  orgId,
  open,
  onOpenChange,
  canManage,
  onUpdated,
  onNavigate,
}: Props) {
  const { t } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const [detail, setDetail] = useState<DataProcessingAgreementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<LifecycleActionKind | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<LifecycleActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const d = await api.dataProcessing.dpa.get(orgId, id);
        setDetail(d);
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
    if (!open || !dpaId) {
      setDetail(null);
      return;
    }
    void loadDetail(dpaId);
  }, [open, dpaId, loadDetail]);

  const lifecycleActions =
    detail && canManage
      ? availableLifecycleActions({
          entityKind: 'dpa',
          status: detail.status,
          isCurrentVersion: detail.isCurrentVersion ?? true,
          hasPermission,
        })
      : [];

  const runAction = async (payload: { reason?: string }) => {
    if (!pendingAction || !detail) return;
    setActionLoading(pendingAction);
    setActionError(null);
    try {
      await executeLifecycleAction(pendingAction, {
        orgId,
        entityKind: 'dpa',
        entityId: detail.id,
        reason: payload.reason,
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

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        widthClassName="sm:max-w-xl"
        eyebrow={t('dataProcessing.detail.dpa.eyebrow')}
        title={detail?.processorName ?? t('dataProcessing.detail.loading')}
        description={detail?.contractReference ?? undefined}
        status={
          detail ? (
            <LifecycleStatusHeader
              status={detail.status}
              versionNumber={detail.versionNumber}
              isCurrentVersion={detail.isCurrentVersion}
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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : detail ? (
          <div className="space-y-6">
            {detail.isCurrentVersion === false ? (
              <p className="text-[11px] text-muted-foreground rounded-lg border border-border/60 px-3 py-2">
                {t('dataProcessing.detail.historicalVersion')}
              </p>
            ) : !isRecordEditable(detail.status, detail.isCurrentVersion ?? true) ? (
              <p className="text-[11px] text-muted-foreground rounded-lg border border-border/60 px-3 py-2">
                {t('dataProcessing.detail.notEditable')}
              </p>
            ) : null}

            <LifecycleBlockersPanel dpaBlockers={detail.governance?.blockers} warnings={detail.governance?.warnings} />

            <DetailSection title={t('dataProcessing.detail.sections.overview')}>
              <DetailPanel>
                <DetailRow label={t('dataProcessing.detail.fields.role')} value={detail.processorRole ?? '—'} />
                <DetailRow label={t('dataProcessing.detail.fields.transfer')} value={detail.primaryTransferMechanism ?? '—'} />
                <DetailRow label={t('dataProcessing.detail.fields.transferStatus')} value={detail.transferAssessmentStatus ?? '—'} />
                <DetailRow label={t('dataProcessing.detail.fields.effective')} value={detail.effectiveFrom ?? '—'} />
                <DetailRow label={t('dataProcessing.detail.fields.review')} value={detail.reviewDate ?? '—'} />
                <DetailRow label={t('dataProcessing.detail.fields.id')} value={<SecondaryId id={detail.id} />} />
              </DetailPanel>
            </DetailSection>

            {detail.linkedActivities?.length ? (
              <DetailSection title={t('dataProcessing.detail.sections.linkedActivities')}>
                <ul className="space-y-2">
                  {detail.linkedActivities.map((la) => (
                    <li key={la.processingActivity.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate?.({ kind: 'processing-activity', id: la.processingActivity.id })}
                        className="w-full text-left surface-premium rounded-lg border border-border/60 px-3 py-2 hover:bg-muted/30 text-[12px] font-semibold"
                      >
                        {la.processingActivity.title}
                        <span className="ml-2 text-[11px] text-muted-foreground font-normal">
                          {la.processingActivity.activityCode}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            {detail.subprocessors?.length ? (
              <DetailSection title={t('dataProcessing.detail.sections.subprocessors')}>
                <ul className="space-y-1.5">
                  {detail.subprocessors.map((s) => (
                    <li key={s.id} className="text-[12px] flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <StatusChip tone="neutral">{LIFECYCLE_STATUS_LABELS[s.status] ?? s.status}</StatusChip>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            {detail.auditEvents?.length ? (
              <DetailSection title={t('dataProcessing.detail.sections.timeline')}>
                <Timeline items={mapDpaAuditTimeline(detail.auditEvents)} />
              </DetailSection>
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
