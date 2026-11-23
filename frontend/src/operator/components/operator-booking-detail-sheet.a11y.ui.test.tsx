import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { LanguageProvider, translateKey } from '../../i18n/LanguageContext';

const srcRoot = dirname(fileURLToPath(import.meta.url));

describe('OperatorBookingDetailSheet a11y (UX-011)', () => {
  it('exposes labelled dialog, focus hook, and live regions', () => {
    const src = readFileSync(join(srcRoot, 'OperatorBookingDetailSheet.tsx'), 'utf8');
    expect(src).toContain('usePortalModalA11y');
    expect(src).toContain('aria-labelledby={titleId}');
    expect(src).toContain('operator-booking-detail-title');
    expect(src).toContain('aria-label="Schließen"');
    expect(src).toContain('role="status"');
    expect(src).toContain('role="alert"');
    expect(src).toContain("t('operator.bookings.detail.loadingAnnouncement')");
  });

  it('renders localized loading announcement copy', () => {
    const text = translateKey('de', 'operator.bookings.detail.loadingAnnouncement').text;
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement('span', { className: 'sr-only' }, text),
      ),
    );
    expect(html).toContain('Details werden geladen');
  });
});