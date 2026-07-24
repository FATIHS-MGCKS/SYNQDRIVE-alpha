import { describe, expect, it } from 'vitest';
import {
  validateDataProcessingWizardDraft,
  validateDataProcessingWizardReview,
  validateDataProcessingWizardStep,
} from './data-processing-wizard.validation';
import { EMPTY_DATA_PROCESSING_WIZARD_FORM } from './data-processing-wizard.types';

const baseForm = {
  ...EMPTY_DATA_PROCESSING_WIZARD_FORM,
  procedureType: 'INTERNAL_PROCESSING' as const,
  title: 'Fleet analytics',
  activityCode: 'PA-FLEET-01',
  purposeSummary: 'Operational fleet analytics',
  legalBasisType: 'LEGITIMATE_INTERESTS',
  purposes: ['FLEET_ANALYTICS'],
  dataCategories: ['TELEMETRY_DATA'],
  dataSubjectTypes: ['CUSTOMER'],
  scopeKey: 'ORGANIZATION',
  dataFrequency: 'REGULAR',
  retentionClass: 'OPERATIONAL',
  retentionStartEvent: 'PROCESSING_START',
  deletionMethod: 'ANONYMIZE',
  dpiaStatus: 'DPIA_NOT_REQUIRED',
};

describe('validateDataProcessingWizardStep', () => {
  it('requires procedure type on step 1', () => {
    const errors = validateDataProcessingWizardStep(1, EMPTY_DATA_PROCESSING_WIZARD_FORM, 'draft');
    expect(errors.procedureType).toBeTruthy();
  });

  it('requires explicit requestingEntity for partner sharing on review', () => {
    const errors = validateDataProcessingWizardStep(
      5,
      {
        ...baseForm,
        procedureType: 'PARTNER_SHARING',
        requestingEntity: '',
        destination: '',
      },
      'review',
    );
    expect(errors.requestingEntity).toBeTruthy();
    expect(errors.destination).toBeTruthy();
  });

  it('requires vehicles when scope is VEHICLE', () => {
    const errors = validateDataProcessingWizardStep(
      4,
      { ...baseForm, scopeKey: 'VEHICLE', vehicleIds: [] },
      'review',
    );
    expect(errors.vehicleIds).toBeTruthy();
  });
});

describe('validateDataProcessingWizardDraft', () => {
  it('accepts minimal draft with title and activity code', () => {
    const errors = validateDataProcessingWizardDraft({
      ...EMPTY_DATA_PROCESSING_WIZARD_FORM,
      procedureType: 'INTERNAL_PROCESSING',
      title: 'Test',
      activityCode: 'PA-001',
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

describe('validateDataProcessingWizardReview', () => {
  it('flags incomplete review payload', () => {
    const errors = validateDataProcessingWizardReview({
      ...baseForm,
      necessityAssessment: '',
      dataFrequency: '',
      retentionClass: '',
    });
    expect(errors.necessityAssessment).toBeTruthy();
    expect(errors.dataFrequency).toBeTruthy();
    expect(errors.retentionClass).toBeTruthy();
  });

  it('passes complete internal processing review form', () => {
    const errors = validateDataProcessingWizardReview({
      ...baseForm,
      necessityAssessment: 'Required for fleet safety',
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
