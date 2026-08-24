// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  operatorVehicleQuickViewToolActionAiUploadSubtitle,
  operatorVehicleQuickViewToolActionAiUploadTitle,
  operatorVehicleQuickViewToolActionDamageCaptureSubtitle,
  operatorVehicleQuickViewToolActionDamageCaptureTitle,
  operatorVehicleQuickViewToolActionTaskCreateSubtitle,
  operatorVehicleQuickViewToolActionTaskCreateTitle,
  operatorVehicleQuickViewToolActionTireMeasureSubtitle,
  operatorVehicleQuickViewToolActionTireMeasureTitle,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorVehicleQuickViewToolActions } from './OperatorVehicleQuickViewToolActions';

const P230_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewToolActions.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

function isP230EnforceCleanPath(relPath: string): boolean {
  return P230_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p230ScopedFindings() {
  return inventory.findings.filter((finding) => isP230EnforceCleanPath(finding.file));
}

const TOOL_ACTION_TITLE_KEYS = [
  'operator.vehicleQuickView.toolActions.damageCapture.title',
  'operator.vehicleQuickView.toolActions.aiUpload.title',
  'operator.vehicleQuickView.toolActions.tireMeasure.title',
  'operator.vehicleQuickView.toolActions.taskCreate.title',
] as const;

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

function renderToolActions(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewToolActions>> = {},
) {
  const onDamageCapture = vi.fn();
  const onAiUpload = vi.fn();
  const onTireMeasure = vi.fn();
  const onTaskCreate = vi.fn();
  const view = renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewToolActions, {
      onDamageCapture,
      onAiUpload,
      onTireMeasure,
      onTaskCreate,
      ...props,
    }),
  );
  return { ...view, onDamageCapture, onAiUpload, onTireMeasure, onTaskCreate };
}

function LocaleSwitchHarness(
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewToolActions>>,
) {
  const { locale, setLocale } = useLanguage();
  const onDamageCapture = vi.fn();
  const onAiUpload = vi.fn();
  const onTireMeasure = vi.fn();
  const onTaskCreate = vi.fn();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorVehicleQuickViewToolActions, {
      onDamageCapture,
      onAiUpload,
      onTireMeasure,
      onTaskCreate,
      ...props,
    }),
  );
}

function actionTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button[type="button"]'))
    .filter((button) => button.textContent !== 'toggle-locale')
    .map((button) => button.querySelector('.text-sm.font-semibold')?.textContent?.trim() ?? '');
}

function actionSubtitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button[type="button"]'))
    .filter((button) => button.textContent !== 'toggle-locale')
    .map((button) => button.querySelector('.text-\\[11px\\]')?.textContent?.trim() ?? '');
}

function expectedTitles(locale: 'de' | 'en'): string[] {
  const dict = locale === 'de' ? de : en;
  return TOOL_ACTION_TITLE_KEYS.map((key) => dict[key]);
}

function expectedSubtitles(locale: 'de' | 'en'): string[] {
  const dict = locale === 'de' ? de : en;
  return [
    dict['operator.vehicleQuickView.toolActions.damageCapture.subtitle'],
    dict['operator.vehicleQuickView.toolActions.aiUpload.subtitle'],
    dict['operator.vehicleQuickView.toolActions.tireMeasure.subtitle'],
    dict['operator.vehicleQuickView.toolActions.taskCreate.subtitle'],
  ];
}

describe('operator Vehicle Quick View Tool Actions localization (P2.2.30)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P230 scoped findings', () => {
      expect(p230ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders all tool action labels in English with correct order', () => {
      const view = renderToolActions('en');
      cleanup = view.cleanup;
      expect(actionTitles(view.container)).toEqual(expectedTitles('en'));
      expect(actionSubtitles(view.container)).toEqual(expectedSubtitles('en'));
    });

    it('renders four actions with stable button semantics', () => {
      const view = renderToolActions('en');
      cleanup = view.cleanup;
      const buttons = Array.from(view.container.querySelectorAll('button[type="button"]')).filter(
        (button) => button.textContent !== 'toggle-locale',
      );
      expect(buttons).toHaveLength(4);
      expect(buttons.every((button) => button.getAttribute('type') === 'button')).toBe(true);
      expect(buttons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    });

    it('preserves highlight styling on damage capture action only', () => {
      const view = renderToolActions('en');
      cleanup = view.cleanup;
      const buttons = Array.from(view.container.querySelectorAll('button[type="button"]')).filter(
        (button) => button.textContent !== 'toggle-locale',
      );
      expect(buttons[0]?.className).toContain('brand-soft');
      expect(buttons[1]?.className).not.toContain('brand-soft');
    });
  });

  describe('DE presentation', () => {
    it('renders all tool action labels in German with correct order', () => {
      const view = renderToolActions('de');
      cleanup = view.cleanup;
      expect(actionTitles(view.container)).toEqual(expectedTitles('de'));
      expect(actionSubtitles(view.container)).toEqual(expectedSubtitles('de'));
    });
  });

  describe('same-mount locale switch', () => {
    it('updates labels without remounting action buttons', () => {
      const view = renderWithLocale('de', createElement(LocaleSwitchHarness, {}));
      cleanup = view.cleanup;
      const buttonsBefore = view.container.querySelectorAll('button[type="button"]');
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.toolActions.damageCapture.title']);

      const toggle = view.container.querySelector('button') as HTMLButtonElement;
      act(() => toggle.click());

      const buttonsAfter = view.container.querySelectorAll('button[type="button"]');
      expect(buttonsAfter.length).toBe(buttonsBefore.length);
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.toolActions.damageCapture.title']);
      expect(view.container.textContent).not.toContain('operator.vehicleQuickView.toolActions');
    });
  });

  describe('callback regression', () => {
    it('invokes all four callbacks with stable semantics in EN', () => {
      const view = renderToolActions('en');
      cleanup = view.cleanup;
      const buttons = Array.from(view.container.querySelectorAll('button[type="button"]')).filter(
        (button) => button.textContent !== 'toggle-locale',
      );

      act(() => (buttons[0] as HTMLButtonElement).click());
      act(() => (buttons[1] as HTMLButtonElement).click());
      act(() => (buttons[2] as HTMLButtonElement).click());
      act(() => (buttons[3] as HTMLButtonElement).click());

      expect(view.onDamageCapture).toHaveBeenCalledTimes(1);
      expect(view.onAiUpload).toHaveBeenCalledTimes(1);
      expect(view.onTireMeasure).toHaveBeenCalledTimes(1);
      expect(view.onTaskCreate).toHaveBeenCalledTimes(1);
    });

    it('invokes all four callbacks with stable semantics in DE', () => {
      const view = renderToolActions('de');
      cleanup = view.cleanup;
      const buttons = Array.from(view.container.querySelectorAll('button[type="button"]')).filter(
        (button) => button.textContent !== 'toggle-locale',
      );

      act(() => (buttons[0] as HTMLButtonElement).click());
      act(() => (buttons[1] as HTMLButtonElement).click());
      act(() => (buttons[2] as HTMLButtonElement).click());
      act(() => (buttons[3] as HTMLButtonElement).click());

      expect(view.onDamageCapture).toHaveBeenCalledTimes(1);
      expect(view.onAiUpload).toHaveBeenCalledTimes(1);
      expect(view.onTireMeasure).toHaveBeenCalledTimes(1);
      expect(view.onTaskCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('adapter presentation maps', () => {
    it('maps tool action identities to canonical keys without raw key leakage', () => {
      expect(operatorVehicleQuickViewToolActionDamageCaptureTitle('en')).toBe(
        en['operator.vehicleQuickView.toolActions.damageCapture.title'],
      );
      expect(operatorVehicleQuickViewToolActionDamageCaptureSubtitle('de')).toBe(
        de['operator.vehicleQuickView.toolActions.damageCapture.subtitle'],
      );
      expect(operatorVehicleQuickViewToolActionAiUploadTitle('en')).toBe(
        en['operator.vehicleQuickView.toolActions.aiUpload.title'],
      );
      expect(operatorVehicleQuickViewToolActionAiUploadSubtitle('de')).toBe(
        de['operator.vehicleQuickView.toolActions.aiUpload.subtitle'],
      );
      expect(operatorVehicleQuickViewToolActionTireMeasureTitle('en')).toBe(
        en['operator.vehicleQuickView.toolActions.tireMeasure.title'],
      );
      expect(operatorVehicleQuickViewToolActionTireMeasureSubtitle('de')).toBe(
        de['operator.vehicleQuickView.toolActions.tireMeasure.subtitle'],
      );
      expect(operatorVehicleQuickViewToolActionTaskCreateTitle('en')).toBe(
        en['operator.vehicleQuickView.toolActions.taskCreate.title'],
      );
      expect(operatorVehicleQuickViewToolActionTaskCreateSubtitle('de')).toBe(
        de['operator.vehicleQuickView.toolActions.taskCreate.subtitle'],
      );
    });
  });
});
