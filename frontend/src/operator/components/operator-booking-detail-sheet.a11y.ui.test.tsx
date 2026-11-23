import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  });
});