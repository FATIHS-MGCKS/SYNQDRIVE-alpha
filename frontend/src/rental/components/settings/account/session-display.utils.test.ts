import { describe, expect, it } from 'vitest';
import type { AccountSessionDto } from '../../../../lib/api';
import { formatSessionIdentity, parseOsFromUserAgent } from './session-display.utils';

function session(overrides: Partial<AccountSessionDto> = {}): AccountSessionDto {
  return {
    id: 's1',
    current: false,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    browser: 'Chrome',
    device: 'Desktop',
    os: null,
    ipAddress: '127.0.0.1',
    createdAt: '2026-07-02T19:05:00.000Z',
    expiresAt: '2026-08-02T19:05:00.000Z',
    revokedAt: null,
    lastUsedAt: '2026-07-02T21:05:00.000Z',
    status: 'active',
    ...overrides,
  };
}

describe('session-display.utils', () => {
  it('parses macOS from user agent', () => {
    expect(parseOsFromUserAgent(session().userAgent)).toBe('macOS');
  });

  it('formats a user-friendly session identity without raw user agent', () => {
    expect(formatSessionIdentity(session())).toBe('Chrome · macOS · Desktop');
    expect(formatSessionIdentity(session({ os: 'macOS' }))).toBe('Chrome · macOS · Desktop');
  });
});
