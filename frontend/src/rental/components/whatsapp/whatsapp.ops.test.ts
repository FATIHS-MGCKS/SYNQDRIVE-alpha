import { describe, expect, it } from 'vitest';
import type { WhatsAppConfig, WhatsAppConversation } from '../../../lib/api';
import {
  filterConversations,
  isSandboxEnvironment,
  resolveConnectionStatus,
} from './whatsapp.ops';

function conversation(overrides: Partial<WhatsAppConversation> = {}): WhatsAppConversation {
  return {
    id: 'c1',
    contactPhone: '+491701234567',
    contactName: 'Test User',
    customerId: 'cust-default',
    unreadCount: 0,
    status: 'OPEN',
    lastMessageAt: new Date().toISOString(),
    lastMessagePreview: 'Hello',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('resolveConnectionStatus', () => {
  it('returns disconnected when config is null', () => {
    expect(resolveConnectionStatus(null)).toBe('disconnected');
  });

  it('returns disconnected when not connected', () => {
    expect(
      resolveConnectionStatus({
        isConnected: false,
        isActive: false,
        aiMode: 'OFF',
      } as WhatsAppConfig),
    ).toBe('disconnected');
  });

  it('returns setup_required when connected but inactive', () => {
    expect(
      resolveConnectionStatus({
        isConnected: true,
        isActive: false,
        providerConfigured: true,
        phoneNumberId: 'pn-1',
        aiMode: 'OFF',
      } as WhatsAppConfig),
    ).toBe('setup_required');
  });
});

describe('filterConversations', () => {
  const list = [
    conversation({ id: 'unread', unreadCount: 2 }),
    conversation({ id: 'human', status: 'PENDING_HUMAN' }),
    conversation({ id: 'pay', intent: 'PAYMENT' }),
    conversation({ id: 'doc', intent: 'DOCUMENTS', unreadCount: 1 }),
    conversation({ id: 'dmg', intent: 'DAMAGE' }),
    conversation({ id: 'unknown', customerId: null }),
    conversation({ id: 'booking', bookingId: 'b-1' }),
  ];

  it('filters unread conversations', () => {
    const ids = filterConversations(list, 'unread', '').map(c => c.id);
    expect(ids).toEqual(['unread', 'doc']);
  });

  it('filters by payment intent', () => {
    const ids = filterConversations(list, 'payment', '').map(c => c.id);
    expect(ids).toEqual(['pay']);
  });

  it('filters unknown customers', () => {
    const ids = filterConversations(list, 'unknown_customer', '').map(c => c.id);
    expect(ids).toEqual(['unknown']);
  });

  it('filters ai_suggested by unread + intent', () => {
    const ids = filterConversations(list, 'ai_suggested', '').map(c => c.id);
    expect(ids).toEqual(['doc']);
  });
});

describe('isSandboxEnvironment', () => {
  it('is true in vitest mode', () => {
    expect(isSandboxEnvironment()).toBe(true);
  });
});
