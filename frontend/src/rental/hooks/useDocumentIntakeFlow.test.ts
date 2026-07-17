import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDocumentActionPreview } from '../lib/document-extraction-action-preview';
import { mapServerToFlowStatus, isBusyFlow } from '../lib/document-extraction-lifecycle';
import { createExtractionPoller } from '../lib/document-extraction-polling';

describe('useDocumentIntakeFlow shared contract', () => {
  it('maps canonical server lifecycle states', () => {
    expect(mapServerToFlowStatus('QUEUED')).toBe('queued');
    expect(mapServerToFlowStatus('PROCESSING', 'OCR')).toBe('ocr');
    expect(mapServerToFlowStatus('AWAITING_DOCUMENT_TYPE')).toBe('awaiting_type');
    expect(mapServerToFlowStatus('CONFIRMED')).toBe('applying');
    expect(mapServerToFlowStatus('APPLIED')).toBe('done');
  });

  it('treats processing substates as busy', () => {
    expect(isBusyFlow('ocr')).toBe(true);
    expect(isBusyFlow('ready')).toBe(false);
    expect(isBusyFlow('duplicate_blocked')).toBe(false);
  });

  it('builds read-only action preview per document type', () => {
    const preview = buildDocumentActionPreview({
      effectiveDocumentType: 'FINE',
      documentType: 'FINE',
      documentSubtype: 'FINE_NOTICE',
      status: 'READY_FOR_REVIEW',
    });
    expect(preview.some((row) => row.semanticAction === 'CREATE_FINE_DRAFT')).toBe(true);
  });

  it('uses single-flight poller contract', async () => {
    let calls = 0;
    const fetchRecord = async () => {
      calls += 1;
      return { status: 'QUEUED' } as never;
    };
    const poller = createExtractionPoller({ fetchRecord, onRecord: () => undefined });
    await new Promise((r) => setTimeout(r, 2500));
    poller.stop();
    expect(calls).toBeGreaterThanOrEqual(1);
  });
});

describe('canonical intake wiring', () => {
  it('drawer delegates to useDocumentExtractionFlow and shared review panel', () => {
    const src = readFileSync(resolve(__dirname, '../components/documents/VehicleDocumentUploadDrawer.tsx'), 'utf8');
    expect(src).toContain('useDocumentExtractionFlow');
    expect(src).toContain('DocumentExtractionReviewPanel');
    expect(src).toContain('DocumentExtractionFlowStatus');
  });

  it('page delegates to useDocumentUploadPage and shared review panel', () => {
    const src = readFileSync(resolve(__dirname, '../components/DocumentUploadView.tsx'), 'utf8');
    expect(src).toContain('useDocumentUploadPage');
    expect(src).toContain('DocumentExtractionReviewPanel');
  });

  it('operator review delegates to shared review panel', () => {
    const src = readFileSync(resolve(__dirname, '../../operator/ai-upload/OperatorAiUploadReview.tsx'), 'utf8');
    expect(src).toContain('DocumentExtractionReviewPanel');
  });

  it('embedded flow wraps canonical intake hook', () => {
    const src = readFileSync(resolve(__dirname, './useDocumentExtractionFlow.ts'), 'utf8');
    expect(src).toContain('useDocumentIntakeFlow');
  });

  it('upload page wraps canonical intake hook', () => {
    const src = readFileSync(resolve(__dirname, './useDocumentUploadPage.ts'), 'utf8');
    expect(src).toContain('useDocumentIntakeFlow');
  });
});
