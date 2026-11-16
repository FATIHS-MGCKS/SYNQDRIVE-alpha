// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OrganizationProductsTab } from './OrganizationProductsTab';

vi.mock('../../../lib/api', () => ({
  api: {
    products: {
      list: vi.fn().mockResolvedValue([
        { id: '1', slug: 'RENTAL', name: 'Rental', catalogStatus: 'ACTIVE' },
        { id: '2', slug: 'FLEET', name: 'Fleet', catalogStatus: 'ACTIVE' },
        { id: '3', slug: 'VYMOD', name: 'VYMOD', catalogStatus: 'ACTIVE' },
        { id: '4', slug: 'TAXI', name: 'Taxi Legacy', catalogStatus: 'DISABLED' },
      ]),
      listByOrg: vi.fn().mockResolvedValue([
        {
          id: 'op-r',
          name: 'Rental',
          productSlug: 'RENTAL',
          status: 'Active',
          plan: 'Starter',
          vehicleAccessMode: 'ORGANIZATION_WIDE',
        },
        {
          id: 'op-t',
          name: 'Taxi',
          productSlug: 'TAXI',
          status: 'Suspended',
          plan: 'Starter',
          vehicleAccessMode: 'ORGANIZATION_WIDE',
        },
      ]),
    },
    vehicles: { listByOrg: vi.fn() },
  },
}));

describe('OrganizationProductsTab', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it('renders roadmap labels and legacy TAXI section', async () => {
    await act(async () => {
      root.render(createElement(OrganizationProductsTab, { orgId: 'org-1' }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Plattform-Produkte');
    expect(text).toContain('Bestehendes Geschäftsprodukt');
    expect(text).toContain('In Vorbereitung');
    expect(text).toContain('Legacy / eingestellt');
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    const values = Array.from(select!.querySelectorAll('option')).map((o) => o.value);
    expect(values).not.toContain('TAXI');
    expect(values).toEqual(expect.arrayContaining(['RENTAL', 'FLEET', 'VYMOD']));
  });
});