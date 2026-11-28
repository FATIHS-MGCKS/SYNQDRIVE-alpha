// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { AppThemeProvider } from '../../context/AppThemeContext';
import { CreateGlobalUserDialog } from './components/CreateGlobalUserDialog';

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      securityAccess: {
        createUser: vi.fn(),
        listOrgRoles: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
    organizations: {
      listOperational: vi.fn().mockResolvedValue({ data: [] }),
    },
  },
}));

describe('P3A.2 create user dialog (render)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('F01 create dialog opens with form controls', async () => {
    await act(async () => {
      root.render(
        createElement(
          AppThemeProvider,
          null,
          createElement(
            LanguageProvider,
            null,
            createElement(CreateGlobalUserDialog, {
              open: true,
              onOpenChange: () => {},
              onListRefresh: () => {},
              onOpenCreatedUser: () => {},
            }),
          ),
        ),
      );
    });
    expect(document.body.querySelector('[data-testid="create-global-user-dialog"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="create-user-email"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="create-user-submit"]')).toBeTruthy();
  });
});