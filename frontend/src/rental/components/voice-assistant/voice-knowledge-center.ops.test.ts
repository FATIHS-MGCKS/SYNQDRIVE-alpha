import { describe, expect, it } from 'vitest';
import {
  assembleKnowledgeCenter,
  buildApprovedDocumentsSource,
  buildOrganizationProfileSource,
  buildTermsSource,
  sanitizeKnowledgeDisplayText,
  VOICE_KNOWLEDGE_LEGAL_MAX_BYTES,
  VOICE_KNOWLEDGE_SOURCE_ORDER,
} from './voice-knowledge-center.ops';
import type { LegalDocumentDto } from '../../../lib/api';

describe('voice-knowledge-center.ops', () => {
  it('orders all thirteen knowledge sources', () => {
    expect(VOICE_KNOWLEDGE_SOURCE_ORDER).toHaveLength(13);
    expect(VOICE_KNOWLEDGE_SOURCE_ORDER[0]).toBe('organization_profile');
    expect(VOICE_KNOWLEDGE_SOURCE_ORDER.at(-1)).toBe('approved_documents');
  });

  it('marks incomplete organization profile', () => {
    const source = buildOrganizationProfileSource({
      companyName: 'SynqDrive',
      address: '',
      city: 'Berlin',
      phone: '+491234',
    } as never);
    expect(source.status).toBe('INCOMPLETE');
    expect(source.published).toBe(false);
  });

  it('strips control characters from display text', () => {
    const sanitized = sanitizeKnowledgeDisplayText('Hello\x00world\n\n  injection');
    expect(sanitized).toBe('Helloworld injection');
    expect(sanitized).not.toContain('\x00');
  });

  it('blocks oversized legal document preview', () => {
    const docs: LegalDocumentDto[] = [
      {
        id: 'doc-1',
        documentType: 'TERMS_AND_CONDITIONS',
        status: 'ACTIVE',
        title: 'AGB',
        versionLabel: 'v1',
        sizeBytes: VOICE_KNOWLEDGE_LEGAL_MAX_BYTES + 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        activeFrom: '2026-01-01T00:00:00.000Z',
      } as LegalDocumentDto,
    ];
    const source = buildTermsSource(docs);
    expect(source.status).toBe('INCOMPLETE');
    expect(source.previewAllowed).toBe(false);
  });

  it('requires org-scoped approved documents', () => {
    const source = buildApprovedDocumentsSource([]);
    expect(source.status).toBe('NOT_PUBLISHED');
    expect(source.previewDocumentId).toBeUndefined();
  });

  it('computes knowledge gaps and freshness', () => {
    const center = assembleKnowledgeCenter([
      buildOrganizationProfileSource({
        companyName: 'SynqDrive GmbH',
        address: 'Street 1',
        city: 'Berlin',
        phone: '+491234',
      } as never),
      buildOrganizationProfileSource(null),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `source_${i}`,
        status: 'CONNECTED' as const,
        origin: 'static' as const,
        labelKey: 'voice.knowledge.source.organization',
        dataSourceKey: 'voice.knowledge.dataSource.organizationProfile',
        lastUpdatedAt: null,
        published: true,
        detail: 'ok',
      })),
    ] as never);
    expect(center.connectedCount).toBe(5);
    expect(center.freshness).toBe('needs_attention');
    expect(center.gaps.length).toBeGreaterThan(0);
  });
});
