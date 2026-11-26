// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { ProductCatalogEditorPanel } from './ProductCatalogEditorPanel';

const getCatalogProduct = vi.fn();
const patchMetadataResult = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    products: {
      getCatalogProduct: (...args: unknown[]) => getCatalogProduct(...args),
      patchMetadataResult: (...args: unknown[]) => patchMetadataResult(...args),
    },
  },
}));

vi.mock('../../../components/mfa/MfaStepUpDialog', () => ({
  MfaStepUpDialog: () => null,
}));

describe('ProductCatalogEditorPanel conflict handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCatalogProduct
      .mockResolvedValueOnce({
        id: '1',
        slug: 'RENTAL',
        name: 'Baseline',
        description: '',
        catalogStatus: 'ACTIVE',
        organizationsCount: 1,
      })
      .mockResolvedValueOnce({
        id: '1',
        slug: 'RENTAL',
        name: 'Server concurrent',
        description: '',
        catalogStatus: 'ACTIVE',
        organizationsCount: 1,
      });
  });

  it('preserves user-edited name on 409 while refreshing CAS baseline', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, null, createElement(ProductCatalogEditorPanel, {
          productSlug: 'RENTAL',
          onClose: () => undefined,
          onSaved: () => undefined,
          onOpenBilling: () => undefined,
        })),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const nameInput = container.querySelector('#product-meta-name') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(nameInput, 'User typed name');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    patchMetadataResult.mockResolvedValueOnce({
      ok: false,
      status: 409,
      errorMessage: 'Product metadata changed concurrently',
    });

    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save'),
    );
    await act(async () => {
      saveBtn?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(getCatalogProduct).toHaveBeenCalledTimes(2);
    expect(nameInput.value).toBe('User typed name');
    expect(container.textContent).toMatch(/review and save again|Your edits are still/i);
    root.unmount();
    container.remove();
  });

});

describe('ProductCatalogEditorPanel conflict refresh failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCatalogProduct.mockResolvedValueOnce({
      id: '1',
      slug: 'RENTAL',
      name: 'Baseline',
      description: '',
      catalogStatus: 'ACTIVE',
      organizationsCount: 1,
    });
  });

  it('surfaces refresh failure after 409 without discarding user input', async () => {
    getCatalogProduct.mockRejectedValueOnce(new Error('network down'));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, null, createElement(ProductCatalogEditorPanel, {
          productSlug: 'RENTAL',
          onClose: () => undefined,
          onSaved: () => undefined,
          onOpenBilling: () => undefined,
        })),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const nameInput = container.querySelector('#product-meta-name') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(nameInput, 'Still mine');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    patchMetadataResult.mockResolvedValueOnce({
      ok: false,
      status: 409,
      errorMessage: 'concurrently',
    });

    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save'),
    );
    await act(async () => {
      saveBtn?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(nameInput.value).toBe('Still mine');
    expect(container.textContent).toMatch(/Could not refresh|conflict/i);
    root.unmount();
    container.remove();
  });
});