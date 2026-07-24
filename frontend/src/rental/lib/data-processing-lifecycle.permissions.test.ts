import { describe, expect, it } from 'vitest';
import { availableLifecycleActions, canRunLifecycleAction, isRecordEditable } from './data-processing-lifecycle.permissions';

const allPerms = () => true;
const readOnly = (_m: string, level: string) => level === 'read';
const writeOnly = (_m: string, level: string) => level === 'read' || level === 'write';

describe('data-processing-lifecycle.permissions', () => {
  it('separates reject from revoke for processing activities in review', () => {
    const actions = availableLifecycleActions({
      entityKind: 'processing-activity',
      status: 'IN_REVIEW',
      isCurrentVersion: true,
      hasPermission: allPerms,
    });
    expect(actions).toContain('approve');
    expect(actions).toContain('reject');
    expect(actions).not.toContain('revoke');
  });

  it('allows revoke only for active processing activities', () => {
    const actions = availableLifecycleActions({
      entityKind: 'processing-activity',
      status: 'ACTIVE',
      isCurrentVersion: true,
      hasPermission: allPerms,
    });
    expect(actions).toContain('revoke');
    expect(actions).not.toContain('reject');
  });

  it('restricts actions by permission level', () => {
    const actions = availableLifecycleActions({
      entityKind: 'processing-activity',
      status: 'DRAFT',
      isCurrentVersion: true,
      hasPermission: readOnly,
    });
    expect(actions).not.toContain('request-review');
    expect(canRunLifecycleAction(writeOnly, 'request-review')).toBe(true);
    expect(canRunLifecycleAction(readOnly, 'approve')).toBe(false);
  });

  it('marks only draft current versions as editable', () => {
    expect(isRecordEditable('DRAFT', true)).toBe(true);
    expect(isRecordEditable('ACTIVE', true)).toBe(false);
    expect(isRecordEditable('DRAFT', false)).toBe(false);
  });

  it('exposes provider grant activate and revoke', () => {
    const pending = availableLifecycleActions({
      entityKind: 'provider-grant',
      status: 'PENDING',
      isCurrentVersion: true,
      hasPermission: allPerms,
    });
    expect(pending).toEqual(['activate']);

    const active = availableLifecycleActions({
      entityKind: 'provider-grant',
      status: 'ACTIVE',
      isCurrentVersion: true,
      hasPermission: allPerms,
    });
    expect(active).toEqual(['revoke']);
  });
});
