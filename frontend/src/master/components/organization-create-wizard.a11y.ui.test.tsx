// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, translateKey } from '../../i18n/LanguageContext';
import { DEFAULT_PRODUCT_LOCALE } from '../../i18n/locales';
import { ORG_CREATE_WIZARD_FIELD_IDS, OrganizationCreateWizard } from './OrganizationCreateWizard';

function renderWizard() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Harness() {
    const [open, setOpen] = useState(true);
    return createElement(OrganizationCreateWizard, {
      open,
      onOpenChange: setOpen,
      onSubmit: vi.fn(async () => undefined),
    });
  }

  act(() => {
    root.render(createElement(LanguageProvider, null, createElement(Harness)));
  });
  return { container, root };
}

describe('OrganizationCreateWizard a11y (UX-011 closeout)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('associates step-1 labels with controls', () => {
    renderWizard();
    const root = document.body;
    const pairs: Array<[string, string]> = [
      ['Firmenname *', ORG_CREATE_WIZARD_FIELD_IDS.companyName],
      ['Kürzel', ORG_CREATE_WIZARD_FIELD_IDS.shortCode],
      ['Branche', ORG_CREATE_WIZARD_FIELD_IDS.businessType],
      ['Stadt', ORG_CREATE_WIZARD_FIELD_IDS.city],
      ['Land', ORG_CREATE_WIZARD_FIELD_IDS.country],
      ['Kontakt-E-Mail', ORG_CREATE_WIZARD_FIELD_IDS.email],
    ];
    for (const [labelText, id] of pairs) {
      const label = Array.from(root.querySelectorAll('label')).find((el) => el.textContent?.trim() === labelText);
      expect(label, labelText).toBeTruthy();
      expect(label?.getAttribute('for')).toBe(id);
      expect(root.querySelector(`#${id}`)).toBeTruthy();
    }
  });

  it('uses localized back control aria-label on step 2', () => {
    renderWizard();
    const root = document.body;
    const nameInput = root.querySelector(`#${ORG_CREATE_WIZARD_FIELD_IDS.companyName}`) as HTMLInputElement;
    act(() => {
      nameInput.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(nameInput, 'Acme GmbH');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const weiter = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Weiter'));
    act(() => {
      weiter?.click();
    });
    const back = Array.from(root.querySelectorAll('button')).find((b) => b.querySelector('svg.lucide-arrow-left'));
    expect(back?.getAttribute('aria-label')).toBe(
      translateKey(DEFAULT_PRODUCT_LOCALE, 'common.back').text,
    );
    const step2Pairs: Array<[string, string]> = [
      ['Admin Name', ORG_CREATE_WIZARD_FIELD_IDS.adminName],
      ['Admin E-Mail', ORG_CREATE_WIZARD_FIELD_IDS.adminEmail],
      ['Temporäres Passwort', ORG_CREATE_WIZARD_FIELD_IDS.adminPassword],
    ];
    for (const [labelText, id] of step2Pairs) {
      const label = Array.from(root.querySelectorAll('label')).find((el) => el.textContent?.trim() === labelText);
      expect(label?.getAttribute('for')).toBe(id);
    }
  });
});