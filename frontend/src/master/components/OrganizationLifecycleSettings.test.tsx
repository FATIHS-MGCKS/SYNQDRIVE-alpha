// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { OrganizationLifecycleSettings } from './OrganizationLifecycleSettings';

describe('OrganizationLifecycleSettings', () => {
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

  const renderSettings = (props: React.ComponentProps<typeof OrganizationLifecycleSettings>) => {
    act(() => {
      root.render(
        createElement(LanguageProvider, null, createElement(OrganizationLifecycleSettings, props)),
      );
    });
  };

  it('shows activate for PENDING and calls onStatusChange with ACTIVE', async () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    renderSettings({
      orgId: 'org-1',
      orgStatus: 'PENDING',
      orgStatusLabel: 'Pending',
      onStatusChange,
    });

    const button = container.querySelector('button');
    expect(button?.textContent).toMatch(/Activate organization/i);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onStatusChange).toHaveBeenCalledWith('ACTIVE');
  });

  it('does not show STEP_UP_REQUIRED as a terminal lifecycle error', async () => {
    const onStatusChange = vi.fn().mockRejectedValue(new Error('[STEP_UP_REQUIRED] MFA required'));
    renderSettings({
      orgId: 'org-1',
      orgStatus: 'PENDING',
      orgStatusLabel: 'Pending',
      onStatusChange,
    });

    const button = container.querySelector('button');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('clears prior errors when orgStatus updates after successful retry', () => {
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    const { rerender } = (() => {
      renderSettings({
        orgId: 'org-1',
        orgStatus: 'ACTIVE',
        orgStatusLabel: 'Active',
        onStatusChange,
      });
      return {
        rerender: (nextStatus: string, nextLabel: string) => {
          act(() => {
            root.render(
              createElement(
                LanguageProvider,
                null,
                createElement(OrganizationLifecycleSettings, {
                  orgId: 'org-1',
                  orgStatus: nextStatus,
                  orgStatusLabel: nextLabel,
                  onStatusChange,
                }),
              ),
            );
          });
        },
      };
    })();

    rerender('SUSPENDED', 'Suspended');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not expose unrestricted ARCHIVED controls', () => {
    const onStatusChange = vi.fn();
    renderSettings({
      orgId: 'org-1',
      orgStatus: 'ARCHIVED',
      orgStatusLabel: 'Archived',
      onStatusChange,
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.length).toBe(0);
    expect(container.textContent).toMatch(/Retention-aware offboarding/i);
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});