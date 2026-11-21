// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  OrganizationsOperationalRefreshProvider,
  useOrganizationsOperationalRefresh,
} from './organizations-operational-refresh';

describe('organizations operational refresh registry', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let harness: ReturnType<typeof useOrganizationsOperationalRefresh> | undefined;

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    harness = undefined;
  });

  it('invokes registered refresh without duplicating fetch architecture', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    function Harness() {
      harness = useOrganizationsOperationalRefresh();
      return null;
    }

    act(() => {
      root.render(
        createElement(
          OrganizationsOperationalRefreshProvider,
          null,
          createElement(Harness),
        ),
      );
    });

    act(() => {
      harness!.registerOperationalRefresh(refresh);
    });

    await act(async () => {
      await harness!.refreshOperationalList();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});