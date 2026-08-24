import { describe, expect, it } from 'vitest';
import type { WhatsAppConfig } from '../../../lib/api';
import {
  isSandboxEnvironment,
  resolveConnectionStatus,
} from './whatsapp.ops';

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

describe('isSandboxEnvironment', () => {
  it('is true in vitest mode', () => {
    expect(isSandboxEnvironment()).toBe(true);
  });
});
