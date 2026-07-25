import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { escapeHtml } from './safe-markdown.utils';
import { renderSafeMarkdown } from './safe-markdown';

describe('safe markdown', () => {
  it('escapes HTML and does not execute script tags', () => {
    const escaped = escapeHtml('<script>alert(1)</script><strong>x</strong>');
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('renders bold without dangerouslySetInnerHTML', () => {
    const html = renderToStaticMarkup(
      <>{renderSafeMarkdown('**Fleet** status')}</>,
    );
    expect(html).toContain('<strong>Fleet</strong>');
    expect(html).not.toContain('dangerouslySetInnerHTML');
    expect(html).not.toContain('<img');
  });
});
