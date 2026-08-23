// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationMemberPicker } from './CommunicationMemberPicker';

describe('CommunicationMemberPicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('synqdrive.locale', 'en');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderPicker(
    props: Partial<React.ComponentProps<typeof CommunicationMemberPicker>> = {},
  ) {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(CommunicationMemberPicker, {
            members: [],
            currentUserId: 'user-a',
            selectedUserId: null,
            onSelect: () => undefined,
            ...props,
          }),
        ),
      );
    });
  }

  it('shows permission message on 403 without exposing raw API error', () => {
    renderPicker({ loadError: 'permission_denied' });
    expect(container.textContent).toContain('permission');
    expect(container.textContent).not.toContain('API error');
  });

  it('renders safe display names without email or uuid fallback', () => {
    renderPicker({
      members: [{ id: 'user-b', displayName: 'Operator B', isActive: true }],
    });
    expect(container.textContent).toContain('Operator B');
    expect(container.textContent).not.toContain('user-b');
  });
});
