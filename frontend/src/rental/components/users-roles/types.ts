import type {
  MembershipPermissionsMap,
  OrganizationInviteDto,
  OrganizationInviteStatus,
  OrganizationRoleDto,
  OrgUserDto,
  Station,
  UserSecurityActivityDto,
} from '../../../lib/api';

export type AccessControlTab =
  | 'users'
  | 'invites'
  | 'roles'
  | 'scopes'
  | 'security';

export type { OrgUserDto, OrganizationInviteDto, OrganizationRoleDto, Station, UserSecurityActivityDto };
export type { MembershipPermissionsMap, OrganizationInviteStatus };

export type UserStatusFilter = 'all' | 'active' | 'invited' | 'inactive' | 'removed';
export type AccessTypeFilter = 'all' | 'all-stations' | 'scoped' | 'field-agent';

export interface UsersRolesTabProps {
  orgId?: string;
}

export type WizardStep = 'person' | 'role' | 'access' | 'invite' | 'summary';

export interface CreateUserFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  organizationRoleId: string;
  stationMode: 'all' | 'selected';
  stationIds: string[];
  fieldAgentAccess: boolean;
  accountMethod: 'invite' | 'password';
  password: string;
}
