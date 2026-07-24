import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { ConfirmDialog, FormDialog } from '../../../../../components/patterns';
import { useLanguage } from '../../../../i18n/LanguageContext';
import type { DataProcessingPermissions } from '../../../../lib/data-processing-permissions';
import { submitDataProcessingWizardDraft, parseDataProcessingApiError } from '../../../../lib/data-processing-wizard.api';
import { DATA_PROCESSING_WIZARD_STEPS } from '../../../../lib/data-processing-wizard.constants';
import {
  EMPTY_DATA_PROCESSING_WIZARD_FORM,
  type DataProcessingWizardForm,
  type DataProcessingWizardStepId,
} from '../../../../lib/data-processing-wizard.types';
import {
  hasValidationErrors,
  isWizardFormDirty,
  validateDataProcessingWizardDraft,
  validateDataProcessingWizardReview,
  validateDataProcessingWizardStep,
} from '../../../../lib/data-processing-wizard.validation';
import {
  DataProcessingWizardStepDataSubjects,
  DataProcessingWizardStepProcedure,
  DataProcessingWizardStepPurposeLegal,
  DataProcessingWizardStepRecipients,
  DataProcessingWizardStepResources,
  DataProcessingWizardStepRetention,
  DataProcessingWizardStepRiskReview,
} from './DataProcessingWizardSteps';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  permissions: DataProcessingPermissions;
  onSuccess: () => Promise<void> | void;
}

function WizardStepper({ currentStep }: { currentStep: DataProcessingWizardStepId }) {
  const { t } = useLanguage();
  const total = DATA_PROCESSING_WIZARD_STEPS.length;
  const active = DATA_PROCESSING_WIZARD_STEPS.find((step) => step.id === currentStep);
  const progress = Math.round((currentStep / total) * 100);

  return (
    <div className="mb-4 space-y-2" data-testid="dp-wizard-stepper">
      <p className="text-xs font-semibold text-foreground">
        {t('dataProcessing.wizard.stepProgress', { current: currentStep, total })}
        {active ? <span className="font-normal text-muted-foreground"> · {t(active.labelKey)}</span> : null}
      </p>
      <div
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentStep}
        aria-label={t('dataProcessing.wizard.stepProgressAria', { current: currentStep, total })}
      >
        <div className="h-full bg-[var(--brand)] transition-all" style={{ width: `${progress}%` }} />
      </div>
      <ol className="hidden gap-2 overflow-x-auto sm:flex">
        {DATA_PROCESSING_WIZARD_STEPS.map((step) => (
          <li
            key={step.id}
            aria-current={currentStep === step.id ? 'step' : undefined}
            className={
              currentStep === step.id
                ? 'shrink-0 text-[11px] font-semibold text-foreground'
                : 'shrink-0 text-[11px] text-muted-foreground'
            }
          >
            {t(step.labelKey)}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DataProcessingWizardDialog({
  open,
  onOpenChange,
  orgId,
  permissions,
  onSuccess,
}: Props) {
  const { t } = useLanguage();
  const errorSummaryId = useId();
  const [step, setStep] = useState<DataProcessingWizardStepId>(1);
  const [form, setForm] = useState<DataProcessingWizardForm>(EMPTY_DATA_PROCESSING_WIZARD_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const submitLockRef = useRef(false);

  const baseline = useMemo(() => ({ ...EMPTY_DATA_PROCESSING_WIZARD_FORM }), []);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm(EMPTY_DATA_PROCESSING_WIZARD_FORM);
      setErrors({});
      setSubmitError(null);
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }, [open]);

  const patchForm = useCallback((patch: Partial<DataProcessingWizardForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setSubmitError(null);
  }, []);

  const translateErrors = useCallback(
    (raw: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [key, value.startsWith('dataProcessing.') ? t(value) : value]),
      ),
    [t],
  );

  const attemptClose = useCallback(() => {
    if (isWizardFormDirty(form, baseline)) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }, [baseline, form, onOpenChange]);

  const goNext = () => {
    const stepErrors = validateDataProcessingWizardStep(step, form, 'draft');
    if (hasValidationErrors(stepErrors)) {
      setErrors(translateErrors(stepErrors));
      return;
    }
    setErrors({});
    setStep((current) => Math.min(7, current + 1) as DataProcessingWizardStepId);
  };

  const goBack = () => {
    setErrors({});
    setStep((current) => Math.max(1, current - 1) as DataProcessingWizardStepId);
  };

  const runSubmit = async (requestReview: boolean) => {
    if (submitLockRef.current || submitting) return;
    const validation = requestReview
      ? validateDataProcessingWizardReview(form)
      : validateDataProcessingWizardDraft(form);
    if (hasValidationErrors(validation)) {
      setErrors(translateErrors(validation));
      setSubmitError(t('dataProcessing.wizard.errors.validationFailed'));
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setErrors({});

    try {
      await submitDataProcessingWizardDraft(orgId, form, { requestReview });
      await onSuccess();
      onOpenChange(false);
    } catch (error) {
      const message = parseDataProcessingApiError(error);
      setSubmitError(message.startsWith('dataProcessing.') ? t(message) : message);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const stepContent = (() => {
    const shared = { form, errors, onChange: patchForm };
    switch (step) {
      case 1:
        return <DataProcessingWizardStepProcedure {...shared} permissions={permissions} />;
      case 2:
        return <DataProcessingWizardStepPurposeLegal {...shared} />;
      case 3:
        return <DataProcessingWizardStepDataSubjects {...shared} />;
      case 4:
        return <DataProcessingWizardStepResources {...shared} orgId={orgId} />;
      case 5:
        return <DataProcessingWizardStepRecipients {...shared} />;
      case 6:
        return <DataProcessingWizardStepRetention {...shared} />;
      case 7:
        return (
          <DataProcessingWizardStepRiskReview
            {...shared}
            canRequestReview={permissions.canRequestReview}
            submitError={submitError}
            submitting={submitting}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) attemptClose();
        }}
        maxWidthClassName="sm:max-w-3xl"
        hideClose
        title={t('dataProcessing.wizard.title')}
        description={t('dataProcessing.wizard.subtitle')}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={attemptClose} disabled={submitting}>
                {t('dataProcessing.wizard.cancel')}
              </Button>
              {step > 1 ? (
                <Button type="button" variant="outline" onClick={goBack} disabled={submitting}>
                  {t('dataProcessing.wizard.back')}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {step < 7 ? (
                <Button type="button" onClick={goNext} disabled={submitting}>
                  {t('dataProcessing.wizard.next')}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => void runSubmit(false)}
                  >
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('dataProcessing.wizard.saveDraft')}
                  </Button>
                  {permissions.canRequestReview ? (
                    <Button type="button" disabled={submitting} onClick={() => void runSubmit(true)}>
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {t('dataProcessing.wizard.requestReview')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        }
      >
        <WizardStepper currentStep={step} />
        {Object.keys(errors).length > 0 ? (
          <div
            id={errorSummaryId}
            role="alert"
            className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive"
          >
            <p className="font-semibold">{t('dataProcessing.wizard.errors.summary')}</p>
            <ul className="mt-1 list-disc pl-4">
              {Object.values(errors).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {stepContent}
      </FormDialog>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title={t('dataProcessing.wizard.discard.title')}
        description={t('dataProcessing.wizard.discard.description')}
        confirmLabel={t('dataProcessing.wizard.discard.confirm')}
        cancelLabel={t('dataProcessing.wizard.discard.cancel')}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
