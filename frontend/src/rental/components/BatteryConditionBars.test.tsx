// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatteryConditionBars } from './BatteryConditionBars';

describe('BatteryConditionBars accessibility', () => {
  it('exposes img role with aria-label for screen readers', () => {
    const html = renderToStaticMarkup(<BatteryConditionBars status="GOOD" bars={3} showLabel />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label');
  });
});
