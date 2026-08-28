import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { DetailDrawer } from '../../../components/patterns';
import { StatusChip } from '../../../components/patterns';
import { buildOriginContextHint } from '../../../lib/document-upload-context';
import { useDocumentExtractionFlow } from '../../hooks/useDocumentExtractionFlow';
import { useDocumentFollowUpSuggestions } from '../../hooks/useDocumentFollowUpSuggestions';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import type { FlowStatus } from './document-extraction.shared';
import { DocumentExtractionFlowStatus } from './DocumentExtractionFlowStatus';
import { DocumentExtractionReviewPanel } from './DocumentExtractionReviewPanel';
import { DocumentApplyResultPanel } from './DocumentApplyResultPanel';
import { DocumentFollowUpSuggestionsPanel } from './DocumentFollowUpSuggestionsPanel';
import { DocumentIntakeUploadZone } from './DocumentIntakeUploadZone';
import { DocumentClassificationResultPanel } from './DocumentClassificationResultPanel';
import { canShowApplyDone } from '../../lib/document-apply-result';
import type { VehicleDocumentCategoryId } from '../../lib/vehicle-file-summary.types';
import {
  resolveDocumentTypeLabel,
  resolveFlowStatusLabel,
  resolveHostErrorMessage,
  resolveProcessingStepLabels,
  resolveSupportedFormatsLabel,
  resolveValidationMessage,
} from '../../lib/document-intake-i18n';

export type DocumentDrawerMode = 'upload' | 'review' | 'view';

export interface VehicleDocumentUploadDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  vehicleLabel: string;
  categoryId?: VehicleDocumentCategoryId;
  mode?: DocumentDrawerMode;
  extractionId?: string | null;
  fileName?: string | null;
  onComplete?: () => void;
  onEntityNavigate?: (target: { view: string; tab?: string; entityId: string }) => void;
}

export function VehicleDocumentUploadDrawer({
  open,
  onOpenChange,
  vehicleId,
  vehicleLabel,
  mode = 'upload',
  extractionId: initialExtractionId,
  fileName,
  onComplete,
  onEntityNavigate,
}: VehicleDocumentUploadDrawerProps) {
  const { t, locale } = useLanguage();
  const { orgId: rentalOrgId } = useRentalOrg();
  const [pendingTypeSelection, setPendingTypeSelection] = useState('AUTO');
  const handleComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  const flow = useDocumentExtractionFlow({
    vehicleId,
    orgId: rentalOrgId,
    initialDocType: 'AUTO',
    optionalContextType: 'VEHICLE',
    optionalContextId: vehicleId,
    uploadSource: 'documents_tab',
    sourceSurface: 'vehicle_detail',
    onComplete: handleComplete,
  });

  const originContextHint = useMemo(
    () => buildOriginContextHint(vehicleLabel, t('docUpload.drawer.originSurface')),
    [t, vehicleLabel],
  );

  const docTypeOptions = useMemo(() => {
    const auto = flow.metadata?.classificationOptions ?? [
      { value: 'AUTO', labelKey: 'documentExtraction.classification.AUTO' },
    ];
    const types = flow.metadata?.documentTypes ?? [];
    return [...auto, ...types];
  }, [flow.metadata]);

  const typeLabel = useCallback(
    (labelKey: string, fallback?: string) => {
      const translated = t(labelKey as Parameters<typeof t>[0]);
      return translated === labelKey ? (fallback ?? labelKey) : translated;
    },
    [t],
  );

  const flowStatusLabel = useCallback(
    (status: FlowStatus) => resolveFlowStatusLabel(status, t),
    [t],
  );

  const processingStepLabels = useMemo(() => resolveProcessingStepLabels(t), [t]);

  const validationError = useMemo(
    () =>
      flow.validationErrorCode
        ? resolveValidationMessage(flow.validationErrorCode, t, flow.metadata?.maxUploadMb ?? 10)
        : null,
    [flow.metadata?.maxUploadMb, flow.validationErrorCode, t],
  );

  const resolvedErrorMessage = useMemo(
    () =>
      resolveHostErrorMessage(
        flow.hostErrorKey,
        flow.errorMessage,
        t,
        flow.actionPlanBlockedReason,
      ),
    [flow.actionPlanBlockedReason, flow.errorMessage, flow.hostErrorKey, t],
  );

  const drawerTitle = useMemo(() => {
    if (mode === 'review') return t('docUpload.drawer.title.review');
    if (mode === 'view') return t('docUpload.drawer.title.view');
    return t('docUpload.drawer.title.upload');
  }, [mode, t]);

  const supportedFormatsLabel = useMemo(() => {
    if (flow.metadata?.extensions?.length) {
      return resolveSupportedFormatsLabel(
        flow.metadata.extensions,
        flow.metadata.maxUploadMb ?? 10,
        t,
      );
    }
    return t('docUpload.supportedFormats');
  }, [flow.metadata, t]);

  useEffect(() => {
    if (flow.flow === 'awaiting_type' && flow.record?.detectedDocumentType) {
      setPendingTypeSelection(flow.record.detectedDocumentType);
    }
  }, [flow.flow, flow.record?.detectedDocumentType]);

  useEffect(() => {
    if (!open) {
      flow.handleReset();
      return;
    }
    if ((mode === 'review' || mode === 'view') && initialExtractionId) {
      void flow.openReview(initialExtractionId, fileName);
    } else {
      flow.handleReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/mode driven
  }, [open, mode, initialExtractionId, fileName]);

  const close = () => onOpenChange(false);

  const applyDone = canShowApplyDone(flow.record?.status, flow.record?.applyResult);

  const orgId = flow.record?.organizationId ?? rentalOrgId ?? '';
  const followUpEnabled =
    !!flow.extractionId &&
    flow.flow !== 'idle' &&
    flow.flow !== 'uploading' &&
    flow.flow !== 'processing';
  const followUp = useDocumentFollowUpSuggestions({
    orgId: orgId || null,
    vehicleId,
    extractionId: flow.extractionId,
    enabled: followUpEnabled && !!orgId,
  });

  const footer =
    flow.flow === 'ready' || flow.flow === 'applying' || flow.flow === 'apply_failed' ? (
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={close}
          disabled={flow.flow === 'applying'}
          className="sq-press rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground"
        >
          {t('vehicle.documents.close')}
        </button>
        {flow.flow === 'ready' ? (
          <button
            type="button"
            onClick={() => void flow.handleConfirm()}
            disabled={!flow.canConfirmActionPlan}
            className="sq-press ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--status-success)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            <Icon name="check-circle" className="w-3.5 h-3.5" />
            {t('docUpload.confirmAndFile')}
          </button>
        ) : null}
      </div>
    ) : (flow.flow === 'done' || flow.flow === 'partially_done') && applyDone ? (
      <button
        type="button"
        onClick={close}
        className="sq-press rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground"
      >
        {t('docUpload.done')}
      </button>
    ) : undefined;

  const showReview =
    flow.flow === 'ready' ||
    flow.flow === 'applying' ||
    flow.flow === 'apply_failed' ||
    flow.flow === 'partially_done' ||
    (mode === 'view' && flow.flow === 'done');

  const showAwaitingType = flow.flow === 'awaiting_type';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={t('docUpload.drawer.eyebrow')}
      title={drawerTitle}
      description={t('docUpload.drawer.description')}
      widthClassName="sm:max-w-xl"
      status={
        <StatusChip tone={flow.flow === 'failed' ? 'critical' : flow.flow === 'duplicate_blocked' ? 'watch' : flow.flow === 'ready' ? 'watch' : 'info'}>
          {flowStatusLabel(flow.flow)}
        </StatusChip>
      }
      footer={footer}
    >
      <div className="space-y-4">
        {mode === 'upload' && flow.flow === 'idle' && (
          <DocumentIntakeUploadZone
            acceptAttr={flow.acceptAttr}
            supportedFormatsLabel={supportedFormatsLabel}
            onFilesSelected={(files) => {
              const file = Array.from(files)[0];
              if (file) void flow.handleFile(file);
            }}
            dropzoneLabel={t('docUpload.dropzone')}
            dropzoneActiveLabel={t('docUpload.dropzoneActive')}
            browseLabel={t('docUpload.browse')}
            validationError={validationError}
            contextHint={originContextHint}
            compact
          />
        )}

        <DocumentExtractionFlowStatus
          flow={flow.flow}
          uploadedFileName={flow.uploadedFileName}
          errorMessage={resolvedErrorMessage}
          validationError={validationError}
          uploadContext={flow.uploadContext}
          record={flow.record}
          duplicateBlocked={flow.duplicateBlocked}
          uploadDuplicateWarning={flow.uploadDuplicateWarning}
          pollNetworkWarning={flow.pollNetworkWarning}
          showLongRunningHint={flow.showLongRunningHint}
          processingStartedAt={flow.processingStartedAt}
          processingStepLabels={processingStepLabels}
          awaitingTypeDetail={t('docUpload.awaitingTypeStepDetail')}
          retryDetail={
            flow.flow === 'retrying'
              ? t('docUpload.retryStepDetail')
              : t('docUpload.retryAtFailedStep')
          }
          elapsedPrefix={t('docUpload.processingElapsed')}
          longRunningHint={t('docUpload.longRunningHint')}
          safeLeaveHint={t('docUpload.safeLeaveHint')}
          networkWarning={t('docUpload.networkWarning')}
          flowStatusLabel={flowStatusLabel}
          onRetry={() => void flow.handleRetry()}
          onReset={flow.handleReset}
          onAuthorizedReupload={(reason) => void flow.handleAuthorizedReupload(reason)}
        />

        {showAwaitingType && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <h3 className="text-[13px] font-semibold text-foreground">{t('docUpload.awaitingTypeTitle')}</h3>
            <p className="text-[11px] text-muted-foreground">{t('docUpload.awaitingTypeHint')}</p>
            <DocumentClassificationResultPanel
              record={flow.record}
              locale={locale}
              t={t}
              typeLabel={typeLabel}
              mode="awaiting_type"
              docTypeOptions={docTypeOptions}
              pendingTypeSelection={pendingTypeSelection}
              onPendingTypeChange={setPendingTypeSelection}
              onSetDocumentType={(type, reextract) => void flow.handleSetDocumentType(type, reextract)}
            />
          </div>
        )}

        {showReview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <Icon name="file-text" className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
                {flow.uploadedFileName || t('docUpload.drawer.documentFallback')}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {resolveDocumentTypeLabel(flow.confirmedDocType, t)}
              </span>
            </div>

            {resolvedErrorMessage ? (
              <p className="text-[11px] text-[color:var(--status-critical)]">{resolvedErrorMessage}</p>
            ) : null}

            <DocumentExtractionReviewPanel
              confirmedDocType={flow.confirmedDocType}
              editedFields={flow.editedFields}
              plausibility={flow.plausibility}
              record={flow.record}
              editingFields={flow.editingFields}
              readOnly={flow.flow !== 'ready'}
              canEdit={flow.flow === 'ready'}
              fieldsTitle={t('docUpload.detectedFields')}
              plausibilityTitle={t('docUpload.plausibilityTitle')}
              onToggleEdit={() => flow.setEditingFields(!flow.editingFields)}
              entityReviewOrgId={flow.record?.organizationId ?? ''}
              entityReviewVehicleId={vehicleId}
              entityReviewExtractionId={flow.extractionId}
              entityReviewLocale={locale}
              entityReviewT={t}
              onSchemaReviewUpdated={flow.handleSchemaReviewUpdated}
              onActionPlanPreviewStateChange={flow.handleActionPlanPreviewState}
              onFieldChange={(index, value) => {
                const next = [...flow.editedFields];
                next[index] = { ...next[index], value };
                flow.setEditedFields(next);
              }}
              footerSlot={
                flow.flow === 'ready' && flow.record?.allowedActions?.includes('reextract') !== false ? (
                  <button
                    type="button"
                    onClick={() => void flow.handleReextract()}
                    className="text-[10px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {t('vehicle.documents.reExtract')}
                  </button>
                ) : null
              }
            />

            <DocumentApplyResultPanel
              flow={flow.flow}
              applyResult={flow.record?.applyResult ?? null}
              actionPlanPreview={flow.actionPlanPreview}
              pending={flow.flow === 'applying'}
              retryPending={flow.applyRetryPending}
              t={t}
              onRetryFailed={() => void flow.handleRetryFailedActions()}
              onEntityNavigate={onEntityNavigate}
            />

            {orgId ? (
              <DocumentFollowUpSuggestionsPanel
                orgId={orgId}
                vehicleId={vehicleId}
                extractionId={flow.extractionId}
                suggestions={followUp.suggestions}
                loading={followUp.loading}
                t={t}
                onRefresh={() => void followUp.reload()}
              />
            ) : null}
          </div>
        )}

        {flow.flow === 'done' && mode === 'upload' && applyDone && (
          <div className="rounded-xl border border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06] p-6 text-center">
            <Icon name="check-circle" className="mx-auto mb-2 h-8 w-8 text-[color:var(--status-success)]" />
            <p className="text-[13px] font-semibold text-foreground">{t('vehicle.documents.applied')}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {resolveDocumentTypeLabel(flow.confirmedDocType, t)}
            </p>
            {orgId ? (
              <div className="mt-4 text-left">
                <DocumentFollowUpSuggestionsPanel
                  orgId={orgId}
                  vehicleId={vehicleId}
                  extractionId={flow.extractionId}
                  suggestions={followUp.suggestions}
                  loading={followUp.loading}
                  t={t}
                  onRefresh={() => void followUp.reload()}
                />
              </div>
            ) : null}
          </div>
        )}

        {flow.flow === 'partially_done' && applyDone && (
          <div className="rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] p-4">
            <p className="text-[12px] font-semibold text-foreground">{t('vehicle.documents.partiallyApplied')}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t('vehicle.documents.requiredDone')}
            </p>
            {orgId ? (
              <div className="mt-3">
                <DocumentFollowUpSuggestionsPanel
                  orgId={orgId}
                  vehicleId={vehicleId}
                  extractionId={flow.extractionId}
                  suggestions={followUp.suggestions}
                  loading={followUp.loading}
                  t={t}
                  onRefresh={() => void followUp.reload()}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </DetailDrawer>
  );
}
