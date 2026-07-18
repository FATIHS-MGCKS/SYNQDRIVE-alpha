import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentActionPlanReview } from './DocumentActionPlanReview';
import type { PublicDocumentActionPlanPreview } from '../../lib/document-extraction.types';

const t = (key: string) => {
  const map: Record<string, string> = {
    'docUpload.actionPlan.title': 'Was soll uebernommen werden?',
    'docUpload.actionPlan.targetModule': 'Zielmodul',
    'docUpload.actionPlan.targetEntity': 'Zielentitaet',
    'docUpload.actionPlan.writableData': 'Wichtigste Daten',
    'docUpload.actionPlan.requirement.REQUIRED': 'Pflicht',
    'docUpload.actionPlan.status.READY': 'Bereit',
  };
  return map[key] ?? key;
};

const preview: PublicDocumentActionPlanPreview = {
  planId: 'plan-1',
  fingerprint: 'fp-1',
  planVersion: 1,
  planOutcome: 'READY',
  planStatus: 'PREVIEW',
  summary: 'Aktionen koennen ausgefuehrt werden.',
  blocked: false,
  canConfirm: true,
  confirmBlockedReason: null,
  disabledOptionalActions: [],
  actions: [
    {
      semanticAction: 'CREATE_INVOICE_DRAFT',
      labelKey: 'documentAction.CREATE_INVOICE_DRAFT',
      title: 'Rechnung als Entwurf anlegen',
      targetModule: 'invoices',
      targetModuleLabel: 'Rechnungen',
      targetEntityType: 'invoice',
      targetEntityLabel: null,
      requirement: 'REQUIRED',
      status: 'READY',
      sequence: 1,
      writableFields: [{ key: 'invoiceNumber', label: 'Rechnungsnummer', value: 'INV-1' }],
      missingPrerequisites: [],
      conflicts: [],
      toggleable: false,
      enabled: true,
    },
  ],
};

describe('DocumentActionPlanReview', () => {
  it('renders server action cards with readable labels', () => {
    const html = renderToStaticMarkup(
      <DocumentActionPlanReview preview={preview} t={t} />,
    );

    expect(html).toContain('Was soll uebernommen werden?');
    expect(html).toContain('Rechnung als Entwurf anlegen');
    expect(html).toContain('Rechnungen');
    expect(html).toContain('INV-1');
    expect(html).toContain('Pflicht');
    expect(html).toContain('Bereit');
  });

  it('shows locked hint before saved field review', () => {
    const html = renderToStaticMarkup(
      <DocumentActionPlanReview preview={null} locked t={t} />,
    );
    expect(html).toContain('docUpload.actionPlan.locked');
  });
});
