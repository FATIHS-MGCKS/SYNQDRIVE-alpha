import { createHash, randomUUID } from 'node:crypto';
import type { MasterAdminAuditOutbox } from '@prisma/client';
import type { GovernanceCreateGlobalUserDto, GovernanceUpdateGlobalProfileDto } from '../dto';

export const MASTER_IDENTITY_OPERATION_DOMAIN = 'global_identity_operation' as const;

export type MasterIdentityOperationAction =
  | 'PROVISION_IDENTITY'
  | 'PROVISION_IDENTITY_ORG'
  | 'UPDATE_GLOBAL_PROFILE';

export type MasterIdentityOperationBinding = {
  domain: typeof MASTER_IDENTITY_OPERATION_DOMAIN;
  action: MasterIdentityOperationAction;
  actorUserId: string;
  targetUserId?: string | null;
  organizationId?: string | null;
  normalizedEmail?: string | null;
  payloadFingerprint: string;
  securityOperationId: string;
};

export function buildMasterIdentityAuditIdempotencyKey(securityOperationId: string): string {
  return `ma-identity-audit:op:${securityOperationId}`;
}

export function resolveSecurityOperationId(clientKey?: string | null): string {
  const trimmed = clientKey?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : randomUUID();
}

/** Deterministic recursive JSON for payload fingerprinting (sort keys at every object level). */
export function canonicalizeForFingerprint(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => canonicalizeForFingerprint(entry));
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const child = obj[key];
    if (child !== undefined) {
      out[key] = canonicalizeForFingerprint(child);
    }
  }
  return out;
}

export function stableFingerprintJson(value: unknown): string {
  return JSON.stringify(canonicalizeForFingerprint(value));
}

function stableJson(value: unknown): string {
  return stableFingerprintJson(value);
}

function fingerprintOptionalString(
  target: Record<string, unknown>,
  key: string,
  value: string | undefined | null,
): void {
  if (value === undefined) return;
  target[key] = value === null ? null : value;
}

export function buildProvisionPayloadFingerprint(
  email: string,
  dto: GovernanceCreateGlobalUserDto,
  withOrg: boolean,
): string {
  const payload: Record<string, unknown> = {
    email,
    sendCredentialSetup: dto.sendCredentialSetup === true,
  };
  fingerprintOptionalString(payload, 'firstName', dto.firstName);
  fingerprintOptionalString(payload, 'lastName', dto.lastName);
  fingerprintOptionalString(payload, 'name', dto.name);
  fingerprintOptionalString(payload, 'phone', dto.phone);
  fingerprintOptionalString(payload, 'mobile', dto.mobile);
  fingerprintOptionalString(payload, 'address', dto.address);
  fingerprintOptionalString(payload, 'language', dto.language);
  fingerprintOptionalString(payload, 'timezone', dto.timezone);
  fingerprintOptionalString(payload, 'dateFormat', dto.dateFormat);
  if (withOrg && dto.initialMembership) {
    const mem = dto.initialMembership;
    const membership: Record<string, unknown> = {
      organizationId: mem.organizationId,
      role: mem.role,
    };
    if (mem.inviteByEmail !== undefined) {
      membership.inviteByEmail = Boolean(mem.inviteByEmail);
    }
    fingerprintOptionalString(membership, 'organizationRoleId', mem.organizationRoleId);
    payload.initialMembership = membership;
  } else {
    payload.initialMembership = null;
  }
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

export function buildProfilePayloadFingerprint(
  targetUserId: string,
  dto: GovernanceUpdateGlobalProfileDto,
): string {
  const payload = { targetUserId, patch: pickDefinedProfileFields(dto) };
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

function pickDefinedProfileFields(dto: GovernanceUpdateGlobalProfileDto): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [
    'name',
    'firstName',
    'lastName',
    'phone',
    'mobile',
    'address',
    'language',
    'timezone',
    'dateFormat',
  ] as const) {
    const raw = (dto as Record<string, unknown>)[key];
    if (raw !== undefined) {
      out[key] = raw === null ? null : raw;
    }
  }
  return out;
}

function provisionAction(action: MasterIdentityOperationAction): boolean {
  return action === 'PROVISION_IDENTITY' || action === 'PROVISION_IDENTITY_ORG';
}

function targetUserIdMatches(
  stored: MasterIdentityOperationBinding,
  expected: MasterIdentityOperationBinding,
): boolean {
  const storedId = stored.targetUserId ?? null;
  const expectedId = expected.targetUserId ?? null;
  if (provisionAction(expected.action)) {
    if (expectedId === null) return storedId !== null;
    return storedId === expectedId;
  }
  return storedId === expectedId;
}

export function readOperationBindingFromOutbox(
  row: MasterAdminAuditOutbox,
): MasterIdentityOperationBinding | null {
  try {
    const root = row.payload as { masterAdminAuditEnvelope?: { metadata?: Record<string, unknown> } };
    const meta = root.masterAdminAuditEnvelope?.metadata;
    const binding = meta?.operationBinding;
    if (!binding || typeof binding !== 'object') return null;
    const b = binding as MasterIdentityOperationBinding;
    if (b.domain !== MASTER_IDENTITY_OPERATION_DOMAIN) return null;
    return b;
  } catch {
    return null;
  }
}

export function outboxMatchesIdentityOperation(
  row: MasterAdminAuditOutbox,
  expected: MasterIdentityOperationBinding,
): boolean {
  const stored = readOperationBindingFromOutbox(row);
  if (!stored) return false;
  return (
    stored.action === expected.action &&
    stored.actorUserId === expected.actorUserId &&
    targetUserIdMatches(stored, expected) &&
    (stored.organizationId ?? null) === (expected.organizationId ?? null) &&
    (stored.normalizedEmail ?? null) === (expected.normalizedEmail ?? null) &&
    stored.payloadFingerprint === expected.payloadFingerprint &&
    stored.securityOperationId === expected.securityOperationId
  );
}

export function readProvisionedUserIdFromOutbox(row: MasterAdminAuditOutbox): string | null {
  if (row.subjectUserId) return row.subjectUserId;
  try {
    const root = row.payload as { masterAdminAuditEnvelope?: { entityId?: string; after?: { userId?: string } } };
    const env = root.masterAdminAuditEnvelope;
    return env?.entityId ?? env?.after?.userId ?? null;
  } catch {
    return null;
  }
}

export type ProvisionOperationMetadata = {
  inviteId?: string | null;
  membershipId?: string | null;
  inviteByEmail?: boolean;
  credentialSetupRequested?: boolean;
};

export function readProvisionOperationMetadataFromOutbox(
  row: MasterAdminAuditOutbox,
): ProvisionOperationMetadata | null {
  try {
    const root = row.payload as { masterAdminAuditEnvelope?: { metadata?: Record<string, unknown> } };
    const meta = root.masterAdminAuditEnvelope?.metadata;
    if (!meta || typeof meta !== 'object') return null;
    const out: ProvisionOperationMetadata = {};
    if (meta.inviteId === null) out.inviteId = null;
    else if (typeof meta.inviteId === 'string') out.inviteId = meta.inviteId;
    if (meta.membershipId === null) out.membershipId = null;
    else if (typeof meta.membershipId === 'string') out.membershipId = meta.membershipId;
    if (typeof meta.inviteByEmail === 'boolean') out.inviteByEmail = meta.inviteByEmail;
    if (typeof meta.credentialSetupRequested === 'boolean') {
      out.credentialSetupRequested = meta.credentialSetupRequested;
    }
    return out;
  } catch {
    return null;
  }
}