// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { BatteryHealthQueryErrorPanel } from './BatteryHealthQueryErrorPanel';

function renderDe(ui: React.ReactElement) {
  window.localStorage.setItem('synqdrive.locale', 'de');
  return renderToStaticMarkup(createElement(LanguageProvider, null, ui));
}

describe('BatteryHealthQueryErrorPanel', () => {
  it('exposes alert role and retry control for API partial errors', () => {
    const html = renderDe(
      <BatteryHealthQueryErrorPanel error="Teilweise Batteriedaten nicht verfügbar" onRetry={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Teilweise Batteriedaten nicht verfügbar');
    expect(html).toContain('Erneut laden');
  });
});
