import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

const MANAGE_ROLES = new Set<MembershipRole>([
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
]);

const READ_ROLES = new Set<MembershipRole>([
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
  MembershipRole.WORKER,
  MembershipRole.DRIVER,
]);

export function assertCanReadBookingDrivers(membershipRole: MembershipRole | null | undefined): void {
  if (!membershipRole || !READ_ROLES.has(membershipRole)) {
    throw new ForbiddenException('Insufficient permission to view booking drivers');
  }
}

export function assertCanManageBookingDrivers(membershipRole: MembershipRole | null | undefined): void {
  if (!membershipRole || !MANAGE_ROLES.has(membershipRole)) {
    throw new ForbiddenException('Insufficient permission to manage booking drivers');
  }
}
