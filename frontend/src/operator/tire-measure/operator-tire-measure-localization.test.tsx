// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockAddTireHealthMeasurement,
  mockAddTireMeasurement,
  mockCloseSheet,
  mockOpenSheet,
  mockTriggerRefresh,
  mockReloadHealth,
} = vi.hoisted(() => ({
  mockAddTireHealthMeasurement: vi.fn(async () => ({})),
  mockAddTireMeasurement: vi.fn(async () => ({})),
  mockCloseSheet: vi.fn(),
  mockOpenSheet: vi.fn(),
  mockTriggerRefresh: vi.fn(),
  mockReloadHealth: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    vehicleIntelligence: {
      tires: vi.fn(async () => [
        {
          id: 'setup-1',
          status: 'ACTIVE',
          tireSeason: 'SUMMER',
          brandModelFront: 'Michelin Pilot',
          name: 'Summer set',
        },
      ]),
      tireHealthSummary: vi.fn(async () => null),
      addTireHealthMeasurement: mockAddTireHealthMeasurement,
      addTireMeasurement: mockAddTireMeasurement,
    },
  },
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    closeSheet: mockCloseSheet,
    openSheet: mockOpenSheet,
    triggerRefresh: mockTriggerRefresh,
  }),
}));

vi.mock('../hooks/useOperatorTabletLayout', () => ({
  useOperatorTabletLayout: () => false,
}));

vi.mock('../../rental/FleetContext', () => ({
  useFleetVehicles: () => ({
    fleetVehicles: [
      {
        id: 'veh-42',
        model: 'Tesla Model 3',
        license: 'M-AB 1234',
        odometerKm: 52000,
      },
    ],
    reloadHealth: mockReloadHealth,
  }),
}));

vi.mock('../../rental/RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  OPERATOR_TIRE_MEASURE_WHEELS,
  OPERATOR_TIRE_POSITION_KEYS,
  operatorTireMeasureHandoverNotePrefix,
  operatorTireMeasurePlausibilityMessage,
  operatorTireMeasurePositionLong,
  operatorTireMeasurePositionShort,
  operatorTireMeasureStepLabel,
  operatorTireMeasureValidationMessage,
} from '../lib/operator-tire-measure-i18n';
import { OperatorTireMeasureFlow } from './OperatorTireMeasureFlow';
import { OperatorTireMeasureTreadGrid } from './OperatorTireMeasureTreadGrid';
import { OPERATOR_TIRE_MEASURE_STEPS } from './operatorTireMeasure.types';
import { submitOperatorTireMeasurement } from './operatorTireMeasurePayload';
import {
  deriveTirePlausibilityWarnings,
  LEGAL_MIN_MM,
  parseTreadMm,
} from './operatorTireMeasure.utils';

const P226_ENFORCE_CLEAN_EXACT = [
  'operator/tire-measure/OperatorTireMeasureFlow.tsx',
  'operator/tire-measure/OperatorTireMeasureTreadGrid.tsx',
  'operator/tire-measure/operatorTireMeasure.utils.ts',
  'operator/tire-measure/operatorTireMeasurePayload.ts',
  'operator/tire-measure/useOperatorTireMeasureData.ts',
  'operator/lib/operator-tire-measure-i18n.ts',
];

const baseAction = {
  type: 'tire-measure' as const,
  vehicleId: 'veh-42',
  vehicleLabel: 'Tesla Model 3 · M-AB 1234',
  bookingId: 'bk-2026-0042',
};

function isP226EnforceCleanPath(relPath: string): boolean {
  return P226_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p226ScopedFindings() {
  return inventory.findings.filter((finding) => isP226EnforceCleanPath(finding.file));
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

function renderFlow(locale: 'de' | 'en') {
  return renderWithLocale(locale, createElement(OperatorTireMeasureFlow, { action: baseAction }));
}

function findContinueButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (btn) =>
      btn.textContent?.includes(en['operator.tireMeasure.actions.continue']) ||
      btn.textContent?.includes(de['operator.tireMeasure.actions.continue']),
  ) as HTMLButtonElement | undefined;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const inputSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  inputSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const textareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  textareaSetter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

async function advanceToStep(container: HTMLElement, targetStep: (typeof OPERATOR_TIRE_MEASURE_STEPS)[number]) {
  const targetIdx = OPERATOR_TIRE_MEASURE_STEPS.indexOf(targetStep);
  for (let i = 0; i < targetIdx; i += 1) {
    const currentStep = OPERATOR_TIRE_MEASURE_STEPS[i];
    if (currentStep === 'tread') {
      const treadInputs = container.querySelectorAll('input');
      if (treadInputs.length > 0) {
        await act(async () => {
          setInputValue(treadInputs[0] as HTMLInputElement, '5.0');
        });
      }
    }
    const continueBtn = findContinueButton(container);
    await act(async () => {
      continueBtn?.click();
    });
  }
}

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

function renderFlowWithLocaleSwitch(initialLocale: 'de' | 'en', action = baseAction) {
  const switchTarget = initialLocale === 'en' ? 'de' : 'en';
  return renderWithLocale(
    initialLocale,
    createElement(
      'div',
      null,
      createElement(LocaleSwitchButton, { target: switchTarget }),
      createElement(OperatorTireMeasureFlow, { action }),
    ),
  );
}

function findNoteTextarea(container: HTMLElement): HTMLTextAreaElement {
  const textarea = container.querySelector('textarea');
  if (!textarea) throw new Error('note textarea not found');
  return textarea;
}

function findMeasuredAtInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="datetime-local"]');
  if (!input) throw new Error('measuredAt input not found');
  return input as HTMLInputElement;
}

function findOdometerInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[inputmode="decimal"]');
  if (!input) throw new Error('odometer input not found');
  return input as HTMLInputElement;
}

function findWorkshopSourceButton(container: HTMLElement): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (btn) =>
      btn.textContent?.includes(en['operator.tireMeasure.sources.workshop']) ||
      btn.textContent?.includes(de['operator.tireMeasure.sources.workshop']),
  );
  if (!button) throw new Error('workshop source button not found');
  return button as HTMLButtonElement;
}

function findWorkshopNameInput(container: HTMLElement): HTMLInputElement {
  const inputs = Array.from(container.querySelectorAll('input[type="text"]')).filter(
    (el) => el.getAttribute('inputmode') !== 'decimal',
  );
  const input = inputs[0];
  if (!input) throw new Error('workshop name input not found');
  return input as HTMLInputElement;
}

async function populateContextStep(container: HTMLElement) {
  await act(async () => {
    setInputValue(findMeasuredAtInput(container), '2026-08-23T10:00');
    setInputValue(findOdometerInput(container), '52100');
    findWorkshopSourceButton(container).click();
  });
  await act(async () => {
    setInputValue(findWorkshopNameInput(container), 'Werkstatt Nord');
    setTextareaValue(findNoteTextarea(container), 'Operator note 42 — manually edited');
  });
}

async function populateTreadStep(container: HTMLElement) {
  const treadInputs = container.querySelectorAll('input');
  await act(async () => {
    setInputValue(treadInputs[0] as HTMLInputElement, '5.1');
    setInputValue(treadInputs[1] as HTMLInputElement, '4.9');
    setInputValue(treadInputs[2] as HTMLInputElement, '3,8');
    setInputValue(treadInputs[3] as HTMLInputElement, '3.7');
  });
}

describe('operator Tire Measure localization (P2.2.26)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P226 scoped findings', () => {
      expect(p226ScopedFindings()).toHaveLength(0);
    });
  });

  describe('presentation adapter', () => {
    it('localizes step titles per locale', () => {
      expect(operatorTireMeasureStepLabel('en', 'vehicle')).toBe(en['operator.tireMeasure.steps.vehicle']);
      expect(operatorTireMeasureStepLabel('de', 'tread')).toBe(de['operator.tireMeasure.steps.tread']);
    });

    it('localizes tire position labels without exposing machine IDs', () => {
      expect(operatorTireMeasurePositionShort('en', 'fl')).toBe('FL');
      expect(operatorTireMeasurePositionLong('de', 'fl')).toBe('Vorne links');
      expect(operatorTireMeasurePositionLong('en', 'fl')).not.toContain('fl');
    });

    it('localizes validation messages per locale', () => {
      const enMsg = operatorTireMeasureValidationMessage('en', 'TREAD_REQUIRED');
      const deMsg = operatorTireMeasureValidationMessage('de', 'TREAD_REQUIRED');
      expect(enMsg).not.toBe(deMsg);
      expect(enMsg).toContain('tread');
      expect(deMsg).toContain('Profil');
    });

    it('preserves canonical wheel order', () => {
      expect(OPERATOR_TIRE_POSITION_KEYS).toEqual(['fl', 'fr', 'rl', 'rr']);
      expect(OPERATOR_TIRE_MEASURE_WHEELS.map((w) => w.position)).toEqual(['fl', 'fr', 'rl', 'rr']);
      expect(OPERATOR_TIRE_MEASURE_STEPS).toEqual(['vehicle', 'set', 'tread', 'context', 'review']);
    });
  });

  describe('EN presentation', () => {
    it('renders localized vehicle step chrome', async () => {
      const view = renderFlow('en');
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      const text = view.container.textContent ?? '';
      expect(text).toContain(en['operator.tireMeasure.eyebrow']);
      expect(text).toContain(en['operator.tireMeasure.steps.vehicle']);
      expect(text).toContain('M-AB 1234');
      expect(text).not.toContain('Reifenprofil messen');
    });
  });

  describe('DE presentation', () => {
    it('renders localized vehicle step chrome', async () => {
      const view = renderFlow('de');
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      const text = view.container.textContent ?? '';
      expect(text).toContain(de['operator.tireMeasure.eyebrow']);
      expect(text).toContain(de['operator.tireMeasure.steps.vehicle']);
      expect(text).toContain('M-AB 1234');
      expect(text).not.toContain('Measure tire tread');
    });
  });

  describe('tread grid orientation', () => {
    it('binds FL/FR/RL/RR inputs to stable machine keys', async () => {
      const tread = { fl: '4.1', fr: '4.2', rl: '3,5', rr: '' };
      const onChange = vi.fn();
      const view = renderWithLocale(
        'en',
        createElement(OperatorTireMeasureTreadGrid, {
          tread,
          onChange,
          warnings: [],
        }),
      );
      cleanup = view.cleanup;
      const inputs = view.container.querySelectorAll('input');
      expect(inputs).toHaveLength(4);
      expect((inputs[0] as HTMLInputElement).value).toBe('4.1');
      expect((inputs[2] as HTMLInputElement).value).toBe('3,5');
      expect(inputs[0]?.getAttribute('aria-label')).toContain('Front left');
      expect(inputs[3]?.getAttribute('aria-label')).toContain('Rear right');
    });
  });

  describe('numeric and threshold regression', () => {
    it('parses comma decimals identically under EN/DE presentation', () => {
      expect(parseTreadMm('4,5')).toBe(4.5);
      expect(parseTreadMm('4.5')).toBe(4.5);
    });

    it('derives legal-min warning with unchanged threshold semantics', () => {
      const warnings = deriveTirePlausibilityWarnings({ fl: '1.5', fr: '', rl: '', rr: '' });
      const legal = warnings.find((w) => w.id === 'fl-legal');
      expect(legal?.code).toBe('LEGAL_MIN');
      expect(legal?.params.mm).toBe(1.5);
      expect(LEGAL_MIN_MM).toBe(1.6);
      expect(operatorTireMeasurePlausibilityMessage('en', legal!)).toContain('FL');
      expect(operatorTireMeasurePlausibilityMessage('de', legal!)).toContain('VL');
    });
  });

  describe('runtime locale switch', () => {
    it('updates tread labels and preserves values on same mount EN → DE', async () => {
      function StatefulTreadGrid() {
        const [tread, setTread] = useState({ fl: '5.2', fr: '4,1', rl: '', rr: '' });
        return createElement(OperatorTireMeasureTreadGrid, {
          tread,
          onChange: setTread,
          warnings: [],
        });
      }

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
          createElement(StatefulTreadGrid),
        ),
      );
      cleanup = view.cleanup;

      expect(view.container.textContent).toContain('Front left');
      const switchBtn = document.querySelector('[data-testid="switch-locale-de"]') as HTMLButtonElement;
      await act(async () => {
        switchBtn.click();
      });
      expect(view.container.textContent).toContain('Vorne links');
      const inputs = view.container.querySelectorAll('input');
      expect((inputs[0] as HTMLInputElement).value).toBe('5.2');
      expect((inputs[1] as HTMLInputElement).value).toBe('4,1');
    });

    it.each([
      ['en', 'de'] as const,
      ['de', 'en'] as const,
    ])('preserves full-flow context state on same-mount %s → %s', async (from, to) => {
      const view = renderFlowWithLocaleSwitch(from);
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });

      await advanceToStep(view.container, 'tread');
      await populateTreadStep(view.container);
      await act(async () => {
        findContinueButton(view.container)?.click();
      });
      await populateContextStep(view.container);

      const before = {
        measuredAt: findMeasuredAtInput(view.container).value,
        odometerKm: findOdometerInput(view.container).value,
        workshopName: findWorkshopNameInput(view.container).value,
        note: findNoteTextarea(view.container).value,
      };

      expect(before.note).toBe('Operator note 42 — manually edited');
      expect(view.container.textContent).toContain(
        from === 'en' ? en['operator.tireMeasure.steps.context'] : de['operator.tireMeasure.steps.context'],
      );

      const switchBtn = document.querySelector(
        `[data-testid="switch-locale-${to}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        switchBtn.click();
      });

      expect(view.container.textContent).toContain(
        to === 'en' ? en['operator.tireMeasure.steps.context'] : de['operator.tireMeasure.steps.context'],
      );
      expect(findMeasuredAtInput(view.container).value).toBe(before.measuredAt);
      expect(findOdometerInput(view.container).value).toBe(before.odometerKm);
      expect(findWorkshopNameInput(view.container).value).toBe(before.workshopName);
      expect(findNoteTextarea(view.container).value).toBe(before.note);
      expect(findWorkshopNameInput(view.container)).toBeTruthy();

      const backBtn = Array.from(view.container.querySelectorAll('button')).find(
        (btn) =>
          btn.textContent?.includes(en['operator.tireMeasure.actions.back']) ||
          btn.textContent?.includes(de['operator.tireMeasure.actions.back']),
      );
      await act(async () => {
        backBtn?.click();
      });
      const treadInputs = view.container.querySelectorAll('input');
      expect((treadInputs[0] as HTMLInputElement).value).toBe('5.1');
      expect((treadInputs[1] as HTMLInputElement).value).toBe('4.9');
      expect((treadInputs[2] as HTMLInputElement).value).toBe('3,8');
      expect((treadInputs[3] as HTMLInputElement).value).toBe('3.7');
    });

    it('preserves tread values when switching locale on tread step', async () => {
      const view = renderFlowWithLocaleSwitch('en');
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });

      await advanceToStep(view.container, 'tread');
      const treadInputs = view.container.querySelectorAll('input');
      await populateTreadStep(view.container);

      const before = Array.from(treadInputs).map((el) => (el as HTMLInputElement).value);
      const switchBtn = document.querySelector('[data-testid="switch-locale-de"]') as HTMLButtonElement;
      await act(async () => {
        switchBtn.click();
      });

      const afterInputs = view.container.querySelectorAll('input');
      expect(Array.from(afterInputs).map((el) => (el as HTMLInputElement).value)).toEqual(before);
      expect(view.container.textContent).toContain('Vorne links');
    });
  });

  describe('initial handover note seed', () => {
    it('seeds EN handover note prefix on initial EN mount', async () => {
      const view = renderFlow('en');
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      await advanceToStep(view.container, 'context');
      const expected = operatorTireMeasureHandoverNotePrefix('en', baseAction.bookingId);
      expect(findNoteTextarea(view.container).value).toBe(expected);
      expect(expected).toContain('Handover booking');
    });

    it('seeds DE handover note prefix on initial DE mount', async () => {
      const view = renderFlow('de');
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      await advanceToStep(view.container, 'context');
      const expected = operatorTireMeasureHandoverNotePrefix('de', baseAction.bookingId);
      expect(findNoteTextarea(view.container).value).toBe(expected);
      expect(expected).toContain('Handover Buchung');
    });
  });

  describe('action identity reinitialization', () => {
    it('reinitializes note when bookingId changes', async () => {
      function StatefulFlowHost() {
        const [bookingId, setBookingId] = useState('bk-2026-0042');
        return createElement(
          'div',
          null,
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'change-booking',
              onClick: () => setBookingId('bk-3099-0042'),
            },
            'change booking',
          ),
          createElement(OperatorTireMeasureFlow, {
            action: { ...baseAction, bookingId },
          }),
        );
      }

      const view = renderWithLocale('en', createElement(StatefulFlowHost));
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });
      await advanceToStep(view.container, 'context');
      const firstNote = findNoteTextarea(view.container).value;

      await act(async () => {
        (document.querySelector('[data-testid="change-booking"]') as HTMLButtonElement).click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      await advanceToStep(view.container, 'context');

      expect(findNoteTextarea(view.container).value).not.toBe(firstNote);
      expect(findNoteTextarea(view.container).value).toContain('bk-3099-');
    });
  });

  describe('payload regression', () => {
    it('maps UI positions to unchanged API payload fields', async () => {
      await submitOperatorTireMeasurement({
        vehicleId: 'veh-42',
        tireSetupId: null,
        tread: { fl: '4.2', fr: '3.8', rl: '4,5', rr: '' },
        context: {
          measuredAt: '',
          odometerKm: '52000',
          source: 'manual',
          workshopName: '',
          note: 'Operator note 42 — preserved',
        },
      });

      expect(mockAddTireHealthMeasurement).toHaveBeenCalledWith(
        'veh-42',
        expect.objectContaining({
          frontLeftMm: 4.2,
          frontRightMm: 3.8,
          rearLeftMm: 4.5,
          rearRightMm: undefined,
          source: 'manual',
          odometerKm: 52000,
        }),
      );
    });

    it('submits stable payload via flow save action', async () => {
      const view = renderFlow('en');
      cleanup = view.cleanup;
      await act(async () => {
        await Promise.resolve();
      });

      await advanceToStep(view.container, 'tread');
      const treadInputs = view.container.querySelectorAll('input');
      await act(async () => {
        setInputValue(treadInputs[0] as HTMLInputElement, '5.0');
      });

      await advanceToStep(view.container, 'review');
      const saveBtn = Array.from(view.container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes(en['operator.tireMeasure.actions.save']),
      );
      await act(async () => {
        saveBtn?.click();
      });

      expect(mockAddTireMeasurement).toHaveBeenCalledWith(
        'veh-42',
        'setup-1',
        expect.objectContaining({
          frontLeftMm: 5,
          source: 'manual',
        }),
      );
    });
  });
});
