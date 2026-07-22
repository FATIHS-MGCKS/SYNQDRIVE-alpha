import { describe, expect, it } from 'vitest';
import type { LegalDocumentDto } from '../../lib/api';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import { buildLegalDocumentsReadinessSummary } from './legal-documents-overview';
import { LEGAL_DOCUMENT_TYPE } from './legal-document-types';

function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text = en[key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
}

function doc(partial: Partial<LegalDocumentDto> & Pick<LegalDocumentDto, 'documentType' | 'status'>): LegalDocumentDto {
  return {
    id: partial.id ?? `id-${partial.documentType}-${partial.status}`,
    documentType: partial.documentType,
    title: partial.title ?? 'Test',
    versionLabel: partial.versionLabel ?? '1.0',
    language: partial.language ?? 'de',
    jurisdiction: partial.jurisdiction ?? 'DE',
    status: partial.status,
    fileName: partial.fileName ?? 'test.pdf',
    sizeBytes: partial.sizeBytes ?? 1024,
    activeFrom: partial.activeFrom ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildLegalDocumentsReadinessSummary', () => {
  it('marks overall as critical when a mandatory category has no active version', () => {
    const summary = buildLegalDocumentsReadinessSummary(
      [
        doc({ documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: 'ACTIVE' }),
        doc({ documentType: LEGAL_DOCUMENT_TYPE.PRIVACY_POLICY, status: 'DRAFT' }),
      ],
      t,
    );

    expect(summary.overallTone).toBe('critical');
    expect(summary.blockedCount + summary.emptyCount).toBeGreaterThan(0);
    expect(summary.configAlerts.some((a) => a.severity === 'critical')).toBe(true);
  });

  it('does not show full success when one category has scan failure on active doc', () => {
    const summary = buildLegalDocumentsReadinessSummary(
      [
        doc({ documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: 'ACTIVE' }),
        doc({
          documentType: LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION,
          status: 'ACTIVE',
          scanStatus: 'FAILED',
        }),
        doc({ documentType: LEGAL_DOCUMENT_TYPE.PRIVACY_POLICY, status: 'ACTIVE' }),
      ],
      t,
    );

    expect(summary.overallTone).not.toBe('success');
    expect(summary.categories.find((c) => c.config.key === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION)?.readiness).toBe(
      'blocked',
    );
  });

  it('reports ready when all three categories are active without blocking issues', () => {
    const summary = buildLegalDocumentsReadinessSummary(
      [
        doc({ documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: 'ACTIVE', integrityStatus: 'VERIFIED' }),
        doc({ documentType: LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION, status: 'ACTIVE', integrityStatus: 'VERIFIED' }),
        doc({ documentType: LEGAL_DOCUMENT_TYPE.PRIVACY_POLICY, status: 'ACTIVE', integrityStatus: 'VERIFIED' }),
      ],
      t,
    );

    expect(summary.overallTone).toBe('success');
    expect(summary.readyCount).toBe(3);
  });
});
