// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehicleImportWizard } from './ConnectedVehicleImportWizard';

const importPreflightMock = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      operationalList: vi.fn().mockResolvedValue({
        data: [
          {
            dimoVehicleId: 'dimo-1',
            displayTitle: 'Test EV',
            vin: 'VIN123',
          },
        ],
      }),
      importPreflight: (...args: unknown[]) => importPreflightMock(...args),
      registerFromDimo: vi.fn(),
    },
  },
}));

describe('ConnectedVehicleImportWizard preflight gating', () => {
  beforeEach(() => {
    importPreflightMock.mockReset();
  });

  async function renderWizard(onAdvancedRegister = vi.fn()) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(ConnectedVehicleImportWizard, {
            organizations: [{ id: 'org-1', company_name: 'Org', status: 'Active' } as any],
            onImported: vi.fn(),
            onOpenVehicle: vi.fn(),
            onAdvancedRegister,
          }),
        }),
      );
    });
    return { container, root };
  }

  it('disables advanced register when preflight blocks', async () => {
    importPreflightMock.mockResolvedValue({
      canProceed: false,
      conflict: { message: 'Already registered' },
      effects: [],
    });

    const onAdvanced = vi.fn();
    const { root, container } = await renderWizard(onAdvanced);

    const orgSelect = container.querySelector('select[aria-label="Zielorganisation wählen"]') as HTMLSelectElement;
    const dimoSelect = container.querySelector('select[aria-label="DIMO-Fahrzeug wählen"]') as HTMLSelectElement;

    await act(async () => {
      orgSelect.value = 'org-1';
      orgSelect.dispatchEvent(new Event('change', { bubbles: true }));
      dimoSelect.value = 'dimo-1';
      dimoSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const advancedBtn = document.body.querySelector('[data-testid="cv-import-advanced-register"]') as HTMLButtonElement;
    expect(advancedBtn).toBeTruthy();
    expect(advancedBtn.disabled).toBe(true);

    root.unmount();
    container.remove();
  });

  it('enables advanced register when preflight permits', async () => {
    importPreflightMock.mockResolvedValue({
      canProceed: true,
      conflict: null,
      effects: ['Billing hook'],
    });

    const onAdvanced = vi.fn();
    await renderWizard(onAdvanced);

    const orgSelect = document.querySelector('select[aria-label="Zielorganisation wählen"]') as HTMLSelectElement;
    const dimoSelect = document.querySelector('select[aria-label="DIMO-Fahrzeug wählen"]') as HTMLSelectElement;

    await act(async () => {
      orgSelect.value = 'org-1';
      orgSelect.dispatchEvent(new Event('change', { bubbles: true }));
      dimoSelect.value = 'dimo-1';
      dimoSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const advancedBtn = document.body.querySelector('[data-testid="cv-import-advanced-register"]') as HTMLButtonElement;
    expect(advancedBtn?.disabled).toBe(false);

    document.body.innerHTML = '';
  });

  it('disables advanced register when preflight API fails', async () => {
    importPreflightMock.mockRejectedValue(new Error('network'));

    await renderWizard(vi.fn());

    const orgSelect = document.querySelector('select[aria-label="Zielorganisation wählen"]') as HTMLSelectElement;
    const dimoSelect = document.querySelector('select[aria-label="DIMO-Fahrzeug wählen"]') as HTMLSelectElement;

    await act(async () => {
      orgSelect.value = 'org-1';
      orgSelect.dispatchEvent(new Event('change', { bubbles: true }));
      dimoSelect.value = 'dimo-1';
      dimoSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const advancedBtn = document.body.querySelector('[data-testid="cv-import-advanced-register"]');
    expect(advancedBtn).toBeNull();

    document.body.innerHTML = '';
  });
});
