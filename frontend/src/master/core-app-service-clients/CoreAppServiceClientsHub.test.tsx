// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreAppServiceClientsHub } from './CoreAppServiceClientsHub';

const clientA = {
  id: 'client-a',
  clientId: 'fleet-a',
  displayName: 'Fleet A',
  productSlug: 'FLEET',
  status: 'DISABLED' as const,
  allowedScopes: ['core:app:vehicle:read'],
  credentialVersion: 1,
  createdAt: '2026-11-17T00:00:00.000Z',
  updatedAt: '2026-11-17T00:00:00.000Z',
  activeGrantCount: 0,
};

const clientNew = {
  ...clientA,
  id: 'client-new',
  clientId: 'fleet-new',
  displayName: 'Fleet New',
};

const { listMock, createMock, listGrantsMock, updateMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  listGrantsMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      coreAppServiceClients: {
        list: listMock,
        create: createMock,
        listOrgGrants: listGrantsMock,
        update: updateMock,
        rotateCredential: vi.fn(),
        attachOrgGrant: vi.fn(),
        updateOrgGrant: vi.fn(),
      },
    },
  },
}));

function setControlledInput(el: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('CoreAppServiceClientsHub one-time secret safety', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    listMock.mockReset();
    createMock.mockReset();
    listGrantsMock.mockReset();
    listMock.mockResolvedValue({
      contractVersion: 'core.app.service_client.admin.v1',
      items: [clientA],
    });
    listGrantsMock.mockResolvedValue({
      contractVersion: 'core.app.service_client.admin.v1',
      serviceClientId: clientA.id,
      items: [],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderHub() {
    await act(async () => {
      root.render(createElement(CoreAppServiceClientsHub));
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('keeps secret visible after create despite selecting the new client', async () => {
    createMock.mockImplementation(async () => {
      listMock.mockResolvedValue({
        contractVersion: 'core.app.service_client.admin.v1',
        items: [clientA, clientNew],
      });
      listGrantsMock.mockResolvedValue({
        contractVersion: 'core.app.service_client.admin.v1',
        serviceClientId: clientNew.id,
        items: [],
      });
      return {
        contractVersion: 'core.app.service_client.admin.v1',
        client: clientNew,
        clientSecret: 'shown-once-secret',
      };
    });

    await renderHub();

    const clientIdInput = container.querySelector<HTMLInputElement>('input[placeholder="clientId"]');
    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="Anzeigename"]');
    expect(clientIdInput).toBeTruthy();
    await act(async () => {
      setControlledInput(clientIdInput!, 'fleet-new');
      setControlledInput(nameInput!, 'Fleet New');
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Client erstellen'),
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton!.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="one-time-secret-panel"]')).toBeTruthy();
    expect(container.textContent).toContain('shown-once-secret');
  });

  it('clears secret after dismissal or user-driven client switch', async () => {
    listMock.mockResolvedValue({
      contractVersion: 'core.app.service_client.admin.v1',
      items: [clientA, clientNew],
    });

    createMock.mockResolvedValue({
      contractVersion: 'core.app.service_client.admin.v1',
      client: clientNew,
      clientSecret: 'rotate-secret',
    });

    await renderHub();

    await act(async () => {
      const createButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Client erstellen'),
      );
      const clientIdInput = container.querySelector<HTMLInputElement>('input[placeholder="clientId"]');
      const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="Anzeigename"]');
      setControlledInput(clientIdInput!, 'fleet-new');
      setControlledInput(nameInput!, 'Fleet New');
      createButton!.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('rotate-secret');

    const dismiss = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Schließen und aus Speicher entfernen'),
    );
    await act(async () => {
      dismiss!.click();
    });
    expect(container.querySelector('[data-testid="one-time-secret-panel"]')).toBeFalsy();

    createMock.mockResolvedValue({
      contractVersion: 'core.app.service_client.admin.v1',
      client: clientNew,
      clientSecret: 'second-secret',
    });
    await act(async () => {
      const createButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Client erstellen'),
      );
      createButton!.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('second-secret');

    const fleetAButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Fleet A'),
    );
    await act(async () => {
      fleetAButton!.click();
    });
    expect(container.querySelector('[data-testid="one-time-secret-panel"]')).toBeFalsy();
  });

  it('shows refreshWarning when status mutation succeeds but sync fails', async () => {
    updateMock.mockResolvedValue({ ...clientA, status: 'ACTIVE' });
    listGrantsMock.mockResolvedValue({
      contractVersion: 'core.app.service_client.admin.v1',
      serviceClientId: clientA.id,
      items: [],
    });

    await renderHub();
    await waitForHubList();

    listMock.mockRejectedValueOnce(new Error('sync failed'));

    const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Aktivieren'),
    );
    expect(toggle).toBeTruthy();
    await act(async () => {
      toggle!.click();
      await Promise.resolve();
    });

    expect(updateMock).toHaveBeenCalled();
    expect(container.textContent).toContain('Aktualisierung nach Änderung fehlgeschlagen');
    expect(container.textContent).toContain('sync failed');
  });
});

async function waitForHubList() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}