// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(async () => true),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { SendInvoiceDialog } from './invoices/SendInvoiceDialog';
import type { Invoice } from './invoices/invoiceTypes';
import {
  buildSendInvoiceDefaultBody,
  SEND_INVOICE_ERROR_RECIPIENT_KEY,
} from '../lib/send-invoice-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P222_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/SendInvoiceDialog.tsx',
  'rental/lib/send-invoice-i18n.ts',
];

const mockInvoice = {
  id: 'inv-1',
  orgId: 'org-1',
  type: 'OUTGOING_MANUAL',
  status: 'ISSUED',
  title: 'Service invoice',
  invoiceNumberDisplay: 'FSM-2026-0042',
  currency: 'EUR',
} as unknown as Invoice;

function isP222EnforceCleanPath(relPath: string): boolean {
  return P222_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p222ScopedFindings() {
  return inventory.findings.filter((finding) => isP222EnforceCleanPath(finding.file));
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

function renderSendDialog(
  locale: 'de' | 'en',
  overrides: Partial<{
    defaultToEmail: string;
    defaultSubject: string;
    documentId: string;
    onSend: typeof mockSend;
  }> = {},
) {
  return renderWithLocale(
    locale,
    createElement(SendInvoiceDialog, {
      invoice: mockInvoice,
      open: true,
      onOpenChange: vi.fn(),
      defaultToEmail: overrides.defaultToEmail ?? 'customer@example.com',
      defaultSubject: overrides.defaultSubject ?? 'Ihre Rechnung FSM-2026-0042',
      documentId: overrides.documentId ?? 'doc-1',
      sending: false,
      onSend: overrides.onSend ?? mockSend,
    }),
  );
}

function portalText() {
  return document.body.textContent ?? '';
}

function portalQuery<T extends Element>(selector: string) {
  return document.body.querySelector(selector) as T | null;
}

describe('rental Send Invoice Dialog localization (P2.2.22)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P222 scoped findings', () => {
      expect(p222ScopedFindings()).toHaveLength(0);
    });
  });

  describe('presentation adapter', () => {
    it('builds localized default body with invoice number placeholder', () => {
      expect(buildSendInvoiceDefaultBody('en', 'FSM-2026-0042')).toContain('FSM-2026-0042');
      expect(buildSendInvoiceDefaultBody('en', 'FSM-2026-0042')).toContain(
        en['invoices.send.defaultBody'].split('{number}')[0].trim(),
      );
      expect(buildSendInvoiceDefaultBody('de', 'FSM-2026-0042')).toContain(
        de['invoices.send.defaultBody'].split('{number}')[0].trim(),
      );
    });

    it('keeps recipient-required error key canonical', () => {
      expect(SEND_INVOICE_ERROR_RECIPIENT_KEY).toBe('invoices.send.error.recipientRequired');
    });
  });

  describe('EN render', () => {
    it('shows localized send dialog chrome in English', async () => {
      const view = renderSendDialog('en');
      cleanup = view.cleanup;
      await act(async () => {});
      expect(portalText()).toContain(en['invoices.send.title']);
      expect(portalText()).toContain(en['email.send.modal.recipient']);
      expect(portalText()).not.toContain(de['invoices.send.title']);
    });
  });

  describe('DE render', () => {
    it('shows localized send dialog chrome in German', async () => {
      const view = renderSendDialog('de');
      cleanup = view.cleanup;
      await act(async () => {});
      expect(portalText()).toContain(de['invoices.send.title']);
      expect(portalText()).toContain(de['email.send.modal.recipient']);
    });
  });

  describe('runtime locale switch', () => {
    it('switches locale at runtime without stale labels', async () => {
      const enView = renderSendDialog('en');
      await act(async () => {});
      expect(portalText()).toContain(en['invoices.send.title']);
      enView.cleanup();

      const deView = renderSendDialog('de');
      cleanup = deView.cleanup;
      await act(async () => {});
      expect(portalText()).toContain(de['invoices.send.title']);
      expect(portalText()).not.toContain(en['invoices.send.title']);
    });

    it('updates chrome on same mounted dialog when locale switches EN → DE', async () => {
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
          createElement(SendInvoiceDialog, {
            invoice: mockInvoice,
            open: true,
            onOpenChange: vi.fn(),
            defaultToEmail: 'customer@example.com',
            defaultSubject: 'Invoice FSM-2026-0042',
            documentId: 'doc-1',
            sending: false,
            onSend: mockSend,
          }),
        ),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(portalText()).toContain(en['invoices.send.title']);
      expect(portalText()).toContain(en['email.send.modal.subject']);

      const switchBtn = document.querySelector('[data-testid="switch-locale-de"]') as HTMLButtonElement;
      await act(async () => {
        switchBtn.click();
      });

      expect(portalText()).toContain(de['invoices.send.title']);
      expect(portalText()).toContain(de['email.send.modal.subject']);
      expect(portalText()).not.toContain(en['invoices.send.title']);
    });
  });

  describe('edited-content locale switch', () => {
    it('preserves user-edited subject, body, and recipient across locale switch', async () => {
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
          createElement(LocaleSwitchButton, { target: 'en' }),
          createElement(SendInvoiceDialog, {
            invoice: mockInvoice,
            open: true,
            onOpenChange: vi.fn(),
            defaultToEmail: 'anna.mueller@example.com',
            defaultSubject: 'Ihre Rechnung FSM-2026-0042',
            documentId: 'doc-77',
            sending: false,
            onSend: mockSend,
          }),
        ),
      );
      cleanup = view.cleanup;
      await act(async () => {});

      const emailInput = portalQuery<HTMLInputElement>('input[type="email"]');
      const subjectInput = portalQuery<HTMLInputElement>('input[type="text"]');
      const bodyTextarea = portalQuery<HTMLTextAreaElement>('textarea');

      await act(async () => {
        const inputSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        inputSetter?.call(subjectInput, 'Edited subject line');
        subjectInput!.dispatchEvent(new Event('input', { bubbles: true }));

        const textareaSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        textareaSetter?.call(bodyTextarea, 'Edited body content');
        bodyTextarea!.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(emailInput?.value).toBe('anna.mueller@example.com');
      expect(subjectInput?.value).toBe('Edited subject line');
      expect(bodyTextarea?.value).toBe('Edited body content');

      const switchDe = document.querySelector('[data-testid="switch-locale-de"]') as HTMLButtonElement;
      await act(async () => {
        switchDe.click();
      });

      expect(portalText()).toContain(de['invoices.send.title']);
      expect(emailInput?.value).toBe('anna.mueller@example.com');
      expect(subjectInput?.value).toBe('Edited subject line');
      expect(bodyTextarea?.value).toBe('Edited body content');

      const switchEn = document.querySelector('[data-testid="switch-locale-en"]') as HTMLButtonElement;
      await act(async () => {
        switchEn.click();
      });

      expect(portalText()).toContain(en['invoices.send.title']);
      expect(emailInput?.value).toBe('anna.mueller@example.com');
      expect(subjectInput?.value).toBe('Edited subject line');
      expect(bodyTextarea?.value).toBe('Edited body content');
    });
  });

  describe('dynamic business data preservation', () => {
    it('keeps recipient email and invoice number unchanged under EN', async () => {
      const view = renderSendDialog('en', {
        defaultToEmail: 'anna.mueller@example.com',
        defaultSubject: 'Ihre Rechnung FSM-2026-0042',
      });
      cleanup = view.cleanup;
      await act(async () => {});

      const emailInput = portalQuery<HTMLInputElement>('input[type="email"]');
      expect(emailInput?.value).toBe('anna.mueller@example.com');
      expect(portalText()).toContain('FSM-2026-0042');
    });
  });

  describe('payload regression', () => {
    it('submits send-email payload with frozen machine semantics', async () => {
      const onSend = vi.fn(async () => true);
      const view = renderSendDialog('en', {
        defaultToEmail: 'customer@example.com',
        defaultSubject: 'Invoice FSM-2026-0042',
        documentId: 'doc-99',
        onSend,
      });
      cleanup = view.cleanup;
      await act(async () => {});

      const subjectInput = portalQuery<HTMLInputElement>('input[type="text"]');
      const bodyTextarea = portalQuery<HTMLTextAreaElement>('textarea');
      expect(subjectInput).toBeTruthy();
      expect(bodyTextarea).toBeTruthy();

      await act(async () => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeInputValueSetter?.call(subjectInput, 'Custom subject line');
        subjectInput!.dispatchEvent(new Event('input', { bubbles: true }));

        const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        nativeTextareaValueSetter?.call(bodyTextarea, 'Custom body text');
        bodyTextarea!.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const sendBtn = [...document.body.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes(en['email.send.modal.send']),
      );
      await act(async () => {
        sendBtn?.click();
      });

      expect(onSend).toHaveBeenCalledWith({
        toEmail: 'customer@example.com',
        subject: 'Custom subject line',
        bodyText: 'Custom body text',
        ccEmails: [],
        bccEmails: [],
        documentId: 'doc-99',
      });
    });
  });

  describe('source guards', () => {
    it('uses translation keys in SendInvoiceDialog source', () => {
      const source = readFileSync(join(__dirname, 'invoices/SendInvoiceDialog.tsx'), 'utf8');
      expect(source).toContain("t('invoices.send.title')");
      expect(source).toContain("t('email.send.modal.recipient')");
      expect(source).not.toMatch(/Rechnung per E-Mail senden/);
    });
  });
});
