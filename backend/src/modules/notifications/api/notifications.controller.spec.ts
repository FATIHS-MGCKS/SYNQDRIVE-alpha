import { NotificationsController } from './notifications.controller';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';

describe('NotificationsController', () => {
  it('registers org-scoped route with OrgScopingGuard and RolesGuard', () => {
    const guards = Reflect.getMetadata('__guards__', NotificationsController);
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, RolesGuard]));
  });

  it('uses organizations/:orgId/notifications controller path', () => {
    const path = Reflect.getMetadata('path', NotificationsController);
    expect(path).toBe('organizations/:orgId/notifications');
  });
});
