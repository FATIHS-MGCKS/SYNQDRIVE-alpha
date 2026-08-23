import { describe, expect, it } from 'vitest';
import {
  isActiveOrgMember,
  mapOrgUserToCommunicationMember,
  resolveOrgMemberDisplayName,
} from './org-member-display';

describe('org-member-display', () => {
  it('prefers displayName and never falls back to email or id', () => {
    expect(
      resolveOrgMemberDisplayName({
        id: 'user-1',
        email: 'secret@example.com',
        firstName: 'Max',
        lastName: 'Mustermann',
      }),
    ).toBe('Max Mustermann');
  });

  it('uses unknown label when no safe name exists', () => {
    expect(
      resolveOrgMemberDisplayName({ id: 'user-1', email: 'secret@example.com' }, 'Unknown user'),
    ).toBe('Unknown user');
  });

  it('normalizes active status casing', () => {
    expect(
      isActiveOrgMember({ id: '1', status: 'ACTIVE', membershipStatus: 'ACTIVE' }),
    ).toBe(true);
    expect(
      isActiveOrgMember({ id: '1', status: 'Active', membershipStatus: 'ACTIVE' }),
    ).toBe(true);
    expect(
      isActiveOrgMember({ id: '1', status: 'Active', membershipStatus: 'INVITED' }),
    ).toBe(false);
  });

  it('maps communication member without email exposure', () => {
    const member = mapOrgUserToCommunicationMember({
      id: 'user-1',
      email: 'secret@example.com',
      displayName: 'Operator One',
      status: 'Active',
      membershipStatus: 'ACTIVE',
    });
    expect(member.displayName).toBe('Operator One');
    expect(member.isActive).toBe(true);
  });
});
