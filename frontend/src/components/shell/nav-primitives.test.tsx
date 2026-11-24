// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CollapsedNavTooltip } from './nav-primitives';

describe('CollapsedNavTooltip', () => {
  it('exposes label on keyboard focus path via group-focus-within', () => {
    const host = document.createElement('div');
    host.className = 'relative group';
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(createElement(CollapsedNavTooltip, { label: 'Support' }));
    });
    const tooltip = host.querySelector('.sq-overlay') as HTMLElement;
    expect(tooltip?.className).toContain('group-focus-within:opacity-100');
    expect(tooltip?.className).toContain('group-hover:opacity-100');
    document.body.removeChild(host);
  });
});