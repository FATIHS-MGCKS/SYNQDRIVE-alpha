import { describe, expect, it } from 'vitest';
import type { LegalDocumentDto } from '../../lib/api';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import {
  buildVersionHistoryQueryParams,
  formatIntegrityStatusLabel,
  formatScanStatusLabel,
  mapDtoToVersionHistoryItem,
  shortenChecksum,
  VERSION_HISTORY_PAGE_SIZE,
} from './legal-document-version-history.utils';
import { EMPTY_VERSION_HISTORY_FILTERS } from './legal-document-version-history.types';

function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text = en[key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
}

const sampleDoc: LegalDocumentDto = {
  id: 'doc-abc-123',
  documentType: 'TERMS_AND_CONDITIONS',
  title: 'AGB',
  versionLabel: '2026-07',
  language: 'de',
  jurisdiction: 'DE',
  status: 'ACTIVE',
  fileName: 'agb.pdf',
  sizeBytes: 2048,
  checksum: 'abcdef1234567890abcdef1234567890',
  scanStatus: 'SCAN_PASSED',
  integrityStatus: 'VERIFIED',
  snapshotCount: 12,
  activeFrom: '2026-07-01T00:00:00.000Z',
  activatedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-06-15T00:00:00.000Z',
};

describe('legal-document-version-history.utils', () => {
  it('shortens checksum without dominating display', () => {
    expect(shortenChecksum(sampleDoc.checksum)).toBe('abcdef…7890');
    expect(shortenChecksum('short')).toBe('short');
    expect(shortenChecksum(null)).toBeNull();
  });

  it('maps DTO to history item without exposing raw IDs as primary labels', () => {
    const item = mapDtoToVersionHistoryItem(sampleDoc, t);
    expect(item.categoryTitle).toContain('Terms');
    expect(item.versionLabel).toBe('2026-07');
    expect(item.checksumShort).toBe('abcdef…7890');
    expect(item.snapshotCount).toBe(12);
    expect(item.id).toBe('doc-abc-123');
  });

  it('builds paginated query params with filters and sort', () => {
    const params = buildVersionHistoryQueryParams({
      documentType: 'PRIVACY_POLICY',
      page: 2,
      filters: {
        ...EMPTY_VERSION_HISTORY_FILTERS,
        language: 'de',
        status: 'ACTIVE',
        jurisdiction: 'DE',
        from: '2026-01-01',
        to: '2026-12-31',
      },
      sort: 'activatedAt',
      order: 'desc',
    });

    expect(params.documentType).toBe('PRIVACY_POLICY');
    expect(params.page).toBe(2);
    expect(params.limit).toBe(VERSION_HISTORY_PAGE_SIZE);
    expect(params.language).toBe('de');
    expect(params.status).toBe('ACTIVE');
    expect(params.jurisdiction).toBe('DE');
    expect(params.sort).toBe('activatedAt');
    expect(params.order).toBe('desc');
    expect(params.from).toMatch(/2026-01-01/);
    expect(params.to).toMatch(/2026-12-31/);
  });

  it('formats scan and integrity labels via i18n', () => {
    expect(formatScanStatusLabel('SCAN_PASSED', t)).toBe('OK');
    expect(formatIntegrityStatusLabel('VERIFIED', t)).toBe('Verified');
    expect(formatScanStatusLabel(null, t)).toBe('—');
  });
});
