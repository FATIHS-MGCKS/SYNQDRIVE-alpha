import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorGatedActionButton } from './OperatorGatedActionButton';

describe('OperatorGatedActionButton', () => {
  it('renders disabled button with title when gate denies', () => {
    const html = renderToStaticMarkup(
      <OperatorGatedActionButton gate={{ allowed: false, reason: 'Keine Berechtigung' }}>
        Aktion
      </OperatorGatedActionButton>,
    );
    expect(html).toContain('disabled');
    expect(html).toContain('title="Keine Berechtigung"');
    expect(html).toContain('aria-disabled="true"');
  });

  it('renders enabled button when gate allows', () => {
    const html = renderToStaticMarkup(
      <OperatorGatedActionButton gate={{ allowed: true }}>Erlaubt</OperatorGatedActionButton>,
    );
    expect(html).toContain('Erlaubt');
    expect(html).not.toContain('disabled=""');
  });
});
