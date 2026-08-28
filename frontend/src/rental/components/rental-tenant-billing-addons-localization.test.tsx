// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import { TenantBillingAddOnsTab } from './billing/TenantBillingAddOnsTab';
import {
  resolveTenantBillingAddonName,
  resolveTenantBillingAddonStatusLabel,
} from '../lib/rental-tenant-billing-i18n';

const P258_ENFORCE_CLEAN_EXACT = ['rental/components/billing/TenantBillingAddOnsTab.tsx'];

const P257_ENFORCE_CLEAN_EXACT = [
  'rental/components/billing/TenantBillingPaymentMethodTab.tsx',
  'rental/components/billing/TenantPaymentMethodsSection.tsx',
  'rental/components/billing/tenant-payment-methods.utils.ts',
  'rental/components/billing/billing-stripe-ui.ts',
  'rental/components/billing/useBillingPaymentMethodActions.ts',
  'rental/components/billing/useBillingStripeActions.ts',
];

const BACKEND_ADDONS_ERROR = 'Backend Add-ons Error X7';
const PROVIDER_ADDON_KEY = 'PROVIDER_ADDON_X7';
const PROVIDER_ADDON_NAME = 'Provider Add-on X7';
const PROVIDER_STATUS = 'PROVIDER_STATUS_X7';
const PROVIDER_STATUS_LABEL = 'Provider Add-on Status X7';

const activeAddons = [
  {
    key: 'VOICE_AGENT',
    name: 'Sprachassistent',
    status: 'ACTIVE',
    statusLabel: 'Aktiv',
    active: true,
  },
  {
    key: 'AI_PACKAGE',
    name: 'KI-Paket',
    status: 'TRIALING',
    statusLabel: 'Testphase',
    active: true,
  },
];

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey) =>
    dict[key] ?? key;

const tDe = translate(de);
const tEn = translate(en);

function renderAddonsTab(
  props: ComponentProps<typeof TenantBillingAddOnsTab>,
  locale: 'de' | 'en' = 'de',
) {
  writePersistedLocale(locale);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(TenantBillingAddOnsTab, props),
      ),
    );
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('P2.2.58 rental tenant billing add-ons localization', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/rental/settings?settingsTab=billing&billingSubTab=addons');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('has zero P258 enforce-clean scanner debt on active path', () => {
    const scoped = inventory.findings.filter((finding) =>
      P258_ENFORCE_CLEAN_EXACT.includes(finding.file),
    );
    expect(scoped).toHaveLength(0);
  });

  it('localizes known addon keys and statuses from machine values', () => {
    expect(resolveTenantBillingAddonName(activeAddons[0], tEn)).toBe(
      en['tenantBilling.addons.key.VOICE_AGENT'],
    );
    expect(resolveTenantBillingAddonName(activeAddons[1], tDe)).toBe(
      de['tenantBilling.addons.key.AI_PACKAGE'],
    );
    expect(resolveTenantBillingAddonStatusLabel(activeAddons[0], tEn)).toBe(
      en['tenantBilling.addons.status.ACTIVE'],
    );
    expect(resolveTenantBillingAddonStatusLabel(activeAddons[1], tDe)).toBe(
      de['tenantBilling.addons.status.TRIALING'],
    );
  });

  it('preserves unknown raw addon name and statusLabel in DE and EN', () => {
    const unknownAddon = {
      key: PROVIDER_ADDON_KEY,
      name: PROVIDER_ADDON_NAME,
      status: PROVIDER_STATUS,
      statusLabel: PROVIDER_STATUS_LABEL,
      active: true,
    };

    expect(resolveTenantBillingAddonName(unknownAddon, tEn)).toBe(PROVIDER_ADDON_NAME);
    expect(resolveTenantBillingAddonName(unknownAddon, tDe)).toBe(PROVIDER_ADDON_NAME);
    expect(resolveTenantBillingAddonStatusLabel(unknownAddon, tEn)).toBe(PROVIDER_STATUS_LABEL);
    expect(resolveTenantBillingAddonStatusLabel(unknownAddon, tDe)).toBe(PROVIDER_STATUS_LABEL);
  });

  it('renders localized host chrome and raw load error', () => {
    const { container, cleanup } = renderAddonsTab(
      {
        overview: null,
        loading: false,
        error: BACKEND_ADDONS_ERROR,
        onRetry: vi.fn(),
      },
      'en',
    );

    expect(container.textContent).toContain(en['tenantBilling.addons.loadErrorTitle']);
    expect(container.textContent).toContain(BACKEND_ADDONS_ERROR);
    cleanup();
  });

  it('preserves active filter and order across DE→EN→DE', () => {
    const inactiveAddon = {
      key: 'WHATSAPP',
      name: 'WhatsApp',
      status: 'INACTIVE',
      statusLabel: 'Inaktiv',
      active: false,
    };
    const overview = { addOns: [...activeAddons, inactiveAddon] } as never;
    const onRetry = vi.fn();

    const deMount = renderAddonsTab(
      { overview, loading: false, error: null, onRetry },
      'de',
    );
    expect(deMount.container.textContent).toContain(de['tenantBilling.addons.key.VOICE_AGENT']);
    expect(deMount.container.textContent).not.toContain(en['tenantBilling.addons.key.VOICE_AGENT']);
    expect(deMount.container.textContent).not.toContain(de['tenantBilling.addons.key.WHATSAPP']);
    deMount.cleanup();

    const enMount = renderAddonsTab(
      { overview, loading: false, error: null, onRetry },
      'en',
    );
    expect(enMount.container.textContent).toContain(en['tenantBilling.addons.key.VOICE_AGENT']);
    expect(enMount.container.textContent).toContain(en['tenantBilling.addons.key.AI_PACKAGE']);
    expect(enMount.container.textContent).not.toContain(de['tenantBilling.addons.key.WHATSAPP']);
    enMount.cleanup();

    const deAgain = renderAddonsTab(
      { overview, loading: false, error: null, onRetry },
      'de',
    );
    expect(deAgain.container.textContent).toContain(de['tenantBilling.addons.key.AI_PACKAGE']);
    expect(onRetry).not.toHaveBeenCalled();
    deAgain.cleanup();
  });

  it('renders unknown provider addon raw values in DOM', () => {
    const overview = {
      addOns: [
        {
          key: PROVIDER_ADDON_KEY,
          name: PROVIDER_ADDON_NAME,
          status: PROVIDER_STATUS,
          statusLabel: PROVIDER_STATUS_LABEL,
          active: true,
        },
      ],
    } as never;

    const enMount = renderAddonsTab(
      { overview, loading: false, error: null, onRetry: vi.fn() },
      'en',
    );
    expect(enMount.container.textContent).toContain(PROVIDER_ADDON_NAME);
    expect(enMount.container.textContent).toContain(PROVIDER_STATUS_LABEL);
    enMount.cleanup();
  });

  it('has no locale-based React keys in P258 paths', () => {
    const source = readFileSync(
      resolve(__dirname, 'billing/TenantBillingAddOnsTab.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/key=\{locale\}/);
    expect(source).not.toMatch(/key=\{t\(/);
    expect(source).not.toMatch(/key=\{translated/);
  });

  it('certifies P257 enforce-clean scope remains at zero findings', () => {
    const p257Debt = inventory.findings.filter((finding) =>
      P257_ENFORCE_CLEAN_EXACT.includes(finding.file),
    );
    expect(p257Debt).toHaveLength(0);
  });
});
