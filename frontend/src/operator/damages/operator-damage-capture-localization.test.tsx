// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const { mockCreateDamage, mockOpenSheet, mockTriggerRefresh } = vi.hoisted(() => ({
  mockCreateDamage: vi.fn(async () => ({
    id: 'dmg-created-1',
    damageType: 'SCRATCH',
    severity: 'MODERATE',
  })),
  mockOpenSheet: vi.fn(),
  mockTriggerRefresh: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    vehicleIntelligence: {
      createVehicleDamage: mockCreateDamage,
    },
  },
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    openSheet: mockOpenSheet,
    triggerRefresh: mockTriggerRefresh,
  }),
}));

vi.mock('../hooks/useOperatorTabletLayout', () => ({
  useOperatorTabletLayout: () => false,
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { OperatorDamageCaptureFlow } from './OperatorDamageCaptureFlow';
import { OperatorDamageDetailsStep } from './OperatorDamageDetailsStep';
import { OperatorDamagePhotoStep } from './OperatorDamagePhotoStep';
import { OperatorDamageReviewStep } from './OperatorDamageReviewStep';
import {
  buildOperatorDamagePayload,
  DEFAULT_OPERATOR_DAMAGE_FORM,
} from './operatorDamagePayload';
import {
  operatorDamageCaptureDamageTypeLabel,
  operatorDamageCaptureValidationMessage,
} from '../lib/operator-damage-capture-i18n';

const P224_ENFORCE_CLEAN_EXACT = [
  'operator/damages/OperatorDamageCaptureFlow.tsx',
  'operator/damages/OperatorDamagePhotoStep.tsx',
  'operator/damages/OperatorDamageDetailsStep.tsx',
  'operator/damages/OperatorDamageReviewStep.tsx',
  'operator/damages/operatorDamagePayload.ts',
  'operator/lib/operator-damage-capture-i18n.ts',
];

const baseContext = {
  vehicleId: 'veh-42',
  vehicleName: 'Tesla Model 3',
  plate: 'M-AB 1234',
  bookingId: 'bk-9',
  customerId: 'cust-3',
  customerName: 'Jane Doe',
  bookingLabel: 'BK-2026-0042',
  reportedBy: 'operator-1',
};

function isP224EnforceCleanPath(relPath: string): boolean {
  return P224_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p224ScopedFindings() {
  return inventory.findings.filter((finding) => isP224EnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function renderFlow(
  locale: 'de' | 'en',
  options: { skipVehicleConfirm?: boolean; isOpen?: boolean } = {},
) {
  const { skipVehicleConfirm = false, isOpen = true } = options;
  return renderWithLocale(
    locale,
    createElement(OperatorDamageCaptureFlow, {
      isOpen,
      onClose: vi.fn(),
      context: { ...baseContext, skipVehicleConfirm },
      onSaved: vi.fn(),
    }),
  );
}

describe('operator Damage Capture localization (P2.2.24)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P224 scoped findings', () => {
      expect(p224ScopedFindings()).toHaveLength(0);
    });
  });

  describe('presentation adapter', () => {
    it('localizes validation messages per locale', () => {
      const deMsg = operatorDamageCaptureValidationMessage('de', 'PHOTOS_REQUIRED');
      const enMsg = operatorDamageCaptureValidationMessage('en', 'PHOTOS_REQUIRED');
      expect(deMsg).not.toBe(enMsg);
      expect(deMsg).toContain('Foto');
      expect(enMsg).toContain('photo');
    });

    it('localizes damage type labels without changing machine values in payload', () => {
      const deLabel = operatorDamageCaptureDamageTypeLabel('de', 'SCRATCH');
      const enLabel = operatorDamageCaptureDamageTypeLabel('en', 'SCRATCH');
      expect(deLabel).not.toBe(enLabel);
      const payload = buildOperatorDamagePayload(DEFAULT_OPERATOR_DAMAGE_FORM, {
        source: 'INSPECTION',
        images: [],
      });
      expect(payload.damageType).toBe('SCRATCH');
    });
  });

  describe('step 1 vehicle', () => {
    it('renders EN vehicle confirmation step', () => {
      const view = renderFlow('en', { skipVehicleConfirm: false });
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain(en['operator.damageCapture.steps.vehicle']);
      expect(text).toContain(en['operator.damageCapture.vehicle.confirmHint']);
      expect(text).toContain('Tesla Model 3');
      expect(text).not.toContain('Schaden erfassen');
    });

    it('renders DE vehicle confirmation step', () => {
      const view = renderFlow('de', { skipVehicleConfirm: false });
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain(de['operator.damageCapture.steps.vehicle']);
      expect(text).toContain(de['operator.damageCapture.vehicle.confirmHint']);
      expect(text).toContain('Tesla Model 3');
      expect(text).not.toContain('Record damage');
    });
  });

  describe('step 2 photos', () => {
    it('renders EN photos step', () => {
      const view = renderWithLocale(
        'en',
        createElement(OperatorDamagePhotoStep, {
          photos: [],
          onPhotosChange: vi.fn(),
        }),
      );
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(en['operator.damageCapture.photos.camera']);
      expect(view.container.textContent).toContain(en['operator.damageCapture.photos.gallery']);
    });

    it('renders DE photos step', () => {
      const view = renderWithLocale(
        'de',
        createElement(OperatorDamagePhotoStep, {
          photos: [],
          onPhotosChange: vi.fn(),
        }),
      );
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(de['operator.damageCapture.photos.camera']);
      expect(view.container.textContent).toContain(de['operator.damageCapture.photos.gallery']);
    });
  });

  describe('step 3 details', () => {
    it('renders EN classification step', () => {
      const view = renderWithLocale(
        'en',
        createElement(OperatorDamageDetailsStep, {
          form: DEFAULT_OPERATOR_DAMAGE_FORM,
          onChange: vi.fn(),
        }),
      );
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain(en['operator.damageCapture.details.damageType']);
      expect(text).toContain(en['operator.damageCapture.damageType.SCRATCH']);
      expect(text).toContain(en['operator.damageCapture.severity.MODERATE']);
    });

    it('renders DE classification step', () => {
      const view = renderWithLocale(
        'de',
        createElement(OperatorDamageDetailsStep, {
          form: DEFAULT_OPERATOR_DAMAGE_FORM,
          onChange: vi.fn(),
        }),
      );
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain(de['operator.damageCapture.details.damageType']);
      expect(text).toContain(de['operator.damageCapture.damageType.SCRATCH']);
      expect(text).toContain(de['operator.damageCapture.severity.MODERATE']);
    });
  });

  describe('step 4 review', () => {
    it('renders EN review step with preserved dynamic data', () => {
      const view = renderWithLocale(
        'en',
        createElement(OperatorDamageReviewStep, {
          vehicleLabel: 'Tesla Model 3',
          plate: 'M-AB 1234',
          bookingLabel: 'BK-2026-0042',
          customerName: 'Jane Doe',
          source: 'INSPECTION',
          form: { ...DEFAULT_OPERATOR_DAMAGE_FORM, description: 'Door scratch' },
          photos: [],
        }),
      );
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain(en['operator.damageCapture.field.source']);
      expect(text).toContain('Tesla Model 3');
      expect(text).toContain('Door scratch');
      expect(text).toContain(en['operator.damageCapture.source.INSPECTION']);
    });

    it('renders DE review step with preserved dynamic data', () => {
      const view = renderWithLocale(
        'de',
        createElement(OperatorDamageReviewStep, {
          vehicleLabel: 'Tesla Model 3',
          plate: 'M-AB 1234',
          bookingLabel: 'BK-2026-0042',
          customerName: 'Jane Doe',
          source: 'INSPECTION',
          form: { ...DEFAULT_OPERATOR_DAMAGE_FORM, description: 'Türkratzer' },
          photos: [],
        }),
      );
      cleanup = view.cleanup;
      const text = view.container.textContent ?? '';
      expect(text).toContain(de['operator.damageCapture.field.source']);
      expect(text).toContain('Türkratzer');
      expect(text).toContain(de['operator.damageCapture.source.INSPECTION']);
    });
  });

  describe('runtime locale switch', () => {
    it('updates flow chrome on same mount EN → DE', async () => {
      function LocaleSwitchButton({ target }: { target: 'de' | 'en' }) {
        const { setLocale } = useLanguage();
        return createElement(
          'button',
          {
            type: 'button',
            'data-testid': `switch-locale-${target}`,
            onClick: () => setLocale(target),
          },
          target.toUpperCase(),
        );
      }

      const view = renderWithLocale(
        'en',
        createElement(
          'div',
          null,
          createElement(LocaleSwitchButton, { target: 'de' }),
          createElement(OperatorDamageCaptureFlow, {
            isOpen: true,
            onClose: vi.fn(),
            context: baseContext,
            onSaved: vi.fn(),
          }),
        ),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['operator.damageCapture.title']);

      const switchBtn = document.querySelector('[data-testid="switch-locale-de"]') as HTMLButtonElement;
      await act(async () => {
        switchBtn.click();
      });

      expect(view.container.textContent).toContain(de['operator.damageCapture.title']);
      expect(view.container.textContent).toContain('Tesla Model 3');
      expect(view.container.textContent).not.toContain(en['operator.damageCapture.title']);
    });
  });

  describe('payload semantics', () => {
    it('preserves payload field values under localized UI', () => {
      const payload = buildOperatorDamagePayload(
        {
          ...DEFAULT_OPERATOR_DAMAGE_FORM,
          damageType: 'TIRE_DAMAGE',
          severity: 'MAJOR',
          rentalImpact: 'BLOCK_RENTAL',
          description: 'Sidewall cut',
          locationView: 'UNKNOWN',
          locationLabel: 'Reifen/Felge',
          locationChipId: 'tire',
        },
        {
          source: 'PICKUP_HANDOVER',
          bookingId: 'bk-9',
          customerId: 'cust-3',
          reportedBy: 'operator-1',
          images: [{ imageData: 'data:image/jpeg;base64,abc' }],
        },
      );
      expect(payload.damageType).toBe('TIRE_DAMAGE');
      expect(payload.severity).toBe('MAJOR');
      expect(payload.rentalImpact).toBe('BLOCK_RENTAL');
      expect(payload.source).toBe('PICKUP_HANDOVER');
      expect(payload.bookingId).toBe('bk-9');
      expect(payload.locationLabel).toBe('Reifen/Felge');
      expect(payload.description).toBe('Sidewall cut');
      expect(payload.images).toHaveLength(1);
    });
  });
});
