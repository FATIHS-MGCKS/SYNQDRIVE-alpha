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

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function buildProvisionPayloadFingerprint(
  email: string,
  dto: GovernanceCreateGlobalUserDto,
  withOrg: boolean,
): string {
  const payload = {
    email,
    firstName: dto.firstName ?? null,
    lastName: dto.lastName ?? null,
    name: dto.name ?? null,
    initialMembership: withOrg
      ? {
          organizationId: dto.initialMembership!.organizationId,
          role: dto.initialMembership!.role,
          inviteByEmail: dto.initialMembership!.inviteByEmail ?? true,
          organizationRoleId: dto.initialMembership!.organizationRoleId ?? null,
        }
      : null,
    sendCredentialSetup: dto.sendCredentialSetup ?? false,
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
    if ((dto as Record<string, unknown>)[key] !== undefined) {
      out[key] = (dto as Record<string, unknown>)[key];
    }
  }
  return out;
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
    (stored.targetUserId ?? null) === (expected.targetUserId ?? null) &&
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