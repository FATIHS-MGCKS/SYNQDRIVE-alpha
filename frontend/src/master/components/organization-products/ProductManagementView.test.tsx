// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProductManagementView } from './ProductManagementView';

const onOpenOrgProducts = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    products: {
      list: vi.fn().mockResolvedValue([
        { id: '1', slug: 'RENTAL', name: 'Rental', catalogStatus: 'ACTIVE' },
        { id: '2', slug: 'FLEET', name: 'Fleet', catalogStatus: 'ACTIVE' },
        { id: '3', slug: 'VYMOD', name: 'VYMOD', catalogStatus: 'ACTIVE' },
        { id: '4', slug: 'TAXI', name: 'Taxi', catalogStatus: 'DISABLED' },
      ]),
      stats: vi.fn().mockResolvedValue([
        { slug: 'RENTAL', totalOrgs: 10, active: 8 },
        { slug: 'FLEET', totalOrgs: 1, active: 0 },
        { slug: 'VYMOD', totalOrgs: 0, active: 0 },
      ]),
    },
    organizations: {
      listOperational: vi.fn().mockResolvedValue({
        data: [{ id: 'org-9', companyName: 'Demo GmbH', city: 'Berlin', country: 'DE' }],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      }),
    },
  },
}));

describe('ProductManagementView', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it('renders roadmap cards without TAXI and deep-links org products', async () => {
    await act(async () => {
      root.render(createElement(ProductManagementView, { onOpenOrgProducts }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Produktmanagement');
    expect(text).toContain('SYNQDRIVE Rental');
    expect(text).toContain('Bestehendes Geschäftsprodukt');
    expect(text).toContain('In Vorbereitung');
    expect(text).not.toContain('data-product-slug="TAXI"');
    expect(container.querySelector('[data-product-slug="TAXI"]')).toBeNull();

    const orgPick = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Demo GmbH'),
    );
    expect(orgPick).toBeTruthy();
    await act(async () => {
      orgPick!.click();
    });
    const manageBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Produkte verwalten'),
    );
    expect(manageBtn).toBeTruthy();
    await act(async () => {
      manageBtn!.click();
    });
    expect(onOpenOrgProducts).toHaveBeenCalledWith('org-9');
  });
});