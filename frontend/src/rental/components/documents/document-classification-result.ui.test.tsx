import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentClassificationResultPanel } from './DocumentClassificationResultPanel';

describe('DocumentClassificationResultPanel', () => {
  it('renders recognized fine notice with reasons and change-type action', () => {
    const html = renderToStaticMarkup(
      <DocumentClassificationResultPanel
        record={{
          plausibility: {
            classification: {
              contractVersion: '2.0.0',
              category: 'AUTHORITY',
              subtype: 'FINE_NOTICE',
              confidence: 0.96,
              rationale: 'Authority penalty notice with offense and payable amount',
              alternatives: [],
              detectedIdentifiers: [
                { identifierType: 'fine_number', value: 'VB-2026-1199', evidencePage: 1 },
              ],
              modelVersion: 'mistral-small-latest',
              decisionAction: 'AUTO_CONTINUE',
              legacyDocumentType: 'FINE',
            },
          },
          documentCategory: 'AUTHORITY',
          documentSubtype: 'FINE_NOTICE',
          classificationConfidence: 0.96,
          detectedDocumentType: 'FINE',
          effectiveDocumentType: 'FINE',
          documentType: 'FINE',
          classificationMode: 'AUTO',
          allowedActions: ['set_document_type', 'confirm'],
          status: 'READY_FOR_REVIEW',
        }}
        locale="de"
        t={(key, vars) => {
          const map: Record<string, string> = {
            'docUpload.classificationPanelAria': 'Klassifikationsergebnis',
            'docUpload.classificationRecognizedAs': `Als ${vars?.label ?? ''} erkannt`,
            'docUpload.category': 'Kategorie',
            'docUpload.classificationSubtype': 'Untertyp',
            'docUpload.classificationRecognizedBecause': `Erkannt anhand von ${vars?.reasons ?? ''}`,
            'docUpload.classificationConfidence.high': 'Hohe Sicherheit',
            'docUpload.changeDocumentType': 'Dokumenttyp aendern',
            'docUpload.classificationShowDetails': 'Technische Details anzeigen',
            'documentExtraction.category.AUTHORITY': 'Behoerdliches',
            'documentExtraction.subtype.FINE_NOTICE': 'Bussgeldbescheid',
          };
          return map[key] ?? String(key);
        }}
        typeLabel={(key, fallback) => (key.endsWith('FINE_NOTICE') ? 'Bussgeldbescheid' : fallback ?? key)}
        mode="review"
        docTypeOptions={[
          { value: 'AUTO', labelKey: 'documentExtraction.classification.AUTO' },
          { value: 'FINE', labelKey: 'documentExtraction.type.FINE' },
        ]}
        pendingTypeSelection="FINE"
      />,
    );

    expect(html).toContain('Bussgeldbescheid');
    expect(html).toContain('Hohe Sicherheit');
    expect(html).toContain('Dokumenttyp aendern');
    expect(html).not.toContain('mistral-small-latest');
  });

  it('renders awaiting type flow with continue action', () => {
    const html = renderToStaticMarkup(
      <DocumentClassificationResultPanel
        record={{
          plausibility: {
            classification: {
              category: 'GENERAL',
              subtype: 'OTHER',
              confidence: 0.52,
              rationale: 'Customer correspondence without invoice or fine structure',
              alternatives: [
                {
                  category: 'CUSTOMER',
                  subtype: 'CUSTOMER_CORRESPONDENCE',
                  legacyDocumentType: 'OTHER',
                  confidence: 0.48,
                },
              ],
              decisionAction: 'AWAIT_USER',
            },
          },
          documentCategory: 'GENERAL',
          documentSubtype: 'OTHER',
          classificationConfidence: 0.52,
          detectedDocumentType: 'OTHER',
          effectiveDocumentType: null,
          documentType: null,
          classificationMode: 'AUTO',
          allowedActions: ['set_document_type'],
          status: 'AWAITING_DOCUMENT_TYPE',
        }}
        locale="en"
        t={(key, vars) => {
          const map: Record<string, string> = {
            'docUpload.classificationPanelAria': 'Document classification result',
            'docUpload.classificationUncertain': 'Document type is uncertain',
            'docUpload.classificationSubtype': 'Subtype',
            'docUpload.category': 'Category',
            'docUpload.classificationAlternatives': 'Other possible types',
            'docUpload.classificationConfidence.low': 'Low confidence',
            'docUpload.classificationReextractHint': 'Changing the document type invalidates the action plan.',
            'docUpload.selectTypeAndContinue': 'Select type and continue analysis',
            'documentExtraction.category.GENERAL': 'General',
            'documentExtraction.subtype.OTHER': 'Other',
            'documentExtraction.subtype.CUSTOMER_CORRESPONDENCE': 'Customer correspondence',
          };
          return map[key] ?? String(key);
        }}
        typeLabel={(_key, fallback) => fallback ?? 'Other'}
        mode="awaiting_type"
        docTypeOptions={[
          { value: 'SERVICE', labelKey: 'documentExtraction.type.SERVICE' },
          { value: 'OTHER', labelKey: 'documentExtraction.type.OTHER' },
        ]}
        pendingTypeSelection="OTHER"
      />,
    );

    expect(html).toContain('Document type is uncertain');
    expect(html).toContain('Other possible types');
    expect(html).toContain('Select type and continue analysis');
    expect(html).toContain('invalidates the action plan');
  });
});
