import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../hooks/useDocumentUploadPage', () => ({
  useDocumentUploadPage: () => ({
    metadata: null,
    metadataLoading: false,
    vehicles: [{ id: 'v1', name: 'Demo Car', licensePlate: 'M-SY 1' }],
    selectedVehicleId: 'v1',
    setSelectedVehicleId: vi.fn(),
    documentType: 'AUTO',
    setDocumentType: vi.fn(),
    pendingTypeSelection: 'SERVICE',
    setPendingTypeSelection: vi.fn(),
    flow: 'ready',
    record: {
      allowedActions: ['confirm', 'reextract', 'download'],
      hasStoredFile: true,
      classificationMode: 'AUTO',
      uploadContext: null,
      vehicleCandidates: [],
    },
    uploadedFileName: 'invoice.pdf',
    errorMessage: null,
    validationError: null,
    editingFields: false,
    setEditingFields: vi.fn(),
    editedFields: [{ key: 'invoiceNumber', label: 'Rechnungsnr.', value: 'INV-1' }],
    setEditedFields: vi.fn(),
    plausibility: { overallStatus: 'OK', checks: [] },
    extractionId: 'ext-1',
    history: [],
    historyLoading: false,
    reloadHistory: vi.fn(),
    pollNetworkWarning: false,
    showLongRunningHint: false,
    previewUrl: null,
    typeCorrectionPending: false,
    setTypeCorrectionPending: vi.fn(),
    acceptAttr: '.pdf',
    supportedFormatsLabel: 'PDF',
    docTypeOptions: [{ value: 'AUTO', labelKey: 'documentExtraction.classification.AUTO' }],
    isBusy: false,
    blockerPresent: false,
    stepperIndex: 2,
    confirmedDocType: 'INVOICE',
    classificationConfidence: '92%',
    uploadContext: null,
    duplicateBlocked: null,
    uploadDuplicateWarning: null,
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
    assignedVehicleId: 'v1',
    canConfirm: true,
    processingStepLabels: {
      file_check: 'docUpload.processingStep.fileCheck',
      file_stored: 'docUpload.processingStep.fileStored',
      text_recognition: 'docUpload.processingStep.textRecognition',
      classification: 'docUpload.processingStep.classification',
      data_preparation: 'docUpload.processingStep.dataPreparation',
      ready_for_review: 'docUpload.processingStep.readyForReview',
    },
    processingStartedAt: null,
  }),
}));

vi.mock('../i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, locale: 'de' }),
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

describe('DocumentUploadView', () => {
  it('renders shared review and action preview on ready state', async () => {
    const { DocumentUploadView } = await import('./DocumentUploadView');
    const html = renderToStaticMarkup(<DocumentUploadView isDarkMode={false} />);
    expect(html).toContain('docUpload.analysisComplete');
    expect(html).toContain('Geplante Aktionen');
    expect(html).toContain('invoice.pdf');
  });
});
