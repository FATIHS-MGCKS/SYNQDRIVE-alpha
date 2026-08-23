export interface OrgUserListRecord {
  id: string;
  name?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: string;
  membershipStatus?: string;
}

export function resolveOrgMemberDisplayName(
  user: OrgUserListRecord,
  unknownLabel = 'Unknown user',
): string {
  const composed = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return user.displayName?.trim()
    || user.name?.trim()
    || composed
    || unknownLabel;
}

export function isActiveOrgMember(user: OrgUserListRecord): boolean {
  const userStatus = (user.status ?? '').toUpperCase();
  const membershipStatus = (user.membershipStatus ?? '').toUpperCase();
  return userStatus === 'ACTIVE' && membershipStatus === 'ACTIVE';
}

export function mapOrgUserToCommunicationMember(
  user: OrgUserListRecord,
  unknownLabel = 'Unknown user',
) {
  return {
    id: user.id,
    displayName: resolveOrgMemberDisplayName(user, unknownLabel),
    isActive: isActiveOrgMember(user),
  };
}
