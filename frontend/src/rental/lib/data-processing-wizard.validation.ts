import type {
  DataProcessingProcedureType,
  DataProcessingWizardErrors,
  DataProcessingWizardForm,
  DataProcessingWizardStepId,
} from './data-processing-wizard.types';

function trim(value: string): string {
  return value.trim();
}

function hasActivityCode(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9._-]{2,48}$/i.test(trim(value));
}

function requiresRecipientStep(type: DataProcessingProcedureType | ''): boolean {
  return (
    type === 'PROVIDER_ACCESS' ||
    type === 'PARTNER_SHARING' ||
    type === 'CONSENT' ||
    type === 'PROCESSOR_AGREEMENT'
  );
}

export function validateDataProcessingWizardStep(
  step: DataProcessingWizardStepId,
  form: DataProcessingWizardForm,
  mode: 'draft' | 'review',
): DataProcessingWizardErrors {
  const errors: DataProcessingWizardErrors = {};

  if (step === 1) {
    if (!form.procedureType) errors.procedureType = 'dataProcessing.wizard.errors.procedureType';
    return errors;
  }

  if (step === 2) {
    if (!trim(form.title)) errors.title = 'dataProcessing.wizard.errors.title';
    if (!hasActivityCode(form.activityCode)) errors.activityCode = 'dataProcessing.wizard.errors.activityCode';
    if (!trim(form.purposeSummary)) errors.purposeSummary = 'dataProcessing.wizard.errors.purposeSummary';
    if (!form.legalBasisType) errors.legalBasisType = 'dataProcessing.wizard.errors.legalBasisType';
    if (mode === 'review' && !trim(form.necessityAssessment)) {
      errors.necessityAssessment = 'dataProcessing.wizard.errors.necessityAssessment';
    }
    if (mode === 'review' && form.legalBasisType === 'CONSENT' && !trim(form.privacyNoticeVersion)) {
      errors.privacyNoticeVersion = 'dataProcessing.wizard.errors.privacyNoticeVersion';
    }
    return errors;
  }

  if (step === 3) {
    if (form.purposes.length === 0) errors.purposes = 'dataProcessing.wizard.errors.purposes';
    if (form.dataCategories.length === 0) errors.dataCategories = 'dataProcessing.wizard.errors.dataCategories';
    if (form.dataSubjectTypes.length === 0) errors.dataSubjectTypes = 'dataProcessing.wizard.errors.dataSubjectTypes';
    if (!form.scopeKey) errors.scopeKey = 'dataProcessing.wizard.errors.scopeKey';
    if (mode === 'review' && !form.dataFrequency) errors.dataFrequency = 'dataProcessing.wizard.errors.dataFrequency';
    return errors;
  }

  if (step === 4) {
    if (form.scopeKey === 'VEHICLE' && form.vehicleIds.length === 0) {
      errors.vehicleIds = 'dataProcessing.wizard.errors.vehicleIds';
    }
    if (form.scopeKey === 'CUSTOMER' && form.customerIds.length === 0) {
      errors.customerIds = 'dataProcessing.wizard.errors.customerIds';
    }
    if (form.scopeKey === 'BOOKING' && form.bookingIds.length === 0) {
      errors.bookingIds = 'dataProcessing.wizard.errors.bookingIds';
    }
    if (form.scopeKey === 'CONNECTED_VEHICLES' && form.vehicleIds.length === 0) {
      errors.vehicleIds = 'dataProcessing.wizard.errors.connectedVehicles';
    }
    return errors;
  }

  if (step === 5 && requiresRecipientStep(form.procedureType)) {
    if (form.procedureType === 'PROVIDER_ACCESS') {
      if (!trim(form.provider)) errors.provider = 'dataProcessing.wizard.errors.provider';
      if (form.grantedScopes.length === 0) errors.grantedScopes = 'dataProcessing.wizard.errors.grantedScopes';
    }
    if (form.procedureType === 'PROCESSOR_AGREEMENT' && !trim(form.processorName)) {
      errors.processorName = 'dataProcessing.wizard.errors.processorName';
    }
    if (
      (form.procedureType === 'PARTNER_SHARING' || form.procedureType === 'CONSENT') &&
      !trim(form.requestingEntity)
    ) {
      errors.requestingEntity = 'dataProcessing.wizard.errors.requestingEntity';
    }
    if (
      (form.procedureType === 'PARTNER_SHARING' || form.procedureType === 'CONSENT') &&
      !trim(form.destination)
    ) {
      errors.destination = 'dataProcessing.wizard.errors.destination';
    }
    if (form.procedureType === 'CONSENT') {
      if (!trim(form.consentTextVersion)) errors.consentTextVersion = 'dataProcessing.wizard.errors.consentTextVersion';
      if (!trim(form.dataSubjectReference)) {
        errors.dataSubjectReference = 'dataProcessing.wizard.errors.dataSubjectReference';
      }
    }
    if (form.thirdCountryTransfer && !form.transferMechanism) {
      errors.transferMechanism = 'dataProcessing.wizard.errors.transferMechanism';
    }
    if (form.procedureType === 'PROCESSOR_AGREEMENT' && !trim(form.dpaContractReference) && mode === 'review') {
      errors.dpaContractReference = 'dataProcessing.wizard.errors.dpaContractReference';
    }
    return errors;
  }

  if (step === 6 && mode === 'review') {
    if (!form.retentionClass) errors.retentionClass = 'dataProcessing.wizard.errors.retentionClass';
    if (!form.retentionStartEvent) errors.retentionStartEvent = 'dataProcessing.wizard.errors.retentionStartEvent';
    if (!form.deletionMethod) errors.deletionMethod = 'dataProcessing.wizard.errors.deletionMethod';
    if (form.legalHold && !trim(form.legalHoldReason)) {
      errors.legalHoldReason = 'dataProcessing.wizard.errors.legalHoldReason';
    }
    return errors;
  }

  if (step === 7 && mode === 'review') {
    if (!form.dpiaStatus) errors.dpiaStatus = 'dataProcessing.wizard.errors.dpiaStatus';
    return errors;
  }

  return errors;
}

export function validateDataProcessingWizardDraft(form: DataProcessingWizardForm): DataProcessingWizardErrors {
  const errors: DataProcessingWizardErrors = {};
  Object.assign(errors, validateDataProcessingWizardStep(1, form, 'draft'));
  if (Object.keys(errors).length > 0) return errors;
  if (!trim(form.title)) errors.title = 'dataProcessing.wizard.errors.title';
  if (!hasActivityCode(form.activityCode)) errors.activityCode = 'dataProcessing.wizard.errors.activityCode';
  return errors;
}

export function validateDataProcessingWizardReview(form: DataProcessingWizardForm): DataProcessingWizardErrors {
  const errors: DataProcessingWizardErrors = {};
  for (const step of [1, 2, 3, 4, 5, 6, 7] as DataProcessingWizardStepId[]) {
    Object.assign(errors, validateDataProcessingWizardStep(step, form, 'review'));
  }
  return errors;
}

export function hasValidationErrors(errors: DataProcessingWizardErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function isWizardFormDirty(
  form: DataProcessingWizardForm,
  baseline = form,
): boolean {
  return JSON.stringify(form) !== JSON.stringify(baseline);
}
