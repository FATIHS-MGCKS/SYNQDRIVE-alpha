// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationCenterView } from './CommunicationCenterView';

const mockUseRentalOrg = vi.fn();

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => mockUseRentalOrg(),
}));

describe('CommunicationCenterView RBAC', () => {
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

  function renderView() {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(CommunicationCenterView)));
    });
  }

  it('denies access without communication.read permission', () => {
    mockUseRentalOrg.mockReturnValue({
      orgId: 'org-1',
      hasPermission: () => false,
      userRole: 'DRIVER',
    });
    renderView();
    expect(container.querySelector('[data-testid="communication-center-access-denied"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="communication-center-view"]')).toBeNull();
  });

  it('renders shell for communication.read permission', () => {
    mockUseRentalOrg.mockReturnValue({
      orgId: 'org-1',
      hasPermission: (module: string, level: string) =>
        module === 'communication' && level === 'read',
      userRole: 'ORG_ADMIN',
    });
    renderView();
    expect(container.querySelector('[data-testid="communication-center-view"]')).not.toBeNull();
  });
});
