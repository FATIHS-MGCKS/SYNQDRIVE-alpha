// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { WhatsAppConfig } from '../../lib/api';
import { WhatsAppOperationsHeader } from './whatsapp/WhatsAppOperationsHeader';
import { WhatsAppSectionNav } from './whatsapp/WhatsAppSectionNav';
import { WhatsAppSettingsPanel } from './whatsapp/WhatsAppSettingsPanel';
import {
  labelConnectionStatus,
  labelDeliveryStatus,
  labelTemplateCategory,
  localizedInboxFilters,
  localizedNavItems,
  wa,
} from './whatsapp/whatsapp-i18n';
import {
  INBOX_FILTER_DEFS,
  NAV_ITEM_DEFS,
  TEMPLATE_CATEGORY_KEYS,
  type InboxFilter,
  type WhatsAppTab,
} from './whatsapp/whatsapp.ops';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P28_ENFORCE_CLEAN_EXACT = [
  'rental/components/WhatsAppBusinessView.tsx',
  'rental/components/whatsapp/WhatsAppChatPanel.tsx',
  'rental/components/whatsapp/WhatsAppContextDrawer.tsx',
  'rental/components/whatsapp/WhatsAppConversationInbox.tsx',
  'rental/components/whatsapp/WhatsAppInboxLayout.tsx',
  'rental/components/whatsapp/WhatsAppKpiCards.tsx',
  'rental/components/whatsapp/WhatsAppMessageBubble.tsx',
  'rental/components/whatsapp/WhatsAppMessageComposer.tsx',
  'rental/components/whatsapp/WhatsAppOperationsHeader.tsx',
  'rental/components/whatsapp/WhatsAppOverviewTab.tsx',
  'rental/components/whatsapp/WhatsAppQuickActions.tsx',
  'rental/components/whatsapp/WhatsAppReadinessStrip.tsx',
  'rental/components/whatsapp/WhatsAppSectionNav.tsx',
  'rental/components/whatsapp/WhatsAppSettingsPanel.tsx',
  'rental/components/whatsapp/WhatsAppSetupWizard.tsx',
  'rental/components/whatsapp/WhatsAppTemplateManager.tsx',
  'rental/components/whatsapp/whatsapp.ops.ts',
  'rental/components/whatsapp/whatsapp-i18n.ts',
];

function isP28EnforceCleanPath(relPath: string): boolean {
  return P28_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p28ScopedFindings() {
  return inventory.findings.filter(finding => isP28EnforceCleanPath(finding.file));
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

function buildConfig(partial: Partial<WhatsAppConfig> = {}): WhatsAppConfig {
  return {
    isConnected: true,
    isActive: true,
    aiMode: 'SUGGEST_ONLY',
    aiEscalationEnabled: true,
    providerConfigured: true,
    providerStatus: 'CONNECTED',
    phoneNumber: '+491701234567',
    businessName: 'SynqDrive Rental',
    phoneNumberId: 'pn-1234567890',
    accessTokenConfigured: true,
    ...partial,
  } as WhatsAppConfig;
}

describe('rental WhatsApp Business localization (P2.2.8)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
  });

  describe('ops i18n helpers', () => {
    it('localizes connection and delivery status labels without changing machine codes', () => {
      expect(labelConnectionStatus('en', 'connected')).toBe(en['whatsapp.connection.connected']);
      expect(labelConnectionStatus('de', 'setup_required')).toBe(de['whatsapp.connection.setupRequired']);
      expect(labelDeliveryStatus('en', 'QUEUED')).toBe(en['whatsapp.delivery.queued']);
      expect(labelDeliveryStatus('de', 'FAILED')).toBe(de['whatsapp.delivery.failed']);
      expect(labelDeliveryStatus('en', 'CUSTOM_STATUS')).toBe('CUSTOM_STATUS');
    });

    it('localizes inbox filters and nav items from machine keys', () => {
      const enFilters = localizedInboxFilters('en');
      const deFilters = localizedInboxFilters('de');
      expect(enFilters.map(f => f.key)).toEqual(INBOX_FILTER_DEFS.map(f => f.key));
      expect(deFilters.find(f => f.key === 'needs_reply')?.label).toBe(
        de['whatsapp.inbox.filter.needs_reply'],
      );
      const enNav = localizedNavItems('en');
      expect(enNav.map(n => n.key)).toEqual(NAV_ITEM_DEFS.map(n => n.key));
      expect(enNav.find(n => n.key === 'inbox')?.label).toBe(en['whatsapp.nav.inbox']);
    });

    it('localizes template categories via enum keys', () => {
      for (const category of Object.keys(TEMPLATE_CATEGORY_KEYS)) {
        expect(labelTemplateCategory('en', category)).toBe(
          en[TEMPLATE_CATEGORY_KEYS[category] as keyof typeof en],
        );
      }
    });

    it('sources ops blind-spot copy through canonical keys', () => {
      expect(wa('en', 'whatsapp.aiMode.suggest_only.label')).toBe(
        en['whatsapp.aiMode.suggest_only.label'],
      );
      expect(wa('de', 'whatsapp.readiness.consent.detail')).toBe(
        de['whatsapp.readiness.consent.detail'],
      );
    });
  });

  describe('machine-key preservation', () => {
    it('keeps InboxFilter, WhatsAppTab, and template category machine identifiers', () => {
      const opsSource = readFileSync(join(__dirname, 'whatsapp/whatsapp.ops.ts'), 'utf8');
      const expectedFilters: InboxFilter[] = [
        'all',
        'unread',
        'needs_reply',
        'ai_suggested',
        'human_handover',
        'booking',
        'documents',
        'payment',
        'damage',
        'unknown_customer',
      ];
      const expectedTabs: WhatsAppTab[] = ['overview', 'inbox', 'templates', 'settings'];
      for (const key of expectedFilters) {
        expect(opsSource).toContain(`'${key}'`);
      }
      for (const tab of expectedTabs) {
        expect(opsSource).toContain(`'${tab}'`);
      }
      for (const category of Object.keys(TEMPLATE_CATEGORY_KEYS)) {
        expect(opsSource).toContain(category);
      }
      expect(opsSource).not.toMatch(/case 'QUEUED':\s*return 'Queued'/);
    });

    it('does not import rental i18n shim in whatsapp component shells', () => {
      for (const relPath of P28_ENFORCE_CLEAN_EXACT) {
        if (!relPath.includes('/whatsapp/') || !relPath.endsWith('.tsx')) continue;
        const relative = relPath.replace('rental/components/', '');
        const source = readFileSync(join(__dirname, relative), 'utf8');
        if (!source.includes('useLanguage')) continue;
        expect(source, relPath).not.toMatch(/from ['"]\.\.\/\.\.\/i18n\/LanguageContext['"]/);
        expect(source, relPath).toMatch(/from ['"]\.\.\/\.\.\/\.\.\/i18n\/LanguageContext['"]/);
      }
    });
  });

  describe('component rendering', () => {
    it('renders WhatsAppOperationsHeader in English', () => {
      const view = renderWithLocale(
        'en',
        createElement(WhatsAppOperationsHeader, {
          config: buildConfig({ isConnected: false, isActive: false }),
          stats: null,
          isBusy: false,
          onConnect: () => undefined,
          onOpenTemplates: () => undefined,
          onRefresh: () => undefined,
        }),
      );
      cleanup = view.cleanup;
      expect(document.body.textContent).toContain(en['whatsapp.header.title']);
      expect(document.body.textContent).toContain(en['whatsapp.connection.disconnected']);
      expect(document.body.textContent).toContain(en['whatsapp.header.connect']);
    });

    it('renders WhatsAppOperationsHeader in German', () => {
      const view = renderWithLocale(
        'de',
        createElement(WhatsAppOperationsHeader, {
          config: buildConfig(),
          stats: { unreadTotal: 3 } as never,
          isBusy: false,
          onConnect: () => undefined,
          onOpenTemplates: () => undefined,
          onRefresh: () => undefined,
        }),
      );
      cleanup = view.cleanup;
      expect(document.body.textContent).toContain(de['whatsapp.header.title']);
      expect(document.body.textContent).toContain(de['whatsapp.connection.connected']);
      expect(document.body.textContent).toContain(de['whatsapp.header.configure']);
    });

    it('renders WhatsAppSectionNav filter labels in EN and DE', () => {
      const enView = renderWithLocale(
        'en',
        createElement(WhatsAppSectionNav, {
          activeTab: 'overview',
          unreadTotal: 2,
          onChange: () => undefined,
        }),
      );
      expect(document.body.textContent).toContain(en['whatsapp.nav.overview']);
      expect(document.body.textContent).toContain(en['whatsapp.nav.inbox']);
      enView.cleanup();

      const deView = renderWithLocale(
        'de',
        createElement(WhatsAppSectionNav, {
          activeTab: 'settings',
          onChange: () => undefined,
        }),
      );
      cleanup = deView.cleanup;
      expect(document.body.textContent).toContain(de['whatsapp.nav.settings']);
      expect(document.body.textContent).toContain(de['whatsapp.nav.templates']);
    });

    it('switches WhatsAppSettingsPanel locale without losing selected AI mode state', () => {
      const props = {
        config: buildConfig({ aiMode: 'FULL' as const }),
        saving: false,
        onSave: () => undefined,
        onConnect: () => undefined,
        onDisconnect: () => undefined,
        onSimulate: () => undefined,
      };
      const enView = renderWithLocale('en', createElement(WhatsAppSettingsPanel, props));
      expect(document.body.textContent).toContain(en['whatsapp.settings.ai.title']);
      expect(document.body.textContent).toContain(en['whatsapp.aiMode.full.label']);
      enView.cleanup();

      const deView = renderWithLocale('de', createElement(WhatsAppSettingsPanel, props));
      cleanup = deView.cleanup;
      expect(document.body.textContent).toContain(de['whatsapp.settings.ai.title']);
      expect(document.body.textContent).toContain(de['whatsapp.aiMode.full.label']);
    });
  });

  describe('P2.2.8 enforce-clean guard', () => {
    it('reports zero scanner findings in exact P2.2.8 scope', () => {
      expect(p28ScopedFindings()).toHaveLength(0);
    });

    it('reuses nav.whatsappBusiness and common.cancel where applicable', () => {
      expect(en['nav.whatsappBusiness']).toBe('WhatsApp Business');
      expect(en['common.cancel']).toBeTruthy();
      expect(de['common.cancel']).toBeTruthy();
    });
  });
});
