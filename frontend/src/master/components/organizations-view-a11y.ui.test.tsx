import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider, translateKey } from '../../i18n/LanguageContext';
import { createElement } from 'react';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)));

describe('Organizations view a11y (UX-011)', () => {
  it('pagination controls use canonical i18n keys', () => {
    const src = readFileSync(join(srcRoot, 'OrganizationsView.tsx'), 'utf8');
    expect(src).toContain("t('master.organizations.list.pagination.prevPage')");
    expect(src).toContain("t('master.organizations.list.pagination.nextPage')");
  });

  it('renders localized pagination accessible names', () => {
    const prev = translateKey('de', 'master.organizations.list.pagination.prevPage').text;
    const next = translateKey('de', 'master.organizations.list.pagination.nextPage').text;
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(
          'div',
          null,
          createElement('button', { type: 'button', 'aria-label': prev }),
          createElement('button', { type: 'button', 'aria-label': next }),
        ),
      ),
    );
    expect(html).toContain('aria-label="Vorherige Seite"');
    expect(html).toContain('aria-label="Nächste Seite"');
  });

  it('organization create wizard uses Radix dialog title and localized back', () => {
    const src = readFileSync(join(srcRoot, 'OrganizationCreateWizard.tsx'), 'utf8');
    expect(src).toContain('DialogPrimitive.Title');
    expect(src).toContain("t('common.back')");
    expect(src).toContain('htmlFor={FIELD_IDS.companyName}');
  });
});