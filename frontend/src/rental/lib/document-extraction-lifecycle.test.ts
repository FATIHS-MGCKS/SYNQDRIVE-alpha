import { describe, expect, it } from 'vitest';
import {
  formatConfidencePercent,
  getStepperIndex,
  isTerminalExtractionStatus,
  mapServerToFlowStatus,
} from './document-extraction-lifecycle';
import { getPollIntervalMsForTest } from './document-extraction-polling';
import { validateUploadFile, buildAcceptAttribute } from './document-extraction-validation';
import { mapFlowStatus } from '../components/documents/document-extraction.shared';

describe('document extraction lifecycle mapping', () => {
  it('maps AWAITING_DOCUMENT_TYPE to awaiting_type', () => {
    expect(mapServerToFlowStatus('AWAITING_DOCUMENT_TYPE')).toBe('awaiting_type');
    expect(mapFlowStatus('AWAITING_DOCUMENT_TYPE')).toBe('awaiting_type');
  });

  it('maps processing stages to fine-grained flows', () => {
    expect(mapServerToFlowStatus('PROCESSING', 'OCR')).toBe('ocr');
    expect(mapServerToFlowStatus('PROCESSING', 'CLASSIFICATION')).toBe('classifying');
    expect(mapServerToFlowStatus('PROCESSING', 'EXTRACTION')).toBe('extracting');
  });

  it('treats APPLIED as terminal for polling', () => {
    expect(isTerminalExtractionStatus('APPLIED')).toBe(true);
    expect(isTerminalExtractionStatus('PROCESSING')).toBe(false);
  });

  it('keeps review step index for ready and failed', () => {
    expect(getStepperIndex('ready')).toBe(2);
    expect(getStepperIndex('failed')).toBe(2);
    expect(getStepperIndex('done')).toBe(3);
  });

  it('formats confidence as percent', () => {
    expect(formatConfidencePercent(0.87)).toBe('87%');
    expect(formatConfidencePercent(87)).toBe('87%');
  });
});

describe('document upload validation', () => {
  const metadata = {
    extensions: ['.pdf', '.txt'],
    mimeTypes: ['application/pdf', 'text/plain'],
    maxUploadBytes: 1024,
  };

  it('rejects missing vehicle', () => {
    expect(validateUploadFile(new File(['a'], 'a.pdf'), metadata, { vehicleSelected: false }).code).toBe('NO_VEHICLE');
  });

  it('rejects oversize files', () => {
    const big = new File([new Uint8Array(2048)], 'big.pdf', { type: 'application/pdf' });
    expect(validateUploadFile(big, metadata, { vehicleSelected: true }).code).toBe('FILE_TOO_LARGE');
  });

  it('accepts valid pdf', () => {
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
    expect(validateUploadFile(file, metadata, { vehicleSelected: true }).ok).toBe(true);
  });

  it('builds accept attribute from metadata extensions', () => {
    expect(buildAcceptAttribute(['.pdf', '.png'])).toBe('.pdf,.png');
  });
});

describe('polling backoff intervals', () => {
  it('uses 2s, 5s, then 10s cadence', () => {
    expect(getPollIntervalMsForTest(0)).toBe(2000);
    expect(getPollIntervalMsForTest(25_000)).toBe(5000);
    expect(getPollIntervalMsForTest(65_000)).toBe(10_000);
  });
});
