import { describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_TYPE } from './legal-document-types';
import { EMPTY_LEGAL_UPLOAD_WIZARD_FORM } from './legal-document-upload-wizard.types';
import {
  buildLegalUploadParams,
  isScanStatusBlocking,
  scanStatusErrorMessage,
  toIsoDateTime,
} from './legal-document-upload-wizard.utils';

describe('legal-document-upload-wizard.utils', () => {
  it('builds upload params with scope and validity dates', () => {
    const file = new File(['x'], 'agb.pdf', { type: 'application/pdf' });
    const params = buildLegalUploadParams(
      {
        ...EMPTY_LEGAL_UPLOAD_WIZARD_FORM,
        documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: ' 2026-07 ',
        validFrom: '2026-07-01T08:00',
        stationScopeMode: 'STATION_SPECIFIC',
        stationIds: ['st-1'],
      },
      file,
    );
    expect(params.versionLabel).toBe('2026-07');
    expect(params.stationIds).toEqual(['st-1']);
    expect(params.validFrom).toBe(toIsoDateTime('2026-07-01T08:00'));
    expect(params.file).toBe(file);
  });

  it('omits legalVariant for non-consumer types', () => {
    const file = new File(['x'], 'agb.pdf', { type: 'application/pdf' });
    const params = buildLegalUploadParams(
      {
        ...EMPTY_LEGAL_UPLOAD_WIZARD_FORM,
        documentType: LEGAL_DOCUMENT_TYPE.PRIVACY_POLICY,
        versionLabel: 'v1',
        legalVariant: 'SHOULD_NOT_SEND',
      },
      file,
    );
    expect(params.legalVariant).toBeUndefined();
  });

  it('detects blocking scan statuses for review gating', () => {
    expect(isScanStatusBlocking('SCAN_PASSED')).toBe(false);
    expect(isScanStatusBlocking('SCAN_FAILED')).toBe(true);
    expect(scanStatusErrorMessage('SCAN_FAILED')).toContain('Malware-Scan');
  });
});
