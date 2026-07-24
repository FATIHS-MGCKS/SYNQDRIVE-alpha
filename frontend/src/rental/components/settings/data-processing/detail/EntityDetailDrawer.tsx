import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DetailDrawer, Timeline } from '../../../../../components/patterns';
import { api } from '../../../../../lib/api';
import type { DataProcessingDetailTarget } from '../../../../lib/data-processing-detail.types';
import { availableLifecycleActions } from '../../../../lib/data-processing-lifecycle.permissions';
import type { LifecycleActionKind } from '../../../../lib/data-processing-lifecycle.types';
import { executeLifecycleAction } from '../../../../lib/data-processing-lifecycle.api';
import { parseLifecycleApiError } from '../../../../lib/data-processing-lifecycle.errors';
import { mapStatusEventsTimeline } from '../../../../lib/data-processing-timeline.mappers';
import { useLanguage } from '../../../../i18n/LanguageContext';
import { useRentalOrg } from '../../../../RentalContext';
import { LifecycleActionDialog } from './LifecycleActionDialog';
import { DetailPanel, DetailRow, DetailSection, SecondaryId } from './shared/DetailPrimitives';
import { LifecycleActionFooter } from './shared/LifecycleActionFooter';
import { LifecycleStatusHeader } from './shared/LifecycleStatusHeader';

interface Props {
  target: DataProcessingDetailTarget;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage?: boolean;
  onUpdated?: () => void;
  onNavigate?: (target: DataProcessingDetailTarget) => void;
}

type EntityDetail = Record<string, unknown> & { id: string; status: string };

export function EntityDetailDrawer({
  target,
  orgId,
  open,
  onOpenChange,
  canManage,
  onUpdated,
}: Props) {
  const { t } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<LifecycleActionKind | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<LifecycleActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const entityKind = target.kind === 'consent' ? 'consent' : target.kind === 'sharing' ? 'sharing' : target.kind === 'provider-grant' ? 'provider-grant' : target.kind === 'legal-basis' ? 'legal-basis' : 'enforcement-policy';

  const loadDetail = useCallback(async () => {
    if (!target.activityId && (target.kind === 'legal-basis' || target.kind === 'consent' || target.kind === 'sharing')) {
      setError(t('dataProcessing.detail.error.missingActivity'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let d: EntityDetail;
      switch (target.kind) {
        case 'legal-basis':
          d = (await api.dataProcessing.legalBasis.get(orgId, target.activityId!, target.id)) as EntityDetail;
          break;
        case 'provider-grant':
          d = (await api.dataProcessing.providerGrant.get(orgId, target.id)) as EntityDetail;
          break;
        case 'consent':
          d = (await api.dataProcessing.consent.get(orgId, target.activityId!, target.id)) as EntityDetail;
          break;
        case 'sharing':
          d = (await api.dataProcessing.sharing.get(orgId, target.activityId!, target.id)) as EntityDetail;
          break;
        default:
          throw new Error(t('dataProcessing.detail.error.unsupportedEntity'));
      }
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dataProcessing.detail.error.load'));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, target, t]);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      return;
    }
    void loadDetail();
  }, [open, loadDetail]);

  const lifecycleActions =
    detail && canManage
      ? availableLifecycleActions({
          entityKind,
          status: detail.status,
          isCurrentVersion: (detail.isCurrentVersion as boolean | undefined) ?? true,
          hasPermission,
        })
      : [];

  const title =
    target.kind === 'legal-basis'
      ? String(detail?.legalBasisType ?? t('dataProcessing.detail.legalBasis.eyebrow'))
      : target.kind === 'provider-grant'
        ? String(detail?.provider ?? t('dataProcessing.detail.provider.eyebrow'))
        : target.kind === 'consent'
          ? String(detail?.dataSubjectReference ?? t('dataProcessing.detail.consent.eyebrow'))
          : target.kind === 'sharing'
            ? String(detail?.recipient ?? t('dataProcessing.detail.sharing.eyebrow'))
            : t('dataProcessing.detail.loading');

  const runAction = async (payload: { reason?: string }) => {
    if (!pendingAction || !detail) return;
    setActionLoading(pendingAction);
    setActionError(null);
    try {
      await executeLifecycleAction(pendingAction, {
        orgId,
        entityKind,
        entityId: detail.id,
        activityId: target.activityId ?? (detail.processingActivityId as string | undefined),
        reason: payload.reason,
      });
      setDialogOpen(false);
      setPendingAction(null);
      await loadDetail();
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

  const statusEvents = detail?.statusEvents as Array<{ toStatus: string; createdAt: string }> | undefined;

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        widthClassName="sm:max-w-xl"
        eyebrow={t(`dataProcessing.detail.${target.kind === 'provider-grant' ? 'provider' : target.kind}.eyebrow`)}
        title={title}
        status={detail ? <LifecycleStatusHeader status={detail.status} versionNumber={detail.versionNumber as number | undefined} isCurrentVersion={detail.isCurrentVersion as boolean | undefined} /> : undefined}
        footer={
          <LifecycleActionFooter
            actions={lifecycleActions}
            loadingAction={actionLoading}
            readOnly={!canManage}
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
            <DetailSection title={t('dataProcessing.detail.sections.overview')}>
              <DetailPanel>
                {target.kind === 'legal-basis' ? (
                  <>
                    <DetailRow label={t('dataProcessing.detail.fields.legalReference')} value={String(detail.legalReference ?? '—')} />
                    <DetailRow label={t('dataProcessing.detail.fields.review')} value={String(detail.reviewDate ?? '—')} />
                  </>
                ) : null}
                {target.kind === 'provider-grant' ? (
                  <>
                    <DetailRow label={t('dataProcessing.detail.fields.providerStatus')} value={String(detail.providerStatus ?? '—')} />
                    <DetailRow label={t('dataProcessing.detail.fields.vehicles')} value={String(detail.linkedVehicleCount ?? '—')} />
                  </>
                ) : null}
                {target.kind === 'consent' ? (
                  <>
                    <DetailRow label={t('dataProcessing.detail.fields.subject')} value={String(detail.subjectType ?? '—')} />
                    <DetailRow label={t('dataProcessing.detail.fields.purpose')} value={String(detail.purpose ?? '—')} />
                  </>
                ) : null}
                {target.kind === 'sharing' ? (
                  <>
                    <DetailRow label={t('dataProcessing.detail.fields.recipient')} value={String(detail.recipientRole ?? '—')} />
                    <DetailRow label={t('dataProcessing.detail.fields.transfer')} value={String(detail.transferCountry ?? detail.transferMechanism ?? '—')} />
                  </>
                ) : null}
                <DetailRow label={t('dataProcessing.detail.fields.id')} value={<SecondaryId id={detail.id} />} />
              </DetailPanel>
            </DetailSection>

            {statusEvents?.length ? (
              <DetailSection title={t('dataProcessing.detail.sections.timeline')}>
                <Timeline items={mapStatusEventsTimeline(statusEvents)} />
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
