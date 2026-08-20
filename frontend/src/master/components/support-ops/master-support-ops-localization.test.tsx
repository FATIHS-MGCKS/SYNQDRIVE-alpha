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
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { de } from '../../../i18n/translations/de';
import { en } from '../../../i18n/translations/en';
import { supportOpsDe } from '../../../i18n/translations/support.ops.de';
import { supportOpsEn } from '../../../i18n/translations/support.ops.en';
import inventory from '../../../i18n/hardcoded-copy-inventory.json';
import type { SupportTicket, SupportTicketStats } from '../../../lib/api';
import { SupportOpsInbox } from './SupportOpsInbox';
import { SupportOpsKpis } from './SupportOpsKpis';
import { SupportOpsQueue } from './SupportOpsQueue';
import {
  formatSupportOpsDurationMs,
  labelSupportCategory,
  labelSupportPriority,
  labelSupportStatus,
  localizedSupportQueues,
} from './support-ops-i18n';
import {
  DEFAULT_INBOX_FILTERS,
  SUPPORT_QUEUE_DEFS,
  buildTicketListParams,
  type SupportQueueId,
} from './support-ops.utils';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P210_ENFORCE_CLEAN_EXACT = [
  'master/components/support-ops/support-ops.utils.ts',
  'master/components/support-ops/SupportOpsWorkspace.tsx',
  'master/components/support-ops/SupportOpsInbox.tsx',
  'master/components/support-ops/SupportOpsQueue.tsx',
  'master/components/support-ops/SupportOpsKpis.tsx',
];

const P27B_ENFORCE_CLEAN_EXACT = [
  'rental/components/voice-assistant/VoiceTelephonyWizard.tsx',
  'rental/components/voice-assistant/VoiceTestCenter.tsx',
  'rental/components/voice-assistant/voice-test-scenarios.ts',
];

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

const P29_ENFORCE_CLEAN_EXACT = [
  'rental/components/SupportView.tsx',
  'rental/components/support/SupportCenterHero.tsx',
  'rental/components/support/SupportTicketInbox.tsx',
  'rental/components/support/SupportTicketDetailPanel.tsx',
  'rental/components/support/SupportCreateTicketDialog.tsx',
  'rental/components/support/support-center.utils.ts',
  'rental/components/support/support-i18n.ts',
  'components/support/CreateSupportTicketDialog.tsx',
];

function isP210EnforceCleanPath(relPath: string): boolean {
  return P210_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p210ScopedFindings() {
  return inventory.findings.filter((finding) => isP210EnforceCleanPath(finding.file));
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

function buildTicket(partial: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 'ticket-1',
    ticketNumber: 42,
    subject: 'Test subject',
    description: 'Test description',
    status: 'OPEN',
    statusKey: 'OPEN',
    category: 'APP',
    priority: 'NORMAL',
    priorityKey: 'NORMAL',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    lastActivityAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    messages: [],
    unreadForUser: false,
    organizationId: 'org-1',
    reporterName: 'Reporter',
    reporterEmail: 'reporter@example.com',
    ...partial,
  } as SupportTicket;
}

describe('master Support Ops localization (P2.2.10)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
  });

  describe('support-ops i18n helpers', () => {
    it('localizes status labels without changing machine codes', () => {
      expect(labelSupportStatus('en', 'OPEN', 'admin')).toBe(en['support.statusNew']);
      expect(labelSupportStatus('de', 'WAITING_FOR_CUSTOMER', 'admin')).toBe(
        de['support.statusWaitingForCustomerAdmin'],
      );
    });

    it('localizes queue labels from translation keys', () => {
      const queues = localizedSupportQueues('en');
      expect(queues.find((q) => q.id === 'critical')?.label).toBe(en['support.ops.queue.critical']);
      expect(queues.find((q) => q.id === 'all_open')?.hint).toBeUndefined();
      expect(queues.find((q) => q.id === 'critical')?.hint).toBe(en['support.ops.queue.criticalHint']);
    });

    it('formats duration via canonical support.ops keys', () => {
      expect(formatSupportOpsDurationMs('en', 90_000)).toBe(
        en['support.ops.duration.minutes'].replace('{count}', '1'),
      );
      expect(formatSupportOpsDurationMs('de', 3_660_000)).toContain('1');
    });
  });

  describe('machine-key preservation', () => {
    it('keeps SupportQueueId and machine enums in utils', () => {
      const opsSource = readFileSync(join(__dirname, 'support-ops.utils.ts'), 'utf8');
      const queueIds: SupportQueueId[] = [
        'all_open',
        'new',
        'critical',
        'waiting_support',
        'waiting_customer',
        'mine',
        'unread',
        'resolved',
        'closed',
      ];
      for (const id of queueIds) {
        expect(opsSource).toContain(`'${id}'`);
      }
      for (const status of ['OPEN', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED']) {
        expect(opsSource).toContain(`'${status}'`);
      }
      expect(SUPPORT_QUEUE_DEFS).toHaveLength(9);
      expect(opsSource).not.toContain('MASTER_SUPPORT_LOCALE');
      expect(opsSource).not.toContain('support-i18n');
    });

    it('preserves buildTicketListParams semantics', () => {
      const filters = { ...DEFAULT_INBOX_FILTERS, organizationId: 'org-1', priority: 'HIGH' as const };
      expect(
        buildTicketListParams('critical', filters, 'search', 2, 'user-1'),
      ).toEqual({
        page: '2',
        limit: '25',
        search: 'search',
        organizationId: 'org-1',
        priority: 'CRITICAL',
        openOnly: 'true',
      });
      expect(buildTicketListParams('mine', DEFAULT_INBOX_FILTERS, '', 1, 'user-42')).toEqual({
        page: '1',
        limit: '25',
        assignedToUserId: 'user-42',
      });
      expect(buildTicketListParams('waiting_customer', DEFAULT_INBOX_FILTERS, '', 1)).toEqual({
        page: '1',
        limit: '25',
        status: 'WAITING_FOR_CUSTOMER',
      });
    });
  });

  describe('component rendering', () => {
    it('renders SupportOpsQueue in English and German', () => {
      const props = {
        activeQueue: 'all_open' as const,
        onQueueChange: () => undefined,
      };
      const enView = renderWithLocale('en', createElement(SupportOpsQueue, props));
      expect(document.body.textContent).toContain(en['support.ops.queue.header']);
      expect(document.body.textContent).toContain(en['support.ops.queue.allOpen']);
      enView.cleanup();

      const deView = renderWithLocale('de', createElement(SupportOpsQueue, props));
      cleanup = deView.cleanup;
      expect(document.body.textContent).toContain(de['support.ops.queue.new']);
    });

    it('renders SupportOpsKpis localized labels', () => {
      const stats: SupportTicketStats = {
        open: 3,
        inProgress: 1,
        waiting: 1,
        resolved: 0,
        closed: 0,
        total: 3,
        totalOpen: 3,
        newTickets: 1,
        criticalOpen: 2,
        waitingForCustomer: 1,
        unreadForAdmin: 4,
        avgFirstResponseTimeMs: 120_000,
        avgResolutionTimeMs: 3_600_000,
      };
      const enView = renderWithLocale('en', createElement(SupportOpsKpis, { stats }));
      expect(document.body.textContent).toContain(en['support.ops.kpi.open']);
      expect(document.body.textContent).toContain(en['support.ops.kpi.avgFirstResponse']);
      enView.cleanup();

      const deView = renderWithLocale('de', createElement(SupportOpsKpis, { stats }));
      cleanup = deView.cleanup;
      expect(document.body.textContent).toContain(de['support.ops.kpi.critical']);
    });

    it('renders SupportOpsInbox empty state localized', () => {
      const view = renderWithLocale(
        'en',
        createElement(SupportOpsInbox, {
          tickets: [],
          selectedId: null,
          search: '',
          onSearchChange: () => undefined,
          filters: DEFAULT_INBOX_FILTERS,
          onFiltersChange: () => undefined,
          organizations: [],
          assignees: [],
          orgNameById: () => 'Org',
          total: 0,
          page: 1,
          totalPages: 1,
          onPageChange: () => undefined,
          onRefresh: () => undefined,
          onRetry: () => undefined,
          onSelect: () => undefined,
        }),
      );
      cleanup = view.cleanup;
      expect(document.body.textContent).toContain(en['support.ops.inbox.title']);
      expect(document.body.textContent).toContain(en['support.ops.inbox.emptyQueueTitle']);
    });

    it('renders SupportOpsInbox status chip from machine key', () => {
      const ticket = buildTicket({ status: 'OPEN', statusKey: 'OPEN', priority: 'CRITICAL' });
      const view = renderWithLocale(
        'de',
        createElement(SupportOpsInbox, {
          tickets: [ticket],
          selectedId: null,
          search: '',
          onSearchChange: () => undefined,
          filters: DEFAULT_INBOX_FILTERS,
          onFiltersChange: () => undefined,
          organizations: [],
          assignees: [],
          orgNameById: () => 'Org',
          total: 1,
          page: 1,
          totalPages: 1,
          onPageChange: () => undefined,
          onRefresh: () => undefined,
          onRetry: () => undefined,
          onSelect: () => undefined,
        }),
      );
      cleanup = view.cleanup;
      expect(document.body.textContent).toContain(labelSupportStatus('de', 'OPEN', 'admin'));
      expect(document.body.textContent).toContain(labelSupportPriority('de', 'CRITICAL'));
      expect(document.body.textContent).toContain(labelSupportCategory('de', 'APP'));
    });
  });

  describe('dictionary parity', () => {
    it('keeps support.ops EN/DE key parity at 100%', () => {
      expect(Object.keys(supportOpsEn).sort()).toEqual(Object.keys(supportOpsDe).sort());
    });
  });

  describe('architectural decoupling', () => {
    it('does not import rental support-i18n from master support-ops utils', () => {
      const source = readFileSync(join(__dirname, 'support-ops.utils.ts'), 'utf8');
      expect(source).not.toMatch(/rental\/components\/support\/support-i18n/);
    });

    it('uses master-owned support-ops-i18n adapter', () => {
      const source = readFileSync(join(__dirname, 'support-ops-i18n.ts'), 'utf8');
      expect(source).toContain("Master-owned");
      expect(source).not.toMatch(/rental\/components\/support\/support-i18n/);
    });
  });

  describe('P2.2.10 enforce-clean guard', () => {
    it('reports zero scanner findings in exact P2.2.10 scope', () => {
      expect(p210ScopedFindings()).toHaveLength(0);
    });
  });

  describe('frozen slice regression guards', () => {
    it('keeps P2.2.7B enforce-clean at zero', () => {
      const debt = inventory.findings.filter((f) => P27B_ENFORCE_CLEAN_EXACT.includes(f.file));
      expect(debt).toHaveLength(0);
    });

    it('keeps P2.2.8 enforce-clean at zero', () => {
      const debt = inventory.findings.filter((f) => P28_ENFORCE_CLEAN_EXACT.includes(f.file));
      expect(debt).toHaveLength(0);
    });

    it('keeps P2.2.9 enforce-clean at zero', () => {
      const debt = inventory.findings.filter((f) => P29_ENFORCE_CLEAN_EXACT.includes(f.file));
      expect(debt).toHaveLength(0);
    });
  });

  describe('support-ops.utils blind-spot guard', () => {
    it('sources queue metadata through translation keys only', () => {
      const source = readFileSync(join(__dirname, 'support-ops.utils.ts'), 'utf8');
      expect(source).toContain('labelKey:');
      expect(source).not.toMatch(/label:\s*'/);
      expect(source).not.toContain('SUPPORT_QUEUES');
    });
  });
});
