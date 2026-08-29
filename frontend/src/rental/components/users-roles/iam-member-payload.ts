import type { MembershipPermissionsMap, OrganizationRoleDto, Station } from '../../../lib/api';
import type { CreateUserFormState } from './types';

export interface InviteUserPayloadInput {
  orgId: string;
  form: CreateUserFormState;
  selectedRole: OrganizationRoleDto | null;
  stations: Station[];
  previewPermissions: MembershipPermissionsMap | null;
}

export function buildInviteUserPayload(input: InviteUserPayloadInput) {
  const { form, selectedRole, stations, previewPermissions } = input;
  const stationScope =
    form.stationMode === 'all'
      ? undefined
      : stations.find((s) => s.id === form.stationIds[0])?.name;
  const stationIds = form.stationMode === 'selected' ? form.stationIds : undefined;

  return {
    email: form.email.trim(),
    organizationRoleId: form.organizationRoleId,
    membershipRole: selectedRole?.membershipRole,
    permissions: previewPermissions ?? undefined,
    stationScope,
    stationIds,
    fieldAgentAccess: form.fieldAgentAccess,
    department: form.department.trim() || undefined,
    position: form.position.trim() || undefined,
    roleLabel: selectedRole?.name,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
  };
}

export function buildCreateUserPayload(input: InviteUserPayloadInput & { password: string }) {
  const invitePayload = buildInviteUserPayload(input);
  return {
    email: invitePayload.email,
    firstName: invitePayload.firstName,
    lastName: invitePayload.lastName,
    role: input.selectedRole?.membershipRole ?? 'WORKER',
    organizationRoleId: invitePayload.organizationRoleId,
    password: input.password,
    phone: input.form.phone.trim() || undefined,
    department: invitePayload.department,
    position: invitePayload.position,
    roleLabel: invitePayload.roleLabel,
    stationScope: invitePayload.stationScope,
    stationIds: invitePayload.stationIds,
    permissions:
      input.selectedRole?.membershipRole === 'ORG_ADMIN'
        ? undefined
        : invitePayload.permissions ?? undefined,
    fieldAgentAccess: invitePayload.fieldAgentAccess,
  };
}
