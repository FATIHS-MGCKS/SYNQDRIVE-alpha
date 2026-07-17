import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentIntakeProcessingSteps } from '../components/documents/DocumentIntakeProcessingSteps';
import { buildIntakeProcessingSteps } from './document-intake-processing-steps';

const LABELS = {
  file_check: 'Datei wird geprüft',
  file_stored: 'Datei wurde sicher gespeichert',
  text_recognition: 'Text wird erkannt',
  classification: 'Dokument wird eingeordnet',
  data_preparation: 'Daten und Zuordnungen werden vorbereitet',
  ready_for_review: 'Bereit zur Prüfung',
} as const;

describe('DocumentIntakeProcessingSteps UI', () => {
  it('renders failed step without marking later steps complete', () => {
    const steps = buildIntakeProcessingSteps({
      flow: 'failed',
      status: 'FAILED',
      errorPhase: 'OCR',
      labels: LABELS,
      retryDetail: 'OCR fehlgeschlagen.',
    });
    const html = renderToStaticMarkup(
      createElement(DocumentIntakeProcessingSteps, {
        steps,
        uploadedFileName: 'scan.pdf',
        isDarkMode: false,
      }),
    );
    expect(html).toContain('Text wird erkannt');
    expect(html).toContain('OCR fehlgeschlagen');
    expect(html).toContain('aria-label="Verarbeitungsfortschritt"');
  });
});
