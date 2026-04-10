import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MembershipStatus, MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import * as bcrypt from 'bcrypt';

const ROLE_DISPLAY: Record<string, string> = {
  ORG_ADMIN: 'Org Admin',
  SUB_ADMIN: 'Sub Admin',
  WORKER: 'Worker',
  DRIVER: 'Driver',
};

const USER_STATUS_MAP: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Inactive',
};

function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export interface CreateOrgUserDto {
  email: string;
  firstName: string;
  lastName: string;
  role: 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER';
  password?: string;
  inviteByEmail?: boolean;
  phone?: string;
  mobile?: string;
  address?: string;
  position?: string;
  department?: string;
  roleLabel?: string;
  stationScope?: string;
  language?: string;
  timezone?: string;
  dateFormat?: string;
  permissions?: Record<string, { read: boolean; write: boolean }>;
  fieldAgentAccess?: boolean;
}

export interface UpdateOrgUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  position?: string;
  department?: string;
  roleLabel?: string;
  role?: 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER';
  stationScope?: string;
  language?: string;
  timezone?: string;
  dateFormat?: string;
  permissions?: Record<string, { read: boolean; write: boolean }>;
  fieldAgentAccess?: boolean;
  status?: 'ACTIVE' | 'SUSPENDED';
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, companyName: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    return users.map((user) => this.mapUser(user, user.memberships[0]));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, companyName: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.mapUser(user, user.memberships[0]);
  }

  async create(data: { email: string; name?: string; [key: string]: unknown }) {
    return this.prisma.user.create({ data: { email: data.email, name: data.name } });
  }

  async update(id: string, data: { email?: string; name?: string; [key: string]: unknown }) {
    return this.prisma.user.update({ where: { id }, data: { email: data.email, name: data.name } });
  }

  async delete(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  async findByOrganization(orgId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId },
      include: {
        user: true,
        organization: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => this.mapOrgUser(m));
  }

  async findOrgUserDetail(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
      include: {
        user: true,
        organization: {
          select: { id: true, companyName: true },
          },
      },
    });
    if (!membership) throw new NotFoundException('User not found in organization');
    return this.mapOrgUserFull(membership);
  }

  async createOrgUser(orgId: string, dto: CreateOrgUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      const existingMembership =
        await this.prisma.organizationMembership.findFirst({
          where: { userId: existing.id, organizationId: orgId },
        });
      if (existingMembership) {
        throw new BadRequestException(
          'User already exists in this organization',
        );
      }
    }

    const fullName = [dto.firstName, dto.lastName].filter(Boolean).join(' ');
    let passwordHash: string | undefined;
    if (dto.password) {
      if (dto.password.length < 6) {
        throw new BadRequestException(
          'Password must be at least 6 characters',
        );
      }
      passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let user = existing;
      if (!user) {
        user = await tx.user.create({
          data: {
            email: dto.email.toLowerCase().trim(),
            name: fullName || null,
            firstName: dto.firstName || null,
            lastName: dto.lastName || null,
            passwordHash: passwordHash ?? null,
            phone: dto.phone || null,
            mobile: dto.mobile || null,
            address: dto.address || null,
            language: dto.language || 'de',
            timezone: dto.timezone || 'Europe/Berlin',
            dateFormat: dto.dateFormat || 'DD.MM.YYYY',
            mustChangePassword: !!dto.password,
            status: 'ACTIVE',
          },
        });
      } else if (passwordHash) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            firstName: dto.firstName || user.firstName,
            lastName: dto.lastName || user.lastName,
            name: fullName || user.name,
            phone: dto.phone || user.phone,
            mobile: dto.mobile || user.mobile,
            address: dto.address || user.address,
          },
        });
      }

      const membership = await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          role: dto.role as MembershipRole,
          roleLabel: dto.roleLabel || null,
          stationScope: dto.stationScope || null,
          department: dto.department || null,
          position: dto.position || null,
          permissions: dto.permissions
            ? (dto.permissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldAgentAccess:
            dto.role === 'ORG_ADMIN' ? true : !!dto.fieldAgentAccess,
          status: dto.inviteByEmail
            ? MembershipStatus.INVITED
            : MembershipStatus.ACTIVE,
        },
        include: {
          user: true,
          organization: { select: { id: true, companyName: true } },
        },
      });

      return membership;
    });

    return this.mapOrgUserFull(result as unknown as {
      user: Record<string, unknown>;
      organization?: { id: string; companyName: string } | null;
      [key: string]: unknown;
    });
  }

  async updateOrgUser(orgId: string, userId: string, dto: UpdateOrgUserDto) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
    });
    if (!membership) throw new NotFoundException('User not found in organization');

    const fullName = dto.firstName || dto.lastName
      ? [dto.firstName, dto.lastName].filter(Boolean).join(' ')
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      const userUpdate: Record<string, unknown> = {};
      if (dto.firstName !== undefined) userUpdate.firstName = dto.firstName;
      if (dto.lastName !== undefined) userUpdate.lastName = dto.lastName;
      if (fullName) userUpdate.name = fullName;
      if (dto.email !== undefined) userUpdate.email = dto.email.toLowerCase().trim();
      if (dto.phone !== undefined) userUpdate.phone = dto.phone;
      if (dto.mobile !== undefined) userUpdate.mobile = dto.mobile;
      if (dto.address !== undefined) userUpdate.address = dto.address;
      if (dto.language !== undefined) userUpdate.language = dto.language;
      if (dto.timezone !== undefined) userUpdate.timezone = dto.timezone;
      if (dto.dateFormat !== undefined) userUpdate.dateFormat = dto.dateFormat;
      if (dto.status !== undefined) userUpdate.status = dto.status;

      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userUpdate });
      }

      const membershipUpdate: Record<string, unknown> = {};
      if (dto.role !== undefined)
        membershipUpdate.role = dto.role as MembershipRole;
      if (dto.roleLabel !== undefined)
        membershipUpdate.roleLabel = dto.roleLabel;
      if (dto.stationScope !== undefined)
        membershipUpdate.stationScope = dto.stationScope || null;
      if (dto.department !== undefined)
        membershipUpdate.department = dto.department;
      if (dto.position !== undefined)
        membershipUpdate.position = dto.position;
      if (dto.permissions !== undefined)
        membershipUpdate.permissions = dto.permissions
          ? (dto.permissions as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;
      if (dto.fieldAgentAccess !== undefined)
        membershipUpdate.fieldAgentAccess = dto.fieldAgentAccess;

      if (Object.keys(membershipUpdate).length > 0) {
        await tx.organizationMembership.update({
          where: { id: membership.id },
          data: membershipUpdate,
        });
      }
    });

    return this.findOrgUserDetail(orgId, userId);
  }

  async changeOrgUserPassword(
    orgId: string,
    userId: string,
    password: string,
    requesterId: string,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
    });
    if (!membership) throw new NotFoundException('User not found in organization');

    if (requesterId !== userId) {
      const requesterMembership =
        await this.prisma.organizationMembership.findFirst({
          where: { organizationId: orgId, userId: requesterId },
        });
      if (
        !requesterMembership ||
        requesterMembership.role === 'WORKER' ||
        requesterMembership.role === 'DRIVER'
      ) {
        throw new ForbiddenException(
          'Insufficient permissions to change password',
        );
      }
      if (
        requesterMembership.role === 'SUB_ADMIN' &&
        membership.role === 'ORG_ADMIN'
      ) {
        throw new ForbiddenException('Cannot change password for an Org Admin');
      }
    }

    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const hash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: requesterId !== userId },
    });
    return { message: 'Password updated successfully' };
  }

  async removeOrgUser(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId },
    });
    if (!membership) throw new NotFoundException('User not found in organization');

    await this.prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.REMOVED },
    });
    return { removed: true };
  }

  async createMembership(userId: string, orgId: string, role: string) {
    return this.prisma.organizationMembership.create({
      data: {
        userId,
        organizationId: orgId,
        role: role as MembershipRole,
      },
    });
  }

  async removeMembership(userId: string, orgId: string) {
    await this.prisma.organizationMembership.deleteMany({
      where: { userId, organizationId: orgId },
    });
    return { removed: true };
  }

  async updateLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  private mapOrgUser(membership: {
    user: Record<string, unknown>;
    organization?: { id: string; companyName: string } | null;
    [key: string]: unknown;
  }) {
    const u = membership.user as Record<string, unknown>;
    const role = ROLE_DISPLAY[membership.role as string] || (membership.role as string);
    const membershipStatus = membership.status as string;

    return {
      id: u.id as string,
      membershipId: membership.id as string,
      name: (u.name as string) || '',
      firstName: (u.firstName as string) || '',
      lastName: (u.lastName as string) || '',
      email: (u.email as string) || '',
      role,
      roleKey: membership.role as string,
      roleLabel: (membership.roleLabel as string) || '',
      organizationId: membership.organizationId as string,
      organizationName: membership.organization?.companyName || '',
      department: (membership.department as string) || '',
      position: (membership.position as string) || '',
      stationScope: (membership.stationScope as string) || '',
      fieldAgentAccess: !!membership.fieldAgentAccess,
      permissions: (membership.permissions as Record<string, unknown>) || null,
      status:
        membershipStatus === 'INVITED'
          ? 'Invited'
          : membershipStatus === 'REMOVED'
            ? 'Removed'
            : (USER_STATUS_MAP[u.status as string] || 'Active'),
      membershipStatus,
      lastActive:
        ((u.lastLoginAt as Date)?.toISOString?.()) ||
        ((u.updatedAt as Date)?.toISOString?.()) ||
        '',
      lastLoginAt: ((u.lastLoginAt as Date)?.toISOString?.()) || '',
      createdAt: ((u.createdAt as Date)?.toISOString?.()) || '',
      avatar: getInitials(u.name as string),
      phone: (u.phone as string) || '',
      mobile: (u.mobile as string) || '',
      language: (u.language as string) || 'de',
      timezone: (u.timezone as string) || 'Europe/Berlin',
      dateFormat: (u.dateFormat as string) || 'DD.MM.YYYY',
    };
  }

  private mapOrgUserFull(membership: {
    user: Record<string, unknown>;
    organization?: { id: string; companyName: string } | null;
    [key: string]: unknown;
  }) {
    const base = this.mapOrgUser(membership);
    const u = membership.user as Record<string, unknown>;
    return {
      ...base,
      address: (u.address as string) || '',
      mustChangePassword: !!u.mustChangePassword,
      lastLoginIp: (u.lastLoginIp as string) || '',
      lastLoginDevice: (u.lastLoginDevice as string) || '',
    };
  }

  private mapUser(user: Record<string, unknown>, membership?: Record<string, unknown>) {
    const isMasterAdmin = user.platformRole === 'MASTER_ADMIN';

    let role: string;
    let organizationId = '';
    let organizationName = '';
    let status: string;

    if (isMasterAdmin) {
      role = 'Master Admin';
      status = USER_STATUS_MAP[user.status as string] || 'Active';
      if (membership) {
        organizationId =
          (membership.organizationId as string) ||
          ((membership as Record<string, unknown>).organization as { id: string })?.id || '';
        organizationName =
          ((membership as Record<string, unknown>).organization as { companyName: string })?.companyName || '';
      }
    } else if (membership) {
      role = ROLE_DISPLAY[membership.role as string] || (membership.role as string);
      organizationId =
        (membership.organizationId as string) ||
        ((membership as Record<string, unknown>).organization as { id: string })?.id || '';
      organizationName =
        ((membership as Record<string, unknown>).organization as { companyName: string })?.companyName || '';
      status =
        membership.status === MembershipStatus.INVITED
          ? 'Invited'
          : (USER_STATUS_MAP[user.status as string] || 'Active');
    } else {
      role = 'Worker';
      status = USER_STATUS_MAP[user.status as string] || 'Active';
    }

    return {
      id: user.id as string,
      name: (user.name as string) || '',
      email: user.email as string,
      role,
      organizationId,
      organizationName,
      status,
      lastActive:
        ((user.lastLoginAt as Date)?.toISOString?.()) ||
        ((user.updatedAt as Date)?.toISOString?.()) ||
        '',
      created_at: ((user.createdAt as Date)?.toISOString?.()) || '',
      avatar: getInitials(user.name as string),
      last_login: ((user.lastLoginAt as Date)?.toISOString?.()) || '',
    };
  }
}
