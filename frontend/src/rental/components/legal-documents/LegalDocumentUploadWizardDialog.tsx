import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog, FormDialog } from '../../../components/patterns';
import { api, type LegalDocumentDto } from '../../../lib/api';
import {
  LEGAL_UPLOAD_WIZARD_STEPS,
} from '../../lib/legal-document-upload-wizard.constants';
import {
  EMPTY_LEGAL_UPLOAD_WIZARD_FORM,
  type LegalDocumentUploadWizardErrors,
  type LegalDocumentUploadWizardForm,
} from '../../lib/legal-document-upload-wizard.types';
import {
  hasValidationErrors,
  parseLegalDocumentApiError,
  validateLegalUploadWizardStep,
} from '../../lib/legal-document-upload-wizard.validation';
import {
  buildLegalUploadParams,
  isScanStatusBlocking,
  scanStatusErrorMessage,
} from '../../lib/legal-document-upload-wizard.utils';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  FormErrorSummary,
  LiveStatusMessage,
} from './legal-form-a11y';
import { LEGAL_UPLOAD_ERROR_SUMMARY_ID, LEGAL_UPLOAD_PROGRESS_STATUS_ID } from './legal-documents-a11y';
import {
  LegalDocumentUploadWizardStepClassification,
  LegalDocumentUploadWizardStepFile,
  LegalDocumentUploadWizardStepReview,
  LegalDocumentUploadWizardStepVersion,
} from './LegalDocumentUploadWizardSteps';

export interface LegalDocumentUploadWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  existingDocs: LegalDocumentDto[];
  canUpload: boolean;
  canSubmitReview: boolean;
  onSuccess: () => Promise<void>;
  initialDocumentType?: string;
}

function isFormDirty(
  form: LegalDocumentUploadWizardForm,
  file: File | null,
  initialDocumentType?: string,
): boolean {
  const baseline = {
    ...EMPTY_LEGAL_UPLOAD_WIZARD_FORM,
    documentType: initialDocumentType ?? '',
  };
  const formChanged = (Object.keys(baseline) as (keyof LegalDocumentUploadWizardForm)[]).some(
    (key) => form[key] !== baseline[key],
  );
  return formChanged || file != null;
}

function WizardStepIndicator({ currentStep }: { currentStep: number }) {
  const { t } = useLanguage();
  const total = LEGAL_UPLOAD_WIZARD_STEPS.length;
  const active = LEGAL_UPLOAD_WIZARD_STEPS.find((s) => s.id === currentStep);
  const progress = Math.round((currentStep / total) * 100);

  return (
    <div className="mb-4 space-y-2" data-testid="legal-upload-wizard-stepper">
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="font-semibold text-foreground">
          {t('legalDocuments.wizard.stepProgress', { current: currentStep, total })}
          {active ? (
            <span className="font-normal text-muted-foreground"> · {t(active.labelKey)}</span>
          ) : null}
        </p>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentStep}
        aria-label={t('legalDocuments.wizard.stepProgressAria', { current: currentStep, total })}
      >
        <div
          className="h-full bg-[var(--brand)] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ol className="hidden gap-2 sm:flex">
        {LEGAL_UPLOAD_WIZARD_STEPS.map((step) => {
          const done = currentStep > step.id;
          const activeStep = currentStep === step.id;
          return (
            <li
              key={step.id}
              aria-current={activeStep ? 'step' : undefined}
              className={
                activeStep
                  ? 'text-[11px] font-semibold text-foreground'
                  : done
                    ? 'text-[11px] text-muted-foreground'
                    : 'text-[11px] text-muted-foreground/60'
              }
            >
              {t(step.labelKey)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function LegalDocumentUploadWizardDialog({
  open,
  onOpenChange,
  orgId,
  existingDocs,
  canUpload,
  canSubmitReview,
  onSuccess,
  initialDocumentType,
}: LegalDocumentUploadWizardDialogProps) {
  const { t } = useLanguage();
  const dialogTitleId = useId();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<LegalDocumentUploadWizardForm>(() => ({
    ...EMPTY_LEGAL_UPLOAD_WIZARD_FORM,
    documentType: initialDocumentType ?? '',
  }));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<LegalDocumentUploadWizardErrors>({});
  const [stationOptions, setStationOptions] = useState<{ value: string; label: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<LegalDocumentDto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const uploadStartedRef = useRef(false);

  const resetState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    uploadStartedRef.current = false;
    setStep(1);
    setForm({
      ...EMPTY_LEGAL_UPLOAD_WIZARD_FORM,
      documentType: initialDocumentType ?? '',
    });
    setFile(null);
    setErrors({});
    setUploadProgress(null);
    setUploadError(null);
    setUploadedDocument(null);
    setUploading(false);
    setSubmitting(false);
  }, [initialDocumentType]);

  useEffect(() => {
    if (!open) return;
    resetState();
  }, [open, resetState]);

  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;
    void api.stations
      .list(orgId, { selectableOnly: true })
      .then((stations) => {
        if (cancelled) return;
        setStationOptions(
          stations.map((s) => ({
            value: s.id,
            label: s.name ?? s.code ?? s.id,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setStationOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  const patchForm = (patch: Partial<LegalDocumentUploadWizardForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof LegalDocumentUploadWizardForm)[]) {
        delete next[key];
      }
      return next;
    });
  };

  const runUpload = useCallback(async () => {
    if (!file || uploadStartedRef.current) return;
    uploadStartedRef.current = true;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const doc = await api.legalDocuments.uploadWithProgress(
        orgId,
        buildLegalUploadParams(form, file),
        {
          onProgress: (percent) => setUploadProgress(percent),
          signal: controller.signal,
        },
      );
      setUploadedDocument(doc);
      setUploadProgress(100);

      if (isScanStatusBlocking(doc.scanStatus)) {
        setUploadError(scanStatusErrorMessage(doc.scanStatus!, t));
      }
    } catch (err) {
      const parsed = parseLegalDocumentApiError(err, t);
      setUploadError(parsed.message);
      if (parsed.field === 'versionLabel') {
        setErrors((prev) => ({ ...prev, versionLabel: parsed.message }));
      }
      uploadStartedRef.current = false;
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  }, [orgId, form, file, t]);

  useEffect(() => {
    if (step === 4 && file && !uploadedDocument && !uploading && !uploadError) {
      void runUpload();
    }
  }, [step, file, uploadedDocument, uploading, uploadError, runUpload]);

  const validateCurrentStep = (): boolean => {
    const nextErrors = validateLegalUploadWizardStep(step, form, file, t, existingDocs);
    setErrors(nextErrors);
    return !hasValidationErrors(nextErrors);
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    if (step < 4) {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (uploading) return;
    if (step === 4) {
      uploadStartedRef.current = false;
      setUploadedDocument(null);
      setUploadProgress(null);
      setUploadError(null);
    }
    setStep((s) => Math.max(1, s - 1));
  };

  const requestClose = () => {
    if (uploading) {
      setAbortConfirmOpen(true);
      return;
    }
    if (step < 4 && isFormDirty(form, file, initialDocumentType)) {
      setAbortConfirmOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const handleConfirmAbort = () => {
    abortRef.current?.abort();
    setAbortConfirmOpen(false);
    onOpenChange(false);
  };

  const finishSuccess = async (message: string) => {
    await onSuccess();
    toast.success(message);
    onOpenChange(false);
  };

  const handleSaveDraft = async () => {
    if (!uploadedDocument || submitting || uploading || uploadError) return;
    setSubmitting(true);
    try {
      await finishSuccess(t('legalDocuments.wizard.draftSaved'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReview = async () => {
    if (!uploadedDocument || !canSubmitReview || submitting || uploading || uploadError) return;
    setSubmitting(true);
    try {
      await api.legalDocuments.submitForReview(orgId, uploadedDocument.id, {
        changeSummary: form.changeSummary.trim() || undefined,
      });
      await finishSuccess(t('legalDocuments.wizard.reviewRequested'));
    } catch (err) {
      toast.error(parseLegalDocumentApiError(err, t).message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeStep = LEGAL_UPLOAD_WIZARD_STEPS.find((s) => s.id === step);
  const activeStepLabel = activeStep ? t(activeStep.labelKey) : '';

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
          else onOpenChange(true);
        }}
        maxWidthClassName="sm:max-w-2xl"
        hideClose={uploading || submitting}
        title={
          <span id={dialogTitleId}>{t('legalDocuments.wizard.title')}</span>
        }
        description={t('legalDocuments.wizard.description')}
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={requestClose}
              disabled={uploading || submitting}
            >
              {t('legalDocuments.wizard.cancel')}
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={uploading || submitting}
                >
                  {t('legalDocuments.wizard.back')}
                </Button>
              ) : null}
              {step < 4 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleNext}
                  disabled={!canUpload || uploading}
                  data-testid="legal-upload-wizard-next"
                >
                  {t('legalDocuments.wizard.next')}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSaveDraft()}
                    disabled={
                      !canUpload ||
                      !uploadedDocument ||
                      uploading ||
                      submitting ||
                      !!uploadError
                    }
                    data-testid="legal-upload-save-draft"
                  >
                    {submitting ? <Loader2 className="animate-spin" /> : null}
                    {t('legalDocuments.wizard.saveDraft')}
                  </Button>
                  {canSubmitReview ? (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void handleRequestReview()}
                      disabled={
                        !uploadedDocument ||
                        uploading ||
                        submitting ||
                        !!uploadError
                      }
                      data-testid="legal-upload-request-review"
                    >
                      {submitting ? <Loader2 className="animate-spin" /> : null}
                      {t('legalDocuments.wizard.requestReview')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        }
      >
        <div
          role="form"
          aria-labelledby={dialogTitleId}
          data-testid="legal-upload-wizard-dialog"
          data-step={step}
          className="legal-upload-wizard"
        >
          <WizardStepIndicator currentStep={step} />

          <FormErrorSummary
            id={LEGAL_UPLOAD_ERROR_SUMMARY_ID}
            title={t('legalDocuments.wizard.errorSummary')}
            errors={errors}
          />

          {uploadProgress != null ? (
            <LiveStatusMessage id={LEGAL_UPLOAD_PROGRESS_STATUS_ID}>
              {uploading
                ? t('legalDocuments.wizard.uploadLive', { percent: uploadProgress })
                : uploadProgress === 100
                  ? t('legalDocuments.wizard.uploadComplete')
                  : ''}
            </LiveStatusMessage>
          ) : null}

          <div
            role="region"
            aria-label={activeStepLabel}
            aria-live="polite"
          >
            {step === 1 ? (
              <LegalDocumentUploadWizardStepClassification
                form={form}
                errors={errors}
                onChange={patchForm}
                stationOptions={stationOptions}
              />
            ) : null}
            {step === 2 ? (
              <LegalDocumentUploadWizardStepVersion
                form={form}
                errors={errors}
                onChange={patchForm}
              />
            ) : null}
            {step === 3 ? (
              <LegalDocumentUploadWizardStepFile
                file={file}
                errors={errors}
                onFileSelected={setFile}
                disabled={uploading}
              />
            ) : null}
            {step === 4 ? (
              <LegalDocumentUploadWizardStepReview
                form={form}
                file={file}
                uploadedDocument={uploadedDocument}
                uploadProgress={uploadProgress}
                uploadError={uploadError}
                canRequestReview={canSubmitReview}
              />
            ) : null}
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={abortConfirmOpen}
        onOpenChange={setAbortConfirmOpen}
        title={t('legalDocuments.wizard.abortTitle')}
        description={
          uploading
            ? t('legalDocuments.wizard.abortUploading')
            : t('legalDocuments.wizard.abortDirty')
        }
        confirmLabel={t('legalDocuments.wizard.abortConfirm')}
        cancelLabel={t('legalDocuments.wizard.abortContinue')}
        tone="critical"
        onConfirm={handleConfirmAbort}
      />
    </>
  );
}
