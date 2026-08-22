// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationCenterShell } from './CommunicationCenterShell';

function mockMatchMedia(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      (query.includes('max-width: 1023px') && width <= 1023) ||
      (query.includes('min-width: 1024px') &&
        query.includes('max-width: 1279px') &&
        width >= 1024 &&
        width <= 1279) ||
      (query.includes('min-width: 1280px') && width >= 1280),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('CommunicationCenterShell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.history.replaceState({}, '', '/rental');
    localStorage.setItem('synqdrive.locale', 'en');
    mockMatchMedia(1440);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderShell() {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(CommunicationCenterShell)));
    });
  }

  it('renders inbox tab by default with structural panes', () => {
    renderShell();
    const html = container.innerHTML;
    expect(container.querySelector('[data-testid="communication-center-view"]')).not.toBeNull();
    expect(html).toContain('Select a conversation');
    expect(container.querySelector('[data-testid="communication-inbox-pane"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="communication-workspace-pane"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="communication-context-pane"]')).toBeNull();
    expect(container.querySelector('[data-testid="communication-inbox-skeleton"]')).toBeNull();
  });

  it('renders German copy when locale is de', () => {
    localStorage.setItem('synqdrive.locale', 'de');
    renderShell();
    expect(container.textContent).toContain('Konversation auswählen');
    expect(container.textContent).toContain('Posteingang');
  });

  it('shows context pane when conversation id is provided on desktop', () => {
    window.history.replaceState({}, '', '/rental?conversationId=conv-shell-test');
    renderShell();
    expect(container.querySelector('[data-testid="communication-context-pane"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="communication-timeline-shell"]')).not.toBeNull();
  });

  it('shows settings placeholder when settings tab is selected via URL', () => {
    window.history.replaceState({}, '', '/rental?communicationTab=settings');
    renderShell();
    expect(container.querySelector('[data-testid="communication-settings-shell"]')).not.toBeNull();
    expect(container.textContent).toContain('Configuration');
  });
});
