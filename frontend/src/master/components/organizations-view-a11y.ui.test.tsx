import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)));

describe('Organizations view a11y (UX-011)', () => {
  it('pagination controls expose accessible names', () => {
    const src = readFileSync(join(srcRoot, 'OrganizationsView.tsx'), 'utf8');
    expect(src).toContain('aria-label="Vorherige Seite"');
    expect(src).toContain('aria-label="Nächste Seite"');
  });

  it('organization create wizard uses Radix dialog title', () => {
    const src = readFileSync(join(srcRoot, 'OrganizationCreateWizard.tsx'), 'utf8');
    expect(src).toContain('DialogPrimitive.Title');
    expect(src).toContain('aria-label="Zurück"');
  });
});