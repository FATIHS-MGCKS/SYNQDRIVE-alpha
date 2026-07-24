import type { CreateDataAuthorizationPayload } from '../../lib/api';
import type { DataProcessingWizardForm } from './data-processing-wizard.types';

function stationScopeNote(form: DataProcessingWizardForm): string | undefined {
  if (form.stationIds.length === 0) return undefined;
  return `Stations: ${form.stationIds.join(', ')}`;
}

export function buildRegisterCreatePayload(form: DataProcessingWizardForm) {
  return {
    activityCode: form.activityCode.trim().toUpperCase(),
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    purposeSummary: form.purposeSummary.trim() || undefined,
    dataCategories: form.dataCategories,
    purposes: form.purposes,
    dataSubjectTypes: form.dataSubjectTypes,
    retentionDescription: form.retentionDescription.trim() || undefined,
    retentionPeriodDays: form.retentionDurationDays ? Number(form.retentionDurationDays) : undefined,
    technicalOrganizationalMeasures: form.technicalOrganizationalMeasures.trim() || undefined,
    dpiaStatus: form.dpiaStatus || undefined,
    recipientCategoriesSummary:
      form.recipientName.trim() || form.processorName.trim() || undefined,
  };
}

export function buildLegalBasisPayload(form: DataProcessingWizardForm) {
  return {
    legalBasisType: form.legalBasisType,
    legalReference: form.legalReference.trim() || undefined,
    necessityAssessment: form.necessityAssessment.trim() || undefined,
    proportionalityAssessment: form.proportionalityAssessment.trim() || undefined,
  };
}

export function buildRetentionPolicyPayload(form: DataProcessingWizardForm) {
  if (!form.retentionClass || !form.retentionStartEvent || !form.deletionMethod) return null;
  return {
    dataCategory: form.dataCategories[0],
    retentionClass: form.retentionClass,
    retentionDurationDays: form.retentionDurationDays ? Number(form.retentionDurationDays) : undefined,
    retentionStartEvent: form.retentionStartEvent,
    deletionMethod: form.deletionMethod,
    anonymizationAllowed: form.anonymizationAllowed,
    legalHold: form.legalHold,
    legalHoldReason: form.legalHold ? form.legalHoldReason.trim() || undefined : undefined,
    reviewDate: undefined,
  };
}

export function buildLegacyAuthorizationPayload(
  form: DataProcessingWizardForm,
): CreateDataAuthorizationPayload | null {
  if (form.procedureType !== 'PARTNER_SHARING' && form.procedureType !== 'CONSENT') return null;

  const notes = [form.reviewNotes.trim(), stationScopeNote(form)].filter(Boolean).join('\n');

  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    requestingEntity: form.requestingEntity.trim(),
    moduleOrigin: form.moduleOrigin.trim() || 'Data Processing Wizard',
    purposes: form.purposes,
    scope: form.scopeKey,
    dataCategories: form.dataCategories,
    destination: form.destination.trim(),
    sourceType: form.procedureType === 'CONSENT' ? 'CUSTOMER_CONSENT' : 'PARTNER_ACCESS',
    processorType: form.procedureType === 'PARTNER_SHARING' ? 'EXTERNAL_PARTNER' : undefined,
    processorName: form.recipientName.trim() || form.processorName.trim() || undefined,
    vehicleIds: form.vehicleIds.length ? form.vehicleIds : undefined,
    customerIds: form.customerIds.length ? form.customerIds : undefined,
    bookingIds: form.bookingIds.length ? form.bookingIds : undefined,
    accessPattern: 'ONGOING',
    notes: notes || undefined,
  };
}

export function buildProviderGrantPayload(form: DataProcessingWizardForm, processingActivityId: string) {
  if (form.procedureType !== 'PROVIDER_ACCESS') return null;
  return {
    provider: form.provider.trim().toUpperCase(),
    grantedScopes: form.grantedScopes,
    processingActivityId,
    vehicleId: form.vehicleIds[0] ?? undefined,
  };
}

export function buildDpaPayload(form: DataProcessingWizardForm, processingActivityId: string) {
  if (form.procedureType !== 'PROCESSOR_AGREEMENT') return null;
  return {
    processorName: form.processorName.trim(),
    processorRole: 'PROCESSOR' as const,
    contractReference: form.dpaContractReference.trim() || undefined,
    processingActivityId,
    primaryTransferMechanism: form.thirdCountryTransfer ? form.transferMechanism || undefined : 'NO_TRANSFER',
    safeguards: form.technicalOrganizationalMeasures.trim() || undefined,
    transferCountries:
      form.thirdCountryTransfer && form.recipientCountry
        ? [
            {
              countryCode: form.recipientCountry.trim().toUpperCase(),
              transferMechanism: form.transferMechanism || 'OTHER_SAFEGUARD',
            },
          ]
        : undefined,
  };
}

export function buildConsentPayload(form: DataProcessingWizardForm) {
  if (form.procedureType !== 'CONSENT') return null;
  return {
    dataSubjectReference: form.dataSubjectReference.trim(),
    subjectType: form.subjectType,
    purpose: form.purposes[0],
    consentTextVersion: form.consentTextVersion.trim(),
    privacyNoticeVersion: form.privacyNoticeVersion.trim() || form.consentTextVersion.trim(),
  };
}

export function parseDataProcessingApiError(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { message?: string | string[]; code?: string };
      if (Array.isArray(parsed.message)) return parsed.message.join(', ');
      if (parsed.message) return String(parsed.message);
      if (parsed.code) return parsed.code;
    } catch {
      // plain message
    }
    return error.message;
  }
  return 'dataProcessing.wizard.errors.unknown';
}
