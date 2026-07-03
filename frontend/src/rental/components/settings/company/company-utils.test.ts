import { describe, expect, it } from 'vitest';
import type { LegalDocumentDto, TenantOrganizationProfileDto } from '../../../../lib/api';
import {
  buildDocumentStatusGroups,
  draftFromProfile,
  draftToUpdatePayload,
  isLegalTextsComplete,
} from './company-utils';

function legalDoc(
  documentType: string,
  status: LegalDocumentDto['status'] = 'ACTIVE',
): LegalDocumentDto {
  return {
    id: `${documentType}-1`,
    organizationId: 'org-1',
    documentType,
    language: 'de',
    status,
    versionLabel: 'v1',
    title: documentType,
    fileName: 'doc.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 1024,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('draftToUpdatePayload', () => {
  const profile: TenantOrganizationProfileDto = {
    id: 'org-1',
    companyName: 'Synq GmbH',
    legalCompanyName: 'Synq GmbH',
    legalForm: 'GMBH',
    address: 'Straße 1',
    city: 'Berlin',
    state: null,
    zip: '10115',
    country: 'DE',
    taxId: 'LEGACY',
    taxNumber: 'TN-1',
    vatId: 'DE123',
    isSmallBusiness: false,
    defaultVatRate: 19,
    invoicePrefix: 'RE-',
    nextInvoiceNumber: 10,
    paymentTermsDays: 14,
    invoiceEmail: null,
    bankName: 'Bank',
    iban: 'DE00',
    bic: 'BIC',
    pdfFooterText: null,
    emailSignature: null,
    phone: '+49',
    email: 'info@synq.test',
    website: 'https://synq.test',
    timezone: 'Europe/Berlin',
    language: 'de-DE',
    managerName: 'Max',
    managerEmail: 'max@synq.test',
    logoUrl: null,
    logoDarkUrl: null,
    pdfLogoUrl: null,
    accentColor: null,
    businessType: 'RENTAL',
  };

  it('maps all company form fields and excludes legacy taxId', () => {
    const payload = draftToUpdatePayload(draftFromProfile(profile));
    expect(payload).toMatchObject({
      companyName: 'Synq GmbH',
      legalCompanyName: 'Synq GmbH',
      legalForm: 'GMBH',
      managerName: 'Max',
      managerEmail: 'max@synq.test',
      language: 'de-DE',
      timezone: 'Europe/Berlin',
      address: 'Straße 1',
      zip: '10115',
      city: 'Berlin',
      country: 'DE',
      phone: '+49',
      email: 'info@synq.test',
      website: 'https://synq.test',
      taxNumber: 'TN-1',
      vatId: 'DE123',
      isSmallBusiness: false,
      defaultVatRate: 19,
      paymentTermsDays: 14,
      invoicePrefix: 'RE-',
      nextInvoiceNumber: 10,
      bankName: 'Bank',
      iban: 'DE00',
      bic: 'BIC',
    });
    expect(payload).not.toHaveProperty('taxId');
    expect(payload).not.toHaveProperty('logoUrl');
  });
});

describe('buildDocumentStatusGroups', () => {
  it('groups manageable, system, and unconnected documents', () => {
    const groups = buildDocumentStatusGroups([]);
    expect(groups.map((g) => g.id)).toEqual(['manageable', 'system', 'unconnected']);
    expect(groups[0].rows.map((r) => r.label)).toEqual(['AGB', 'Widerrufsbelehrung']);
    expect(groups[1].rows.every((r) => r.status === 'generated')).toBe(true);
    expect(groups[2].rows.every((r) => r.status === 'unconnected')).toBe(true);
  });

  it('marks active AGB and Widerruf as Hinterlegt', () => {
    const groups = buildDocumentStatusGroups([
      legalDoc('TERMS_AND_CONDITIONS'),
      legalDoc('WITHDRAWAL_INFORMATION'),
    ]);
    const manageable = groups[0].rows;
    expect(manageable[0].status).toBe('active');
    expect(manageable[1].status).toBe('active');
  });

  it('shows system templates without manageable affordance', () => {
    const groups = buildDocumentStatusGroups([]);
    const system = groups.find((g) => g.id === 'system')!;
    expect(system.rows[0]).toMatchObject({
      label: 'Mietvertragsvorlage',
      status: 'generated',
      detail: expect.stringContaining('automatisch'),
    });
    expect(system.rows[1]).toMatchObject({
      label: 'Übergabeprotokollvorlage',
      status: 'generated',
    });
  });

  it('shows privacy and telematics as not yet connected', () => {
    const groups = buildDocumentStatusGroups([]);
    const unconnected = groups.find((g) => g.id === 'unconnected')!;
    expect(unconnected.rows[0].detail).toContain('Data Authorization');
    expect(unconnected.rows[1].label).toContain('Telematik');
  });
});

describe('isLegalTextsComplete', () => {
  it('is true only when AGB and Widerruf are active', () => {
    expect(isLegalTextsComplete([])).toBe(false);
    expect(isLegalTextsComplete([legalDoc('TERMS_AND_CONDITIONS')])).toBe(false);
    expect(
      isLegalTextsComplete([
        legalDoc('TERMS_AND_CONDITIONS'),
        legalDoc('WITHDRAWAL_INFORMATION'),
      ]),
    ).toBe(true);
  });

  it('ignores drafts and non-legal document types', () => {
    expect(
      isLegalTextsComplete([
        legalDoc('TERMS_AND_CONDITIONS', 'DRAFT'),
        legalDoc('WITHDRAWAL_INFORMATION', 'DRAFT'),
      ]),
    ).toBe(false);
  });
});
