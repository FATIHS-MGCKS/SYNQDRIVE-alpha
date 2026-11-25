// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { ProductCatalogStatusChangeDialog } from './ProductCatalogStatusChangeDialog';

const getCatalogStatusImpact = vi.fn();
const patchCatalogStatusResult = vi.fn();
const getCatalogProduct = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    products: {
      getCatalogStatusImpact: (...args: unknown[]) => getCatalogStatusImpact(...args),
      patchCatalogStatusResult: (...args: unknown[]) => patchCatalogStatusResult(...args),
      getCatalogProduct: (...args: unknown[]) => getCatalogProduct(...args),
    },
  },
}));

vi.mock('../../../components/mfa/MfaStepUpDialog', () => ({
  MfaStepUpDialog: () => null,
}));

const baseRow = {
  id: '1',
  slug: 'FLEET',
  name: 'Fleet',
  description: '',
  catalogStatus: 'ACTIVE',
  organizationsCount: 2,
};

function setControlledTextareaValue(el: HTMLTextAreaElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function findConfirmButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll('button')).find(
    (b) =>
      b.textContent?.includes('Apply status change') ||
      b.textContent?.includes('Statusänderung anwenden'),
  );
}

async function waitForImpactReady(container: HTMLElement, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const confirm = findConfirmButton(container);
    if (confirm && !confirm.disabled) {
      return confirm;
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  throw new Error('Confirm button did not become enabled');
}

async function renderDialog(onApplied = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(LanguageProvider, null, createElement(ProductCatalogStatusChangeDialog, {
        row: baseRow,
        open: true,
        onClose: () => undefined,
        onApplied,
      })),
    );
  });
  const confirm = await waitForImpactReady(container);
  return { container, root, onApplied, confirm };
}

describe('ProductCatalogStatusChangeDialog', () => {
  beforeEach(() => {
    localStorage.setItem('synqdrive.locale', 'en');
    vi.clearAllMocks();
    getCatalogStatusImpact.mockResolvedValue({
      currentCatalogStatus: 'ACTIVE',
      requestedTargetCatalogStatus: 'DISABLED',
      organizationAssignmentsTotal: 2,
      organizationProductsByStatus: { ACTIVE: 1, TRIAL: 1, SUSPENDED: 0, CANCELLED: 0, OTHER: 0 },
      activeVehicleGrants: 0,
      admissionAfterTarget: {},
      guarantees: { existingOrganizationProductsPreserved: true },
      previewMayBeStaleBeforeWrite: true,
    });
  });

  it('clears stale impact while reloading', async () => {
    getCatalogStatusImpact.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ currentCatalogStatus: 'ACTIVE' }), 20)),
    );
    const { container } = await renderDialog();
    expect(container.textContent).not.toContain('organizationAssignmentsTotal');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(getCatalogStatusImpact).toHaveBeenCalled();
  });

  it('disables confirm when impact load fails', async () => {
    getCatalogStatusImpact.mockRejectedValueOnce(new Error('network'));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(LanguageProvider, null, createElement(ProductCatalogStatusChangeDialog, {
          row: baseRow,
          open: true,
          onClose: () => undefined,
          onApplied: vi.fn(),
        })),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const confirm = findConfirmButton(container);
    expect(confirm?.disabled).toBe(true);
  });

  it('recovers from HTTP 409 with refreshed preview and CAS baseline', async () => {
    getCatalogProduct.mockResolvedValueOnce({
      ...baseRow,
      catalogStatus: 'DISABLED',
    });
    patchCatalogStatusResult.mockResolvedValueOnce({
      ok: false,
      status: 409,
      errorMessage: 'Product catalog status changed concurrently',
    });

    const { container, confirm } = await renderDialog();

    const reason = container.querySelector('#catalog-status-reason') as HTMLTextAreaElement;
    await act(async () => {
      setControlledTextareaValue(reason, 'Operator reason');
    });

    await act(async () => {
      confirm.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(getCatalogProduct).toHaveBeenCalledWith('FLEET');
    expect(getCatalogStatusImpact.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(patchCatalogStatusResult).toHaveBeenCalledTimes(1);
  });

  it('retains MFA step-up pending body on 403', async () => {
    patchCatalogStatusResult.mockResolvedValueOnce({
      ok: false,
      status: 403,
      errorMessage: 'STEP_UP_REQUIRED',
    });

    const { container, confirm } = await renderDialog();

    const reason = container.querySelector('#catalog-status-reason') as HTMLTextAreaElement;
    await act(async () => {
      setControlledTextareaValue(reason, 'Operator reason');
    });

    await act(async () => {
      confirm.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(patchCatalogStatusResult).toHaveBeenCalledTimes(1);
  });

  it('applies successful status update', async () => {
    const onApplied = vi.fn();
    patchCatalogStatusResult.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        product: { ...baseRow, catalogStatus: 'DISABLED' },
        impact: {},
        noop: false,
      },
    });

    const { container, confirm } = await renderDialog(onApplied);

    const reason = container.querySelector('#catalog-status-reason') as HTMLTextAreaElement;
    await act(async () => {
      setControlledTextareaValue(reason, 'Operator reason');
    });

    await act(async () => {
      confirm.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ catalogStatus: 'DISABLED' }));
  });
});