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
import type { SupportTicket } from '../../lib/api';
import { CreateSupportTicketDialog } from '../../components/support/CreateSupportTicketDialog';
import { SupportCenterHero } from './support/SupportCenterHero';
import { SupportTicketInbox } from './support/SupportTicketInbox';
import {
  SUPPORT_STATUS_KEYS,
  formatSupportRelativeTime,
  labelSupportCategory,
  labelSupportPriority,
  labelSupportStatus,
  localizedQuickIssueCards,
} from './support/support-i18n';
import { DEFAULT_TICKET_FILTERS, computeSupportStats } from './support/support-center.utils';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function isP29EnforceCleanPath(relPath: string): boolean {
  return P29_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p29ScopedFindings() {
  return inventory.findings.filter((finding) => isP29EnforceCleanPath(finding.file));
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
    ...partial,
  } as SupportTicket;
}

describe('rental Support Center localization (P2.2.9)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
  });

  describe('support i18n helpers', () => {
    it('localizes status labels without changing machine codes', () => {
      expect(labelSupportStatus('en', 'OPEN')).toBe(en['support.statusNew']);
      expect(labelSupportStatus('de', 'IN_PROGRESS')).toBe(de['support.statusInProgress']);
      expect(labelSupportStatus('de', 'WAITING_FOR_CUSTOMER', 'admin')).toBe(
        de['support.statusWaitingForCustomerAdmin'],
      );
    });

    it('localizes priority and category labels from machine keys', () => {
      expect(labelSupportPriority('en', 'HIGH')).toBe(en['support.prioHigh']);
      expect(labelSupportCategory('de', 'BOOKING')).toBe(de['support.catBooking']);
    });

    it('formats relative time via canonical parameterized keys', () => {
      const iso = new Date(Date.now() - 15 * 60_000).toISOString();
      expect(formatSupportRelativeTime('en', iso)).toBe(
        en['support.time.minutesAgo'].replace('{count}', '15'),
      );
      expect(formatSupportRelativeTime('de', iso)).toBe(
        de['support.time.minutesAgo'].replace('{count}', '15'),
      );
    });

    it('localizes quick issue cards through translation keys', () => {
      const cards = localizedQuickIssueCards('en');
      expect(cards[0]?.title).toBe(en['support.quickIssue.app.title']);
      expect(cards.find((c) => c.category === 'BOOKING')?.description).toBe(
        en['support.quickIssue.booking.description'],
      );
    });
  });

  describe('machine-key preservation', () => {
    it('keeps support status/category/priority machine identifiers in utils', () => {
      const opsSource = readFileSync(join(__dirname, 'support/support-center.utils.ts'), 'utf8');
      for (const key of Object.keys(SUPPORT_STATUS_KEYS)) {
        expect(opsSource).toContain(`'${key}'`);
      }
      for (const category of ['APP', 'VEHICLE', 'BOOKING', 'OTHER']) {
        expect(opsSource).toContain(category);
      }
      expect(opsSource).not.toMatch(/OPEN:\s*'Neu'/);
    });
  });

  describe('component rendering', () => {
    it('renders SupportCenterHero in English', () => {
      const view = renderWithLocale(
        'en',
        createElement(SupportCenterHero, {
          stats: computeSupportStats([]),
          onCreateTicket: () => undefined,
          onQuickCategory: () => undefined,
        }),
      );
      cleanup = view.cleanup;
      expect(document.body.textContent).toContain(en['support.center.heroTitle']);
      expect(document.body.textContent).toContain(en['support.center.createTicketButton']);
      expect(document.body.textContent).toContain(en['support.quickIssue.app.title']);
    });

    it('renders SupportCenterHero in German', () => {
      const view = renderWithLocale(
        'de',
        createElement(SupportCenterHero, {
          stats: computeSupportStats([buildTicket()]),
          onCreateTicket: () => undefined,
          onQuickCategory: () => undefined,
        }),
      );
      cleanup = view.cleanup;
      expect(document.body.textContent).toContain(de['support.center.metricOpenTickets']);
      expect(document.body.textContent).toContain(de['support.center.quickHelpSubtitle']);
    });

    it('renders SupportTicketInbox status chip in EN and DE', () => {
      const ticket = buildTicket({ status: 'OPEN', statusKey: 'OPEN' });
      const props = {
        tickets: [ticket],
        selectedId: null,
        filters: DEFAULT_TICKET_FILTERS,
        onFiltersChange: () => undefined,
        onSelect: () => undefined,
        onCreateTicket: () => undefined,
        hasAnyTickets: true,
      };
      const enView = renderWithLocale('en', createElement(SupportTicketInbox, props));
      expect(document.body.textContent).toContain(en['support.statusNew']);
      enView.cleanup();

      const deView = renderWithLocale('de', createElement(SupportTicketInbox, props));
      cleanup = deView.cleanup;
      expect(document.body.textContent).toContain(de['support.statusNew']);
      expect(document.body.textContent).toContain(de['support.center.yourTickets']);
    });

    it('renders empty inbox state localized', () => {
      const view = renderWithLocale(
        'en',
        createElement(SupportTicketInbox, {
          tickets: [],
          selectedId: null,
          filters: DEFAULT_TICKET_FILTERS,
          onFiltersChange: () => undefined,
          onSelect: () => undefined,
          onCreateTicket: () => undefined,
          hasAnyTickets: false,
        }),
      );
      cleanup = view.cleanup;
      expect(document.body.textContent).toContain(en['support.empty.noTicketsYetTitle']);
      expect(document.body.textContent).toContain(en['support.empty.createFirstTicket']);
    });

    it('renders CreateSupportTicketDialog in English and German', () => {
      const enView = renderWithLocale(
        'en',
        createElement(CreateSupportTicketDialog, {
          open: true,
          onOpenChange: () => undefined,
          orgId: 'org-1',
          onCreated: () => undefined,
        }),
      );
      expect(document.body.textContent).toContain(en['support.create.title']);
      expect(document.body.textContent).toContain(en['support.submitTicket']);
      enView.cleanup();

      const deView = renderWithLocale(
        'de',
        createElement(CreateSupportTicketDialog, {
          open: true,
          onOpenChange: () => undefined,
          orgId: 'org-1',
          onCreated: () => undefined,
        }),
      );
      cleanup = deView.cleanup;
      expect(document.body.textContent).toContain(de['support.create.title']);
      expect(document.body.textContent).toContain(de['support.cancel']);
    });
  });

  describe('P2.2.9 enforce-clean guard', () => {
    it('reports zero scanner findings in exact P2.2.9 scope', () => {
      expect(p29ScopedFindings()).toHaveLength(0);
    });

    it('reuses existing support.cancel and support.submitTicket keys in create dialog', () => {
      expect(en['support.cancel']).toBeTruthy();
      expect(de['support.submitTicket']).toBeTruthy();
    });
  });
});
