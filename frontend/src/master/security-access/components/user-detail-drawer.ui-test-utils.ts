import { act } from 'react';
import { expect, vi } from 'vitest';
import type { GovernanceUserSessionDto } from '../types';

export async function waitForExpect(assertion: () => void, timeout = 5000): Promise<void> {
  await vi.waitFor(
    () => {
      assertion();
    },
    { timeout, interval: 16 },
  );
}

export function clickButtonContaining(
  text: string,
  opts?: { disabled?: boolean; exact?: boolean },
) {
  const buttons = Array.from(document.body.querySelectorAll('button'));
  const btn = buttons.find((b) => {
    if (opts?.disabled === false && b.disabled) return false;
    const label = b.textContent?.trim() ?? '';
    if (opts?.exact) return label === text;
    return label.includes(text);
  });
  if (!btn) {
    throw new Error(`Button containing "${text}" not found`);
  }
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export function setControlledTextarea(id: string, value: string) {
  const el = document.getElementById(id) as HTMLTextAreaElement | null;
  if (!el) throw new Error(`Missing textarea #${id}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function confirmOpenPrivilegeDialog(confirmLabel: string) {
  const dialogs = document.body.querySelectorAll('[role="dialog"]');
  const dialog = dialogs.item(dialogs.length - 1);
  expect(dialog).toBeTruthy();
  const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === confirmLabel,
  );
  expect(confirmBtn).toBeTruthy();
  act(() => confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

export function dismissOpenPrivilegeDialog() {
  const dialogs = document.body.querySelectorAll('[role="dialog"]');
  const dialog = dialogs.item(dialogs.length - 1);
  const cancelBtn = Array.from(dialog.querySelectorAll('button')).find((b) => {
    const label = b.textContent?.trim() ?? '';
    return label === 'Cancel' || label === 'Abbrechen';
  });
  expect(cancelBtn).toBeTruthy();
  act(() => cancelBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

export function userDetailFixture(id: string, name: string) {
  return {
    id,
    name,
    email: `${id}@fixture.test`,
    createdAt: '2024-01-01T00:00:00Z',
    lastActive: '2024-06-01T00:00:00Z',
    accountState: 'ACTIVE',
    platformRole: null,
    role: 'Member',
    mfaState: 'ENABLED',
    attentionCodes: [],
    memberships: [],
    mfa: { enrolled: true, state: 'ENABLED', factorTypes: ['totp'], recoveryCodesRemaining: 3 },
    recentPrivilegedActivity: [],
  };
}

export function sessionFixtures(userId: string): GovernanceUserSessionDto[] {
  return [
    {
      id: `${userId}-current`,
      device: 'Current device',
      browser: 'Chrome',
      os: 'macOS',
      ipAddress: '10.0.0.1',
      current: true,
      createdAt: '2024-01-01T00:00:00Z',
      lastUsedAt: '2024-06-01T00:00:00Z',
      userAgent: 'Mozilla/5.0',
      expiresAt: '2025-01-01T00:00:00Z',
    },
    {
      id: `${userId}-other`,
      device: `Other ${userId}`,
      browser: 'Safari',
      os: 'iOS',
      ipAddress: '10.0.0.2',
      current: false,
      createdAt: '2024-01-02T00:00:00Z',
      lastUsedAt: '2024-06-02T00:00:00Z',
      userAgent: 'Mozilla/5.0',
      expiresAt: '2025-01-02T00:00:00Z',
    },
  ];
}