import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable } from './data-table';

describe('DataTable a11y (UX-011)', () => {
  it('sets aria-busy on table while loading', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ key: 'name', header: 'Name', cell: () => 'x' }]}
        rows={[]}
        getRowKey={() => 'k'}
        loading
      />,
    );
    expect(html).toContain('aria-busy="true"');
  });
});