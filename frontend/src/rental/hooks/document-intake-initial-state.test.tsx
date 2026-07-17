import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildOriginContextHint } from '../../lib/document-upload-context';
import { validateUploadFile } from '../lib/document-extraction-validation';

const idlePageMock = {
  metadata: { extensions: ['.pdf'], mimeTypes: ['application/pdf'], maxUploadBytes: 10 * 1024 * 1024, maxUploadMb: 10 },
  metadataLoading: false,
  vehicles: [],
  selectedVehicleId: '',
  setSelectedVehicleId: vi.fn(),
  documentType: 'AUTO',
  setDocumentType: vi.fn(),
  pendingTypeSelection: 'SERVICE',
  setPendingTypeSelection: vi.fn(),
  flow: 'idle' as const,
  record: null,
  uploadedFileName: '',
  errorMessage: null,
  validationError: null,
  editingFields: false,
  setEditingFields: vi.fn(),
  editedFields: [],
  setEditedFields: vi.fn(),
  plausibility: null,
  extractionId: null,
  history: [],
  historyLoading: false,
  reloadHistory: vi.fn(),
  pollNetworkWarning: false,
  showLongRunningHint: false,
  previewUrl: null,
  typeCorrectionPending: false,
  setTypeCorrectionPending: vi.fn(),
  acceptAttr: '.pdf',
  supportedFormatsLabel: 'PDF · max 10 MB',
  docTypeOptions: [],
  isBusy: false,
  blockerPresent: false,
  stepperIndex: 0,
  confirmedDocType: 'AUTO',
  classificationConfidence: null,
  uploadContext: null,
  duplicateBlocked: null,
  uploadDuplicateWarning: null,
    assignedVehicleId: '',
    canConfirm: false,
    processingStepLabels: {
      file_check: 'Datei wird geprüft',
      file_stored: 'Datei wurde sicher gespeichert',
      text_recognition: 'Text wird erkannt',
      classification: 'Dokument wird eingeordnet',
      data_preparation: 'Daten und Zuordnungen werden vorbereitet',
      ready_for_review: 'Bereit zur Prüfung',
    },
    processingStartedAt: null,
  typeLabel: (k: string) => k,
  flowStatusLabel: (s: string) => s,
  serverStatusLabel: (s: string) => s,
  stageLabel: (s: string) => s,
  errorPhaseLabel: () => '',
  handleFile: vi.fn(),
  handleDropFiles: vi.fn(),
  handleRetry: vi.fn(),
  handleConfirm: vi.fn(),
  handleReassignVehicle: vi.fn(),
  handleReset: vi.fn(),
  handleSetDocumentType: vi.fn(),
  handleReextract: vi.fn(),
  handleCancel: vi.fn(),
  handleDownload: vi.fn(),
  handleOpenHistoryItem: vi.fn(),
  handleAuthorizedReupload: vi.fn(),
  validateAndSetError: () => true,
};

vi.mock('../hooks/useDocumentUploadPage', () => ({
  useDocumentUploadPage: () => idlePageMock,
}));

vi.mock('../i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, locale: 'de' }),
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

describe('document intake initial UX', () => {
  it('allows page upload validation without pre-selected vehicle', () => {
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    const result = validateUploadFile(
      file,
      { extensions: ['.pdf'], mimeTypes: ['application/pdf'], maxUploadBytes: 10 * 1024 * 1024 },
      { vehicleSelected: true, requireVehicle: false },
    );
    expect(result.ok).toBe(true);
  });

  it('builds unconfirmed origin context hint for drawer surfaces', () => {
    expect(buildOriginContextHint('BMW 320d · M-SY 1', 'Fahrzeugdetail')).toContain('noch nicht bestätigt');
    expect(buildOriginContextHint('BMW 320d · M-SY 1', 'Fahrzeugdetail')).not.toContain('bestätigt zu');
  });

  it('page idle renders upload zone without vehicle or document type selectors', async () => {
    const { DocumentUploadView } = await import('../components/DocumentUploadView');
    const html = renderToStaticMarkup(createElement(DocumentUploadView, { isDarkMode: false }));
    expect(html).toContain('docUpload.dropzone');
    expect(html).toContain('docUpload.initialUploadHint');
    expect(html).toContain('PDF · max 10 MB');
    expect(html).not.toContain('docUpload.selectVehicleFirst');
    expect(html).not.toContain('docUpload.documentType');
    expect(html).not.toContain('Geplante Aktionen');
    expect(html).not.toContain('docUpload.detectedFields');
    expect(html).not.toContain('docUpload.aiPowered');
  });

  it('drawer idle source hides document type selector before OCR', () => {
    const src = readFileSync(
      resolve(__dirname, '../components/documents/VehicleDocumentUploadDrawer.tsx'),
      'utf8',
    );
    expect(src).toContain('DocumentIntakeUploadZone');
    expect(src).toContain('initialDocType: \'AUTO\'');
    expect(src).toContain('buildOriginContextHint');
    expect(src).not.toContain('EXTRACTION_TEMPLATES');
    expect(src).not.toContain('Dokumenttyp</label>');
  });

  it('intake hook defaults to AUTO and supports org upload path', () => {
    const src = readFileSync(resolve(__dirname, './useDocumentIntakeFlow.ts'), 'utf8');
    expect(src).toContain("initialDocType = 'AUTO'");
    expect(src).toContain('api.documentExtraction.upload');
    expect(src).toContain('requireVehicle: mode === \'embedded\'');
  });

  it('upload page hook does not require vehicle before upload', () => {
    const src = readFileSync(resolve(__dirname, './useDocumentUploadPage.ts'), 'utf8');
    expect(src).toContain('requireVehicle: false');
    expect(src).not.toMatch(/if \(!selectedVehicleId\) return;\s+const result = validateUploadFile/);
  });
});
