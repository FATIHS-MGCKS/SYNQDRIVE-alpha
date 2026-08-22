// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationMessageBubble } from './CommunicationMessageBubble';
import { COMMUNICATION_XSS_TIMELINE } from '../../../lib/communication/communication-timeline.fixture';

describe('CommunicationMessageBubble security', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('synqdrive.locale', 'en');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const t = (key: string) => key;

  it('renders XSS payload as plain text', () => {
    const xssText = COMMUNICATION_XSS_TIMELINE.items[0]!.content!.text!;

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(CommunicationMessageBubble, {
            direction: 'inbound',
            channel: 'WHATSAPP',
            contentLabel: 'Text',
            text: xssText,
            truncated: false,
            attachmentCount: 0,
            hasAttachments: false,
            occurredAt: '2026-08-22T10:20:00.000Z',
            locale: 'en',
            t,
          }),
        ),
      );
    });

    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not leak provider URLs from metadata in DOM', () => {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(CommunicationMessageBubble, {
            direction: 'inbound',
            channel: 'WHATSAPP',
            contentLabel: 'Text',
            text: 'Safe user text',
            truncated: false,
            attachmentCount: 0,
            hasAttachments: false,
            occurredAt: '2026-08-22T10:20:00.000Z',
            locale: 'en',
            t,
          }),
        ),
      );
    });

    expect(container.innerHTML).not.toContain('provider.example');
    expect(container.innerHTML).not.toContain('SECRET');
  });
});
