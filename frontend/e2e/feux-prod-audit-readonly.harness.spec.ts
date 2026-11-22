import { test, expect } from '@playwright/test';
import {
  assertFeuxProdAuditOriginApproved,
  isFeuxProdAuditRunArmed,
  parseApprovedOrigins,
} from './feux-prod-audit-readonly.harness';

test.describe('FEUX prod audit harness wiring (no production session)', () => {
  test('approved origin allowlist includes production host', () => {
    expect(parseApprovedOrigins()).toContain('https://app.synqdrive.eu');
  });

  test('unapproved origin fails closed', () => {
    expect(() => assertFeuxProdAuditOriginApproved('https://evil.example')).toThrow(
      /not approved/i,
    );
  });

  test('armed mode refuses localhost base URL', () => {
    const prev = process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED;
    process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED = '1';
    try {
      expect(() => assertFeuxProdAuditOriginApproved('http://127.0.0.1:5173')).toThrow(
        /refuses local/i,
      );
    } finally {
      if (prev === undefined) delete process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED;
      else process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED = prev;
    }
  });

  test('isFeuxProdAuditRunArmed requires storageState path', () => {
    const prevAuth = process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED;
    const prevPath = process.env.FEUX_PROD_AUDIT_STORAGE_STATE_PATH;
    delete process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED;
    delete process.env.FEUX_PROD_AUDIT_STORAGE_STATE_PATH;
    expect(isFeuxProdAuditRunArmed()).toBe(false);
    process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED = '1';
    expect(isFeuxProdAuditRunArmed()).toBe(false);
    process.env.FEUX_PROD_AUDIT_STORAGE_STATE_PATH = '/tmp/feux-audit.json';
    expect(isFeuxProdAuditRunArmed()).toBe(true);
    if (prevAuth === undefined) delete process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED;
    else process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED = prevAuth;
    if (prevPath === undefined) delete process.env.FEUX_PROD_AUDIT_STORAGE_STATE_PATH;
    else process.env.FEUX_PROD_AUDIT_STORAGE_STATE_PATH = prevPath;
  });
});