// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { ProductCatalogEditorPanel } from './ProductCatalogEditorPanel';

const getCatalogProduct = vi.fn();
const onOpenBilling = vi.fn();
const onOpenOrgProducts = vi.fn();
const onClose = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    products: {
      getCatalogProduct: (...args: unknown[]) => getCatalogProduct(...args),
      patchMetadataResult: vi.fn(),
    },
  },
}));

vi.mock('../../../components/mfa/MfaStepUpDialog', () => ({
  MfaStepUpDialog: () => null,
}));

describe('ProductCatalogEditorPanel unsaved guards', () => {
  const confirmSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    confirmSpy.mockReturnValue(false);
    vi.stubGlobal('confirm', confirmSpy);
    getCatalogProduct.mockResolvedValue({
      id: '1',
      slug: 'RENTAL',
      name: 'Baseline',
      description: '',
      catalogStatus: 'ACTIVE',
      organizationsCount: 1,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderPanel() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(LanguageProvider, null, createElement(ProductCatalogEditorPanel, {
          productSlug: 'RENTAL',
          selectedOrgId: 'org-1',
          onClose,
          onSaved: () => undefined,
          onOpenOrgProducts,
          onOpenBilling,
        })),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    return { container, root };
  }

  it('blocks tariff navigation when confirm is declined', async () => {
    const { container, root } = await renderPanel();
    const nameInput = container.querySelector('#product-meta-name') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(nameInput, 'Edited');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const tariffsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Tariffs'),
    );
    await act(async () => {
      tariffsBtn?.click();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(onOpenBilling).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });

  it('blocks org assignment navigation when confirm is declined', async () => {
    const { container, root } = await renderPanel();
    const nameInput = container.querySelector('#product-meta-name') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(nameInput, 'Edited');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const orgBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Organization product assignments'),
    );
    await act(async () => {
      orgBtn?.click();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(onOpenOrgProducts).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });
});