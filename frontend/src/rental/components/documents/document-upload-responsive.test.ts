import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../DocumentUploadView.tsx'),
  'utf8',
);

const uploadZoneSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), './DocumentIntakeUploadZone.tsx'),
  'utf8',
);

const reviewPanelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), './DocumentExtractionReviewPanel.tsx'),
  'utf8',
);

describe('DocumentUploadView responsive layout guards', () => {
  it('clips horizontal overflow at the page root without hiding the underlying fix', () => {
    expect(viewSource).toMatch(/w-full max-w-\[1200px\].*min-w-0.*overflow-x-clip/s);
  });

  it('uses a mobile 4-column stepper grid and keeps desktop connectors separate', () => {
    expect(viewSource).toContain('grid grid-cols-4 gap-1 min-w-0 sm:hidden');
    expect(viewSource).toContain('hidden sm:flex items-center justify-between min-w-0');
    expect(viewSource).toContain('line-clamp-2');
  });

  it('stacks vehicle and document type selectors on narrow viewports', () => {
    expect(viewSource).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0');
  });

  it('stacks review fields and action buttons on mobile', () => {
    expect(reviewPanelSource).toContain('flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3');
    expect(viewSource).toContain('flex flex-col sm:flex-row sm:items-center gap-3 pt-2 min-w-0');
    expect(reviewPanelSource).toContain('sm:w-44');
  });

  it('avoids truncating the page title on mobile', () => {
    expect(viewSource).not.toContain('truncate font-display');
    expect(viewSource).toContain('break-words font-display');
  });

  it('keeps dropzone and side column within the viewport', () => {
    expect(uploadZoneSource).toContain('p-6 sm:p-10 lg:p-12');
    expect(viewSource).toContain('min-w-0 w-full');
    expect(viewSource).toContain('break-all');
  });
});
