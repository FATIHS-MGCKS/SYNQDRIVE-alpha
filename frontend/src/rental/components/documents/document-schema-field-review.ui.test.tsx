import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentSchemaFieldReview } from './DocumentSchemaFieldReview';
import type { SchemaReviewGroup } from '../../lib/document-schema-field-review';

const t = (key: string, vars?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    'docUpload.fieldReview.group.finance': 'Finanzen',
    'docUpload.fieldReview.required': 'Pflicht',
    'docUpload.fieldReview.saveAndRecheck': 'Speichern und erneut pruefen',
    'docUpload.fieldReview.saveBeforeConfirmHint': 'Bitte speichern',
  };
  const value = map[key] ?? key;
  if (!vars) return value;
  return Object.entries(vars).reduce(
    (acc, [name, val]) => acc.replace(`{${name}}`, String(val)),
    value,
  );
};

const groups: SchemaReviewGroup[] = [
  {
    id: 'finance',
    labelKey: 'docUpload.fieldReview.group.finance',
    fields: [
      {
        key: 'invoiceNumber',
        label: 'Rechnungsnummer',
        fieldType: 'text',
        uiGroup: 'finance',
        order: 1,
        required: true,
        sensitive: false,
        value: 'INV-1',
        isMissing: false,
        provenance: null,
        showConfidence: false,
        confidencePercent: null,
        fieldChecks: [],
        showSource: false,
      },
    ],
  },
];

describe('DocumentSchemaFieldReview', () => {
  it('renders grouped fields and save button when editable', () => {
    const html = renderToStaticMarkup(
      <DocumentSchemaFieldReview
        groups={groups}
        isDirty={true}
        t={t}
        onFieldChange={() => undefined}
        onSaveReview={() => undefined}
      />,
    );

    expect(html).toContain('Finanzen');
    expect(html).toContain('INV-1');
    expect(html).toContain('Speichern und erneut pruefen');
    expect(html).toContain('Pflicht');
  });
});
