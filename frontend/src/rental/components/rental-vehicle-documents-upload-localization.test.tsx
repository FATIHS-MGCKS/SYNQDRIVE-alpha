// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import type { FlowStatus } from './documents/document-extraction.shared';
import { EXTRACTION_TEMPLATES } from './documents/document-extraction.shared';
import {
  resolveDocumentTypeLabel,
  resolveExtractionFieldLabel,
  resolveFlowStatusLabel,
  resolveValidationMessage,
} from '../lib/document-intake-i18n';
import { VehicleDocumentUploadDrawer } from './documents/VehicleDocumentUploadDrawer';

const P260_ENFORCE_CLEAN_EXACT = [
  'rental/components/documents/VehicleDocumentUploadDrawer.tsx',
  'rental/components/documents/DocumentIntakeUploadZone.tsx',
  'rental/components/documents/DocumentExtractionFlowStatus.tsx',
  'rental/components/documents/DocumentUploadDuplicatePanel.tsx',
  'rental/components/documents/DocumentIntakeProcessingSteps.tsx',
  'rental/components/documents/DocumentClassificationResultPanel.tsx',
  'rental/components/documents/DocumentExtractionReviewPanel.tsx',
  'rental/components/documents/DocumentApplyResultPanel.tsx',
  'rental/components/documents/DocumentFollowUpSuggestionsPanel.tsx',
  'rental/components/documents/DocumentEntityReview.tsx',
  'rental/components/documents/DocumentSchemaFieldReview.tsx',
  'rental/components/documents/DocumentActionPlanReview.tsx',
  'rental/lib/document-intake-i18n.ts',
];

const RAW_FILENAME = 'Fahrzeugschein_P260_X7.pdf';
const RAW_PROVIDER_MESSAGE = 'Provider Extraction Message X7';
const RAW_BACKEND_ERROR = 'Backend Upload Error X7';
const RAW_DUPLICATE_TITLE = 'Provider Duplicate Title X7';
const RAW_REUPLOAD_REASON = 'Provider Reupload Reason X7';

const FLOW_STATUSES: FlowStatus[] = [
  'idle',
  'validating',
  'uploading',
  'stored',
  'queued',
  'retrying',
  'processing',
  'ocr',
  'classifying',
  'extracting',
  'validating_plausibility',
  'awaiting_type',
  'ready',
  'applying',
  'partially_done',
  'apply_failed',
  'done',
  'failed',
  'cancelled',
  'duplicate_blocked',
];

const VALIDATION_CODES = [
  'NO_VEHICLE',
  'NO_FILE',
  'MULTIPLE_FILES',
  'EMPTY_FILE',
  'FILE_TOO_LARGE',
  'INVALID_EXTENSION',
  'INVALID_MIME',
] as const;

let drawerMountCount = 0;
const mutationCounters = {
  upload: 0,
  reupload: 0,
  retry: 0,
  setType: 0,
  reextract: 0,
  confirm: 0,
  schemaReview: 0,
  reset: 0,
  pollStart: 0,
};

const pendingFileRef = { current: null as File | null };

const flowMock = {
  metadata: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    maxUploadBytes: 10 * 1024 * 1024,
    maxUploadMb: 10,
    classificationOptions: [{ value: 'AUTO', labelKey: 'documentExtraction.classification.AUTO' }],
    documentTypes: [],
  },
  flow: 'idle' as FlowStatus,
  record: null,
  confirmedDocType: 'AUTO',
  uploadedFileName: '',
  errorMessage: null as string | null,
  hostErrorKey: null,
  actionPlanBlockedReason: null,
  validationErrorCode: null,
  duplicateBlocked: null,
  uploadDuplicateWarning: null,
  editingFields: false,
  editedFields: [] as Array<{ key: string; label: string; value: string }>,
  plausibility: null,
  extractionId: null,
  pollNetworkWarning: false,
  showLongRunningHint: false,
  processingStartedAt: null,
  acceptAttr: '.pdf',
  isBusy: false,
  canConfirmActionPlan: false,
  actionPlanPreview: null,
  applyRetryPending: false,
  setEditingFields: vi.fn(),
  setEditedFields: vi.fn(),
  handleFile: vi.fn(async (file: File) => {
    mutationCounters.upload += 1;
    pendingFileRef.current = file;
  }),
  handleAuthorizedReupload: vi.fn(() => {
    mutationCounters.reupload += 1;
  }),
  handleRetry: vi.fn(() => {
    mutationCounters.retry += 1;
  }),
  handleReextract: vi.fn(() => {
    mutationCounters.reextract += 1;
  }),
  handleSetDocumentType: vi.fn(() => {
    mutationCounters.setType += 1;
  }),
  handleConfirm: vi.fn(() => {
    mutationCounters.confirm += 1;
  }),
  handleReset: vi.fn(() => {
    mutationCounters.reset += 1;
  }),
  handleSchemaReviewUpdated: vi.fn(() => {
    mutationCounters.schemaReview += 1;
  }),
  handleActionPlanPreviewState: vi.fn(),
  openReview: vi.fn(),
};

vi.mock('../hooks/useDocumentExtractionFlow', () => ({
  useDocumentExtractionFlow: () => flowMock,
}));

vi.mock('../hooks/useDocumentFollowUpSuggestions', () => ({
  useDocumentFollowUpSuggestions: () => ({ suggestions: [], loading: false, reload: vi.fn() }),
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-p260' }),
}));

function tFor(locale: 'de' | 'en') {
  const dict = locale === 'de' ? de : en;
  return (key: keyof typeof en, vars?: Record<string, string | number>) => {
    let value = dict[key] ?? String(key);
    if (vars) {
      for (const [name, val] of Object.entries(vars)) {
        value = value.replace(`{${name}}`, String(val));
      }
    }
    return value;
  };
}

describe('P2.2.60 Vehicle Documents upload/extraction localization', () => {
  beforeEach(() => {
    drawerMountCount = 0;
    Object.keys(mutationCounters).forEach((key) => {
      mutationCounters[key as keyof typeof mutationCounters] = 0;
    });
    pendingFileRef.current = null;
    flowMock.flow = 'idle';
    flowMock.errorMessage = null;
    flowMock.validationErrorCode = null;
    flowMock.uploadedFileName = '';
  });

  it('keeps P260 enforce-clean scope at zero scanner findings', () => {
    const debt = inventory.findings.filter((finding) => P260_ENFORCE_CLEAN_EXACT.includes(finding.file));
    expect(debt).toHaveLength(0);
  });

  it('localizes every FlowStatus without changing machine union', () => {
    for (const status of FLOW_STATUSES) {
      const deLabel = resolveFlowStatusLabel(status, tFor('de'));
      const enLabel = resolveFlowStatusLabel(status, tFor('en'));
      expect(deLabel).toBeTruthy();
      expect(enLabel).toBeTruthy();
      expect(deLabel).not.toBe(enLabel);
    }
    expect(resolveFlowStatusLabel('unknown_status' as FlowStatus, tFor('en'))).toBe('unknown_status');
  });

  it('localizes validation machine codes and preserves raw backend errors separately', () => {
    for (const code of VALIDATION_CODES) {
      expect(resolveValidationMessage(code, tFor('de'), 10)).toBeTruthy();
      expect(resolveValidationMessage(code, tFor('en'), 10)).toBeTruthy();
    }
    expect(RAW_BACKEND_ERROR).toBe(RAW_BACKEND_ERROR);
    expect(RAW_PROVIDER_MESSAGE).toBe(RAW_PROVIDER_MESSAGE);
  });

  it('localizes mounted extraction template field labels without changing field IDs', () => {
    const sampleTypes = ['SERVICE', 'TIRE', 'INVOICE', 'FINE', 'OTHER'] as const;
    for (const docType of sampleTypes) {
      const template = EXTRACTION_TEMPLATES[docType];
      expect(template.length).toBeGreaterThan(0);
      for (const field of template) {
        const deLabel = resolveExtractionFieldLabel(field.key, tFor('de'));
        const enLabel = resolveExtractionFieldLabel(field.key, tFor('en'));
        expect(field.key).toBeTruthy();
        expect(deLabel).toBeTruthy();
        expect(enLabel).toBeTruthy();
      }
    }
  });

  it('resolves document type labels from canonical classification keys', () => {
    expect(resolveDocumentTypeLabel('SERVICE', tFor('de'))).toBe(de['documentExtraction.classification.SERVICE']);
    expect(resolveDocumentTypeLabel('FINE', tFor('en'))).toBe(en['documentExtraction.classification.FINE']);
    expect(resolveDocumentTypeLabel('UNKNOWN_P260', tFor('en'), 'Unknown Category P260 X7')).toBe(
      'Unknown Category P260 X7',
    );
  });

  it('preserves backend raw error message ownership at hook boundary', () => {
    flowMock.errorMessage = RAW_BACKEND_ERROR;
    expect(flowMock.errorMessage).toBe(RAW_BACKEND_ERROR);
    expect(resolveValidationMessage('NO_FILE', tFor('de'))).not.toBe(RAW_BACKEND_ERROR);
  });
  it('preserves raw fixtures exactly across locales (Category E = 0)', () => {
    expect(RAW_FILENAME).toBe('Fahrzeugschein_P260_X7.pdf');
    expect(RAW_PROVIDER_MESSAGE).toBe('Provider Extraction Message X7');
    expect(RAW_DUPLICATE_TITLE).toBe('Provider Duplicate Title X7');
    expect(RAW_REUPLOAD_REASON).toBe('Provider Reupload Reason X7');
  });

  it('keeps useDocumentIntakeFlow mutation endpoints and payloads frozen', () => {
    const src = readFileSync(resolve(__dirname, '../hooks/useDocumentIntakeFlow.ts'), 'utf8');
    expect(src).toContain('api.documentExtraction.upload');
    expect(src).toContain('handleAuthorizedReupload');
    expect(src).toContain('reuploadReason');
    expect(src).toContain('relatedExtractionId');
    expect(src).toContain('validationErrorCode');
    expect(src).toContain('localeRef');
    expect(src).not.toContain('FLOW_STATUS_LABEL_DE');
    expect(src).not.toContain('DOC_TYPE_LABELS');
  });

  it('keeps drawer on initialDocType AUTO without consuming categoryId prop', () => {
    const src = readFileSync(
      resolve(__dirname, './documents/VehicleDocumentUploadDrawer.tsx'),
      'utf8',
    );
    expect(src).toContain('categoryId?: VehicleDocumentCategoryId');
    expect(src).toContain("initialDocType: 'AUTO'");
    expect(src).not.toMatch(/categoryId[,\s]/);
  });

  it('preserves true same-mount drawer state across DE→EN→DE with zero mutations', async () => {
    writePersistedLocale('de');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const testFile = new File(['pdf'], RAW_FILENAME, { type: 'application/pdf' });
    pendingFileRef.current = testFile;
    flowMock.uploadedFileName = RAW_FILENAME;
    flowMock.errorMessage = null;
    flowMock.validationErrorCode = null;

    function MountTrackedDrawer() {
      useEffect(() => {
        drawerMountCount += 1;
      }, []);
      const [open, setOpen] = useState(true);
      const [reason, setReason] = useState(RAW_REUPLOAD_REASON);
      return createElement(
        'div',
        null,
        createElement('textarea', {
          'data-testid': 'reupload-reason',
          value: reason,
          onChange: (event: Event) => setReason((event.target as HTMLTextAreaElement).value),
        }),
        createElement(VehicleDocumentUploadDrawer, {
          open,
          onOpenChange: setOpen,
          vehicleId: 'veh-p260',
          vehicleLabel: 'Vehicle P260 X7',
        }),
      );
    }

    function LocaleSurface() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(MountTrackedDrawer),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleSurface)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const resetAfterMount = mutationCounters.reset;

    expect(drawerMountCount).toBe(1);
    expect(document.body.textContent).toContain(de['docUpload.drawer.title.upload']);
    expect(flowMock.errorMessage).toBeNull();

    const textarea = container.querySelector('[data-testid="reupload-reason"]') as HTMLTextAreaElement;
    expect(textarea.value).toBe(RAW_REUPLOAD_REASON);

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(drawerMountCount).toBe(1);
    expect(document.body.textContent).toContain(en['docUpload.drawer.title.upload']);
    expect(textarea.value).toBe(RAW_REUPLOAD_REASON);

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(drawerMountCount).toBe(1);
    expect(textarea.value).toBe(RAW_REUPLOAD_REASON);

    expect(mutationCounters.upload).toBe(0);
    expect(mutationCounters.reupload).toBe(0);
    expect(mutationCounters.retry).toBe(0);
    expect(mutationCounters.setType).toBe(0);
    expect(mutationCounters.reextract).toBe(0);
    expect(mutationCounters.confirm).toBe(0);
    expect(mutationCounters.schemaReview).toBe(0);
    expect(mutationCounters.reset).toBe(resetAfterMount);

    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });
});
