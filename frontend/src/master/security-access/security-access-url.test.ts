import { describe, expect, it } from 'vitest';
import { migrateSecurityAccessParams, readSecurityAccessLocation, syncSecurityAccessUrl } from './security-access-url';

describe('security-access-url', () => {
  it('migrates view=users to security-access users tab', () => {
    const next = migrateSecurityAccessParams('?view=users');
    expect(next).toContain('view=security-access');
    expect(next).toContain('securityAccess=users');
  });

  it('migrates view=activity-log to security-access audit tab', () => {
    const next = migrateSecurityAccessParams('?view=activity-log');
    expect(next).toContain('view=security-access');
    expect(next).toContain('securityAccess=audit');
  });

  it('reads security access location from search', () => {
    const loc = readSecurityAccessLocation(
      '?view=security-access&securityAccess=master-admins&userId=u-1&ownSecurityTab=sessions',
    );
    expect(loc.section).toBe('master-admins');
    expect(loc.userId).toBe('u-1');
    expect(loc.ownSecurityTab).toBe('sessions');
  });

  it('defaults invalid section to overview', () => {
    const loc = readSecurityAccessLocation('?view=security-access&securityAccess=invalid');
    expect(loc.section).toBe('overview');
  });
});

describe('syncSecurityAccessUrl', () => {
  it('is a function', () => {
    expect(typeof syncSecurityAccessUrl).toBe('function');
  });
});
