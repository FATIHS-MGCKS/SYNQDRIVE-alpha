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

export function buildProvisionPayloadFingerprint(
  email: string,
  dto: GovernanceCreateGlobalUserDto,
  withOrg: boolean,
): string {
  const payload = {
    email,
    firstName: fieldFingerprintValue(dto.firstName),
    lastName: fieldFingerprintValue(dto.lastName),
    name: fieldFingerprintValue(dto.name),
    phone: fieldFingerprintValue(dto.phone),
    mobile: fieldFingerprintValue(dto.mobile),
    address: fieldFingerprintValue(dto.address),
    language: fieldFingerprintValue(dto.language),
    timezone: fieldFingerprintValue(dto.timezone),
    dateFormat: fieldFingerprintValue(dto.dateFormat),
    initialMembership: withOrg
      ? {
          inviteByEmail:
            dto.initialMembership!.inviteByEmail === undefined
              ? null
              : Boolean(dto.initialMembership!.inviteByEmail),
          organizationId: dto.initialMembership!.organizationId,
          organizationRoleId: fieldFingerprintValue(dto.initialMembership!.organizationRoleId),
          role: dto.initialMembership!.role,
        }
      : null,
    sendCredentialSetup: dto.sendCredentialSetup === true,
  };
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

export function buildProfilePayloadFingerprint(
  targetUserId: string,
  dto: GovernanceUpdateGlobalProfileDto,
): string {
  const payload = { targetUserId, patch: pickDefinedProfileFields(dto) };
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

function fieldFingerprintValue(value: string | undefined | null): string | null | '__omitted__' {
  if (value === undefined) return '__omitted__';
  if (value === null) return null;
  return value;
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