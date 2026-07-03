import { NotificationCategory } from '@prisma/client';

export type AccountSessionStatus = 'active' | 'revoked' | 'expired';

export interface AccountUserDto {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  phone: string | null;
  mobile: string | null;
  avatarUrl: string | null;
  language: string | null;
  timezone: string | null;
  dateFormat: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastLoginDevice: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountOrganizationDto {
  id: string;
  name: string;
  slug: string | null;
  status: string;
}

export interface AccountMembershipDto {
  id: string;
  role: string;
  roleLabel: string | null;
  department: string | null;
  position: string | null;
  stationScope: string | null;
  permissions: Record<string, { read: boolean; write: boolean }> | null;
  status: string;
}

export interface AccountPreferencesDto {
  language: string | null;
  timezone: string | null;
  dateFormat: string | null;
  defaultStationId: string | null;
  defaultLandingPage: string | null;
}

export interface AccountNotificationItemDto {
  category: NotificationCategory;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  sms: boolean;
  criticalOnly: boolean;
}

export interface AccountSecurityDto {
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  twoFactorAvailable: boolean;
  passkeysAvailable: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  activeSessionCount: number;
  securityScore: number;
  recommendations: string[];
}

export interface AccountHealthDto {
  score: number;
  completedItems: string[];
  missingItems: string[];
  recommendations: string[];
}

export interface AccountMeDto {
  user: AccountUserDto;
  organization: AccountOrganizationDto;
  membership: AccountMembershipDto;
  preferences: AccountPreferencesDto;
  notifications: AccountNotificationItemDto[];
  security: AccountSecurityDto;
  accountHealth: AccountHealthDto;
}

export interface AccountSessionDto {
  id: string;
  current: boolean;
  userAgent: string | null;
  browser: string | null;
  device: string | null;
  os: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: AccountSessionStatus;
}
