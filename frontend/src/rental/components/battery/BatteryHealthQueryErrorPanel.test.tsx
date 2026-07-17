// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatteryHealthQueryErrorPanel } from './BatteryHealthQueryErrorPanel';

describe('BatteryHealthQueryErrorPanel', () => {
  it('exposes alert role and retry control for API partial errors', () => {
    const html = renderToStaticMarkup(
      <BatteryHealthQueryErrorPanel error="Teilweise Batteriedaten nicht verfügbar" onRetry={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Teilweise Batteriedaten nicht verfügbar');
    expect(html).toContain('Erneut laden');
  });
});
