// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { CommunicationDashboardRow } from './communication/CommunicationDashboardRow';

describe('CommunicationDashboardRow', () => {
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

  function renderRow(
    conversation: Parameters<typeof CommunicationDashboardRow>[0]['conversation'],
    onOpen = () => {},
  ) {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(CommunicationDashboardRow, {
            conversation,
            locale: 'en-US',
            t: (key: string) => key,
            onOpen,
          }),
        ),
      );
    });
  }

  it('renders canonical title, preview, channel, and badge without provider identity', () => {
    renderRow({
      id: 'conv-sms',
      channel: 'SMS',
      status: 'HUMAN_REQUIRED',
      unreadCount: 2,
      lastActivityAt: '2026-08-22T10:00:00.000Z',
      displayLabel: 'SMS Customer',
      lastMessagePreview: 'Need help with booking',
    });

    expect(container.textContent).toContain('SMS Customer');
    expect(container.textContent).toContain('Need help with booking');
    expect(container.textContent).toContain('communication.channels.sms');
    expect(container.textContent).toContain('communication.dashboard.humanRequired');
    expect(container.textContent).not.toContain('sent.dm');
  });

  it('uses semantic voice call fallback without transcript', () => {
    renderRow({
      id: 'conv-voice',
      channel: 'VOICE',
      status: 'HUMAN_REQUIRED',
      unreadCount: 0,
      lastActivityAt: '2026-08-22T09:00:00.000Z',
      displayLabel: 'Voice Customer',
      lastMessagePreview: null,
    });

    expect(container.textContent).toContain('Voice Customer');
    expect(container.textContent).toContain('communication.preview.voiceFallback');
    expect(container.textContent).not.toContain('transcript');
  });
});
