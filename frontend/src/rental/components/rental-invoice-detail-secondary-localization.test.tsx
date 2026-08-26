// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const FIXED_ISO = '2026-07-14T10:00:00.000Z';

const mockTimelinePanel = {
  events: [
    {
      id: 'evt-1',
      kind: 'AUDIT' as const,
      label: 'PAYMENT_PROVIDER_EVENT_X7',
      occurredAt: FIXED_ISO,
      actorType: 'system' as const,
      actorLabel: 'Stripe',
      channel: 'webhook',
      reference: 'ref-729',
      detail: 'Stripe reconciliation reference ABC-729',
      tone: 'info' as const,
    },
    {
      id: 'evt-2',
      kind: 'INVOICE_CREATED' as const,
      label: 'INVOICE_CREATED',
      occurredAt: '2026-07-01T08:00:00.000Z',
      actorType: 'user' as const,
      actorLabel: 'Admin',
      channel: null,
      reference: null,
      detail: null,
      tone: 'neutral' as const,
    },
  ],
  sortOrder: 'desc' as const,
  isLegacyReduced: false,
  timezone: 'Europe/Berlin',
};

vi.mock('./invoices/hooks/useInvoiceTimeline', () => ({
  useInvoiceTimeline: () => ({ panel: mockTimelinePanel, loading: false, error: null }),
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { buildInvoiceDetailDto } from './invoices/invoiceDetail.mapper';
import { InvoiceDetailSecondary } from './invoices/InvoiceDetailSecondary';
import { InvoiceNotes } from './invoices/InvoiceNotes';
import { InvoiceTimeline } from './invoices/InvoiceTimeline';
import {
  formatRentalInvoiceDetailSecondaryTimelineDateTime,
  rentalInvoiceDetailSecondaryLinkedTaskStatusLabel,
} from '../lib/rental-invoice-detail-secondary-i18n';
import type { Invoice } from './invoices/invoiceTypes';

const P249_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceDetailSecondary.tsx',
  'rental/components/invoices/InvoiceNotes.tsx',
  'rental/components/invoices/InvoiceTimeline.tsx',
  'rental/components/invoices/invoiceDetailSecondary.mapper.ts',
  'rental/lib/rental-invoice-detail-secondary-i18n.ts',
];

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

const DESCRIPTION_RAW = 'Langzeitmiete Sonderkondition X7';
const NOTES_RAW = 'Interne Notiz X7 – Kunde ruft Freitag zurück';
const NOTES_DRAFT = 'Noch nicht speichern X7';
const TASK_TITLE = 'Rückgabe prüfen Sonderfall X7';
const INTERNAL_ID = 'inv_internal_7f3cX9';

function isP249EnforceCleanPath(relPath: string): boolean {
  return P249_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p249ScopedFindings() {
  return inventory.findings.filter((finding) => isP249EnforceCleanPath(finding.file));
}

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INTERNAL_ID,
    invoiceNumber: 42,
    invoiceNumberDisplay: 'FSM-2026-0042',
    type: 'OUTGOING_BOOKING',
    customerId: 'cust-1',
    vendorId: null,
    vendorName: null,
    bookingId: 'book-1',
    vehicleId: 'veh-1',
    title: 'Mietrechnung',
    description: DESCRIPTION_RAW,
    lineItems: null,
    subtotalCents: 10000,
    taxCents: 1900,
    totalCents: 11900,
    paidCents: 0,
    outstandingCents: 11900,
    currency: 'EUR',
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-15',
    status: 'DRAFT',
    templateId: null,
    imageUrl: null,
    extractedData: null,
    notes: NOTES_RAW,
    paidAt: null,
    createdAt: '2026-07-01T10:00:00Z',
    tasks: [
      { id: 'task-open', title: TASK_TITLE, status: 'OPEN' },
      { id: 'task-progress', title: 'Follow-up', status: 'IN_PROGRESS' },
      { id: 'task-done', title: 'Closed item', status: 'DONE' },
      { id: 'task-cancelled', title: 'Skipped', status: 'CANCELLED' },
    ],
    ...overrides,
  };
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

function LocaleSwitchHarness({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'toggle-locale',
        onClick: () => setLocale(locale === 'de' ? 'en' : 'de'),
      },
      'toggle-locale',
    ),
    children,
  );
}

function expandAccordionByLabel(container: HTMLElement, label: string) {
  const trigger = Array.from(container.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-expanded') !== null && button.textContent?.includes(label),
  );
  act(() => {
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderSecondary(locale: 'de' | 'en', invoice = sampleInvoice(), viewportWidth = 1280) {
  const detail = buildInvoiceDetailDto(invoice, {
    canManageEmail: true,
    relationsEnrichment: { createdByUserName: 'Tom Tenant' },
  });
  return renderWithLocale(
    locale,
    createElement(InvoiceDetailSecondary, {
      invoice,
      detail,
      orgId: 'org-1',
      viewportWidth,
      onSaveNotes: vi.fn(async () => true),
      onCopyInternalId: vi.fn(),
      ...theme,
    }),
  );
}

describe('rental Invoice Detail Secondary localization (P2.2.49)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('has zero P249 enforce-clean scanner debt', () => {
    expect(p249ScopedFindings()).toHaveLength(0);
  });

  it('renders English secondary chrome', async () => {
    const view = renderSecondary('en');
    cleanup = view.cleanup;
    expandAccordionByLabel(view.container, en['rental.invoice.detail.secondary.tasks.heading']);
    expandAccordionByLabel(view.container, en['rental.invoice.detail.secondary.audit.heading']);
    const text = view.container.textContent ?? '';
    expect(text).toContain(en['rental.invoice.detail.secondary.moreInfo.heading']);
    expect(text).toContain(en['rental.invoice.detail.secondary.description.heading']);
    expect(text).toContain(en['rental.invoice.detail.secondary.notes.heading']);
    expect(text).toContain(en['rental.invoice.detail.secondary.tasks.heading']);
    expect(text).toContain(en['rental.invoice.detail.secondary.audit.heading']);
    expect(text).toContain(DESCRIPTION_RAW);
    expect(text).toContain(NOTES_RAW);
    expect(text).toContain(TASK_TITLE);
    expect(text).toContain('PAYMENT_PROVIDER_EVENT_X7');
    expect(text).toContain('Stripe reconciliation reference ABC-729');
    expect(text).not.toMatch(/rental\.invoice\.detail\.secondary\./);
  });

  it('renders German secondary chrome', () => {
    const view = renderSecondary('de');
    cleanup = view.cleanup;
    const text = view.container.textContent ?? '';
    expect(text).toContain(de['rental.invoice.detail.secondary.moreInfo.heading']);
    expect(text).toContain(de['rental.invoice.detail.secondary.tasks.heading']);
    expect(text).toContain(DESCRIPTION_RAW);
    expect(text).toContain(NOTES_RAW);
    expect(text).not.toContain(en['rental.invoice.detail.secondary.moreInfo.heading']);
  });

  it('localizes linked task status labels without leaking machine values', () => {
    expect(rentalInvoiceDetailSecondaryLinkedTaskStatusLabel('en', 'IN_PROGRESS')).toBe(
      en['tasks.filter.status.IN_PROGRESS'],
    );
    expect(rentalInvoiceDetailSecondaryLinkedTaskStatusLabel('de', 'CANCELLED')).toBe(
      de['tasks.filter.status.CANCELLED'],
    );
    const view = renderSecondary('en');
    cleanup = view.cleanup;
    expandAccordionByLabel(view.container, en['rental.invoice.detail.secondary.tasks.heading']);
    const text = view.container.textContent ?? '';
    expect(text).toContain(en['tasks.filter.status.OPEN']);
    expect(text).not.toContain('IN_PROGRESS');
    expect(text).not.toContain('CANCELLED');
  });

  it('formats timeline dates with locale-aware presentation', () => {
    const deFormatted = formatRentalInvoiceDetailSecondaryTimelineDateTime('de', FIXED_ISO, 'Europe/Berlin');
    const enFormatted = formatRentalInvoiceDetailSecondaryTimelineDateTime('en', FIXED_ISO, 'Europe/Berlin');
    expect(deFormatted).not.toBe(enFormatted);
    expect(deFormatted).toMatch(/14/);
    expect(enFormatted).toMatch(/14/);
  });

  it('preserves notes draft across same-mount locale switch', async () => {
    const onSave = vi.fn(async () => true);
    const invoice = sampleInvoice();
    const detail = buildInvoiceDetailDto(invoice, { canManageEmail: true });

    const view = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, {
        children: createElement(InvoiceNotes, {
          invoice,
          onSave,
          canEdit: true,
          embedded: true,
          ...theme,
        }),
      }),
    );
    cleanup = view.cleanup;

    const editBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(de['common.edit']),
    );
    await act(async () => {
      editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = view.container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(textarea, NOTES_DRAFT);
    });

    await act(async () => {
      (view.container.querySelector('[data-testid="toggle-locale"]') as HTMLButtonElement)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect((view.container.querySelector('textarea') as HTMLTextAreaElement)?.value).toBe(NOTES_DRAFT);
    expect(view.container.textContent).toContain(NOTES_DRAFT);
  });

  it('preserves notes mutation payload byte-equivalent', async () => {
    const onSave = vi.fn(async () => true);
    const view = renderWithLocale(
      'en',
      createElement(InvoiceNotes, {
        invoice: sampleInvoice({ notes: '' }),
        onSave,
        canEdit: true,
        embedded: true,
        ...theme,
      }),
    );
    cleanup = view.cleanup;

    const editBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(en['common.edit']),
    );
    await act(async () => {
      editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = view.container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(textarea, 'Interne Notiz X7');
    });

    const saveBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(en['common.save']),
    );
    await act(async () => {
      saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith('Interne Notiz X7');
  });

  it('preserves copy internal ID callback on same mount EN → DE', async () => {
    const onCopyInternalId = vi.fn();
    const invoice = sampleInvoice();
    const detail = buildInvoiceDetailDto(invoice, {
      canManageEmail: true,
      relationsEnrichment: { createdByUserName: 'Tom Tenant' },
    });

    const view = renderWithLocale(
      'en',
      createElement(LocaleSwitchHarness, {
        children: createElement(InvoiceDetailSecondary, {
          invoice,
          detail,
          orgId: 'org-1',
          viewportWidth: 1280,
          onSaveNotes: vi.fn(async () => true),
          onCopyInternalId,
          ...theme,
        }),
      }),
    );
    cleanup = view.cleanup;
    expandAccordionByLabel(view.container, en['rental.invoice.detail.secondary.audit.heading']);

    const copyBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(en['rental.invoice.detail.secondary.copyInternalId.label']),
    );
    await act(async () => {
      copyBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCopyInternalId).toHaveBeenCalledTimes(1);

    await act(async () => {
      (view.container.querySelector('[data-testid="toggle-locale"]') as HTMLButtonElement)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const copyBtnDe = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(de['rental.invoice.detail.secondary.copyInternalId.label']),
    );
    await act(async () => {
      copyBtnDe?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCopyInternalId).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toContain(de['rental.invoice.detail.secondary.copyInternalId.label']);
  });

  it('preserves task order and raw titles across locale switch', async () => {
    const view = renderWithLocale(
      'en',
      createElement(LocaleSwitchHarness, {
        children: createElement(InvoiceDetailSecondary, {
          invoice: sampleInvoice(),
          detail: buildInvoiceDetailDto(sampleInvoice(), { canManageEmail: true }),
          orgId: 'org-1',
          viewportWidth: 1280,
          onSaveNotes: vi.fn(async () => true),
          onCopyInternalId: vi.fn(),
          ...theme,
        }),
      }),
    );
    cleanup = view.cleanup;
    expandAccordionByLabel(view.container, en['rental.invoice.detail.secondary.tasks.heading']);

    const titlesBefore = Array.from(view.container.querySelectorAll('li p.text-xs.font-medium')).map(
      (el) => el.textContent,
    );
    expect(titlesBefore[0]).toBe(TASK_TITLE);

    await act(async () => {
      (view.container.querySelector('[data-testid="toggle-locale"]') as HTMLButtonElement)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const titlesAfter = Array.from(view.container.querySelectorAll('li p.text-xs.font-medium')).map(
      (el) => el.textContent,
    );
    expect(titlesAfter).toEqual(titlesBefore);
    expect(view.container.textContent).toContain(TASK_TITLE);
  });

  it('preserves timeline event order and raw labels across locale switch', async () => {
    const view = renderWithLocale(
      'en',
      createElement(LocaleSwitchHarness, {
        children: createElement(InvoiceTimeline, {
          orgId: 'org-1',
          invoiceId: INTERNAL_ID,
          embedded: true,
          ...theme,
        }),
      }),
    );
    cleanup = view.cleanup;

    expect(view.container.textContent).toContain('PAYMENT_PROVIDER_EVENT_X7');
    const timeBefore = view.container.querySelector('time')?.textContent;

    await act(async () => {
      (view.container.querySelector('[data-testid="toggle-locale"]') as HTMLButtonElement)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(view.container.textContent).toContain('PAYMENT_PROVIDER_EVENT_X7');
    expect(view.container.textContent).toContain('Stripe reconciliation reference ABC-729');
    const timeAfter = view.container.querySelector('time')?.textContent;
    expect(timeAfter).toBeTruthy();
    expect(timeBefore).toBeTruthy();
    expect(timeAfter).not.toBe(timeBefore);
  });

  it('uses localized provenance labels while preserving raw values', () => {
    const view = renderSecondary('en');
    cleanup = view.cleanup;
    expandAccordionByLabel(view.container, en['rental.invoice.detail.secondary.audit.heading']);
    const text = view.container.textContent ?? '';
    expect(text).toContain(en['rental.invoice.detail.secondary.provenance.createdBy']);
    expect(text).toContain('Tom Tenant');
  });
});
