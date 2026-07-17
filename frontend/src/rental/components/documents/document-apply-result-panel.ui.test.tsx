import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentApplyResultPanel } from './DocumentApplyResultPanel';
import type { PublicDocumentApplyResult } from '../../lib/document-extraction.types';

const t = (key: string) => key;

const applyingResult: PublicDocumentApplyResult = {
  lifecycleStatus: 'APPLYING',
  extractionStatus: 'CONFIRMED',
  summary: 'Apply running',
  detailSummary: 'Cannot cancel',
  isTerminal: false,
  applyingInProgress: true,
  nonCancellable: true,
  requiredActionsComplete: false,
  canRetryFailedActions: false,
  partiallyApplied: false,
  applyFailed: false,
  fingerprint: 'fp',
  actions: [
    {
      actionIndex: 0,
      semanticAction: 'CREATE_FINE_DRAFT',
      labelKey: 'documentAction.CREATE_FINE_DRAFT',
      title: 'Bussgeld anlegen',
      requirement: 'REQUIRED',
      status: 'RUNNING',
      targetModule: 'fines',
      targetModuleLabel: 'Bussgelder',
      resultEntityType: null,
      resultEntityId: null,
      entityLink: null,
      errorCode: null,
      errorMessage: null,
      skippedReason: null,
    },
  ],
};

const partialResult: PublicDocumentApplyResult = {
  ...applyingResult,
  lifecycleStatus: 'PARTIALLY_APPLIED',
  extractionStatus: 'PARTIALLY_APPLIED',
  summary: 'Partial',
  detailSummary: 'Optional failed',
  isTerminal: true,
  applyingInProgress: false,
  partiallyApplied: true,
  requiredActionsComplete: true,
  canRetryFailedActions: true,
  actions: [
    {
      ...applyingResult.actions[0],
      status: 'SUCCEEDED',
      entityLink: {
        entityType: 'fine',
        entityId: 'fine-1',
        label: 'Bussgeld oeffnen',
        targetModule: 'fines',
        targetModuleLabel: 'Bussgelder',
      },
    },
    {
      actionIndex: 1,
      semanticAction: 'SUGGEST_ENTITY_LINK',
      labelKey: 'documentAction.SUGGEST_ENTITY_LINK',
      title: 'Verknuepfung vorschlagen',
      requirement: 'OPTIONAL',
      status: 'FAILED',
      targetModule: 'documents',
      targetModuleLabel: 'Dokumente',
      resultEntityType: null,
      resultEntityId: null,
      entityLink: null,
      errorCode: 'TECHNICAL_FAILURE',
      errorMessage: 'Technischer Fehler',
      skippedReason: null,
    },
  ],
};

describe('DocumentApplyResultPanel', () => {
  it('renders per-action status while applying', () => {
    const html = renderToStaticMarkup(
      <DocumentApplyResultPanel flow="applying" applyResult={applyingResult} t={t} />,
    );

    expect(html).toContain('docUpload.applyResult.title');
    expect(html).toContain('Bussgeld anlegen');
    expect(html).toContain('docUpload.applyResult.status.RUNNING');
    expect(html).toContain('Cannot cancel');
  });

  it('shows entity link and retry for partial apply', () => {
    const html = renderToStaticMarkup(
      <DocumentApplyResultPanel
        flow="partially_done"
        applyResult={partialResult}
        t={t}
        onRetryFailed={() => undefined}
      />,
    );

    expect(html).toContain('Bussgeld oeffnen');
    expect(html).toContain('Technischer Fehler');
    expect(html).toContain('docUpload.applyResult.retryFailed');
  });
});
