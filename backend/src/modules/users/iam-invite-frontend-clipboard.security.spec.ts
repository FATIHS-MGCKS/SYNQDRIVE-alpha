import { readFileSync } from 'fs';
import { join } from 'path';

describe('invite admin frontend surfaces', () => {
  const invitesTabSource = readFileSync(
    join(__dirname, '../../../../frontend/src/rental/components/users-roles/InvitesTab.tsx'),
    'utf8',
  );
  const usersTabSource = readFileSync(
    join(__dirname, '../../../../frontend/src/rental/components/users-roles/UsersTab.tsx'),
    'utf8',
  );

  it('InvitesTab does not copy invite URLs to clipboard', () => {
    expect(invitesTabSource).not.toContain('inviteUrl');
    expect(invitesTabSource).not.toContain('inviteToken');
    expect(invitesTabSource).not.toContain('navigator.clipboard.writeText');
  });

  it('UsersTab does not copy invite URLs to clipboard', () => {
    expect(usersTabSource).not.toContain('inviteUrl');
    expect(usersTabSource).not.toContain('inviteToken');
    expect(usersTabSource).not.toMatch(/navigator\.clipboard\.writeText\([^)]*invite/i);
  });
});
