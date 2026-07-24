import { describe, expect, it } from 'vitest';
import {
  buildLegacyAuthorizationPayload,
  buildRegisterCreatePayload,
} from './data-processing-wizard.utils';
import { EMPTY_DATA_PROCESSING_WIZARD_FORM } from './data-processing-wizard.types';

describe('data-processing wizard utils', () => {
  it('does not derive requestingEntity from title', () => {
    const payload = buildLegacyAuthorizationPayload({
      ...EMPTY_DATA_PROCESSING_WIZARD_FORM,
      procedureType: 'PARTNER_SHARING',
      title: 'Partner export',
      requestingEntity: 'ACME GmbH',
      destination: 'ACME EU Data Hub',
      purposes: ['PARTNER_SERVICE'],
      dataCategories: ['CUSTOMER_DATA'],
      scopeKey: 'ORGANIZATION',
    });
    expect(payload?.requestingEntity).toBe('ACME GmbH');
    expect(payload?.requestingEntity).not.toBe('Partner export');
  });

  it('does not set SynqDrive platform as default destination', () => {
    const payload = buildLegacyAuthorizationPayload({
      ...EMPTY_DATA_PROCESSING_WIZARD_FORM,
      procedureType: 'CONSENT',
      title: 'Marketing consent',
      requestingEntity: 'Marketing Dept',
      destination: 'Internal CRM',
      purposes: ['CUSTOMER_CONSENT'],
      dataCategories: ['CUSTOMER_DATA'],
      scopeKey: 'CUSTOMER',
      customerIds: ['cust-1'],
    });
    expect(payload?.destination).toBe('Internal CRM');
    expect(payload?.destination).not.toContain('SynqDrive');
  });

  it('maps register payload with activity code uppercase', () => {
    const payload = buildRegisterCreatePayload({
      ...EMPTY_DATA_PROCESSING_WIZARD_FORM,
      activityCode: 'pa-fleet',
      title: 'Fleet',
      purposeSummary: 'Ops',
      dataCategories: ['TELEMETRY_DATA'],
      purposes: ['FLEET_ANALYTICS'],
      dataSubjectTypes: ['CUSTOMER'],
    });
    expect(payload.activityCode).toBe('PA-FLEET');
  });
});
