import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  ProductSlug,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { persistCoreAppServiceClientAuditTx } from './core-app-service-client.admin-audit.util';
import {
  validateCoreAppM2mScopeDefinitions,
} from '../core-app-service-registry.policy';
import {
  CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT,
  type CoreAppServiceClientCreatedV1,
  type CoreAppServiceClientDetailV1,
  type CoreAppServiceClientListV1,
  type CoreAppServiceCredentialRotatedV1,
  type CoreAppServiceOrgGrantListV1,
  type CoreAppServiceOrgGrantV1,
  type MasterAdminAuditContext,
} from './core-app-service-client.admin.types';
import {
  parseAllowedScopes,
  parseServiceClientIdParam,
  parseServiceClientProductSlug,
} from './parse-service-client-input';

const BCRYPT_ROUNDS = 10;
const CREDENTIAL_BYTE_LENGTH = 32;

@Injectable()
export class CoreAppServiceClientAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listClients(): Promise<CoreAppServiceClientListV1> {
    const rows = await this.prisma.coreAppServiceClient.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: { orgGrants: { select: { status: true } } },
    });
    return {
      contractVersion: CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT,
      items: rows.map((row) =>
        this.mapClient(row, this.countActiveGrants(row.orgGrants)),
      ),
    };
  }

  async getClient(id: string): Promise<CoreAppServiceClientDetailV1> {
    const row = await this.prisma.coreAppServiceClient.findUnique({
      where: { id },
      include: { orgGrants: { select: { status: true } } },
    });
    if (!row) {
      throw new NotFoundException('Service client not found');
    }
    return this.mapClient(row, this.countActiveGrants(row.orgGrants));
  }

  async createClient(
    body: Record<string, unknown>,
    audit: MasterAdminAuditContext,
  ): Promise<CoreAppServiceClientCreatedV1> {
    const clientId = parseServiceClientIdParam(body.clientId);
    const displayName = String(body.displayName ?? '').trim();
    if (!displayName || displayName.length > 120) {
      throw new BadRequestException('displayName is invalid');
    }
    const productSlug = parseServiceClientProductSlug(body.productSlug);
    const allowedScopes = parseAllowedScopes(body.allowedScopes);
    this.assertValidScopes(allowedScopes);

    const existing = await this.prisma.coreAppServiceClient.findUnique({
      where: { clientId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('clientId already exists');
    }

    const clientSecret = randomBytes(CREDENTIAL_BYTE_LENGTH).toString('base64url');
    const credentialHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.coreAppServiceClient.create({
        data: {
          clientId,
          displayName,
          productSlug,
          credentialHash,
          credentialVersion: 1,
          status: CoreAppServiceClientStatus.DISABLED,
          allowedScopes,
        },
        include: { orgGrants: { select: { status: true } } },
      });
      const after = this.mapClient(created, this.countActiveGrants(created.orgGrants));
      await persistCoreAppServiceClientAuditTx(tx, this.auditPayload(audit, {
        description: `Created core app service client ${clientId}`,
        entityId: created.id,
        metadata: {
          domain: 'core_app_service_client',
          action: 'create',
          clientId,
          productSlug,
          allowedScopes,
          credentialVersion: 1,
          credentialFingerprint: fingerprintSecret(clientSecret),
        },
        after,
      }));
      return created;
    });

    return {
      contractVersion: CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT,
      client: this.mapClient(row, this.countActiveGrants(row.orgGrants)),
      clientSecret,
    };
  }

  async updateClient(
    id: string,
    body: Record<string, unknown>,
    audit: MasterAdminAuditContext,
  ): Promise<CoreAppServiceClientDetailV1> {
    const before = await this.getClientRow(id);
    const data: {
      displayName?: string;
      status?: CoreAppServiceClientStatus;
      allowedScopes?: string[];
    } = {};

    if (body.displayName !== undefined) {
      const displayName = String(body.displayName).trim();
      if (!displayName || displayName.length > 120) {
        throw new BadRequestException('displayName is invalid');
      }
      data.displayName = displayName;
    }

    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (
        status !== CoreAppServiceClientStatus.ACTIVE &&
        status !== CoreAppServiceClientStatus.DISABLED
      ) {
        throw new BadRequestException('status is invalid');
      }
      data.status = status as CoreAppServiceClientStatus;
    }

    if (body.allowedScopes !== undefined) {
      const allowedScopes = parseAllowedScopes(body.allowedScopes);
      this.assertValidScopes(allowedScopes);
      data.allowedScopes = allowedScopes;
    }

    if (body.productSlug !== undefined) {
      const requested = parseServiceClientProductSlug(body.productSlug);
      if (requested !== before.productSlug) {
        throw new BadRequestException('productSlug cannot be changed after creation');
      }
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No supported fields to update');
    }

    const bumpCredential =
      (data.status === CoreAppServiceClientStatus.DISABLED &&
        before.status !== CoreAppServiceClientStatus.DISABLED) ||
      (data.allowedScopes !== undefined &&
        !scopesEqual(data.allowedScopes, [...before.allowedScopes]));

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.coreAppServiceClient.update({
        where: { id },
        data: {
          ...data,
          ...(bumpCredential ? { credentialVersion: { increment: 1 } } : {}),
        },
        include: { orgGrants: { select: { status: true } } },
      });
      const beforeView = this.mapClient(before, this.countActiveGrants(before.orgGrants));
      const afterView = this.mapClient(updated, this.countActiveGrants(updated.orgGrants));
      await persistCoreAppServiceClientAuditTx(tx, this.auditPayload(audit, {
        description: `Updated core app service client ${updated.clientId}`,
        entityId: updated.id,
        metadata: {
          domain: 'core_app_service_client',
          action: 'update',
          clientId: updated.clientId,
          credentialVersionBumped: bumpCredential,
        },
        before: beforeView,
        after: afterView,
      }));
      return updated;
    });

    return this.mapClient(row, this.countActiveGrants(row.orgGrants));
  }

  async rotateCredential(
    id: string,
    audit: MasterAdminAuditContext,
  ): Promise<CoreAppServiceCredentialRotatedV1> {
    const before = await this.getClientRow(id);
    const clientSecret = randomBytes(CREDENTIAL_BYTE_LENGTH).toString('base64url');
    const credentialHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.coreAppServiceClient.update({
        where: { id },
        data: {
          credentialHash,
          credentialVersion: { increment: 1 },
        },
        include: { orgGrants: { select: { status: true } } },
      });
      await persistCoreAppServiceClientAuditTx(tx, this.auditPayload(audit, {
        description: `Rotated credential for core app service client ${updated.clientId}`,
        entityId: updated.id,
        metadata: {
          domain: 'core_app_service_client',
          action: 'rotate_credential',
          clientId: updated.clientId,
          credentialVersion: updated.credentialVersion,
          credentialFingerprint: fingerprintSecret(clientSecret),
        },
        before: { credentialVersion: before.credentialVersion },
        after: { credentialVersion: updated.credentialVersion },
      }));
      return updated;
    });

    return {
      contractVersion: CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT,
      client: this.mapClient(row, this.countActiveGrants(row.orgGrants)),
      clientSecret,
    };
  }

  async listOrgGrants(serviceClientId: string): Promise<CoreAppServiceOrgGrantListV1> {
    await this.assertClientExists(serviceClientId);
    const rows = await this.prisma.coreAppServiceOrgGrant.findMany({
      where: { serviceClientId },
      orderBy: [{ createdAt: 'desc' }],
    });
    return {
      contractVersion: CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT,
      serviceClientId,
      items: rows.map((row) => this.mapGrant(row)),
    };
  }

  async attachOrgGrant(
    serviceClientId: string,
    organizationId: string,
    audit: MasterAdminAuditContext,
  ): Promise<CoreAppServiceOrgGrantV1> {
    await this.assertClientExists(serviceClientId);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.coreAppServiceOrgGrant.upsert({
        where: {
          serviceClientId_organizationId: { serviceClientId, organizationId },
        },
        create: {
          serviceClientId,
          organizationId,
          status: CoreAppServiceGrantStatus.REVOKED,
          grantVersion: 1,
        },
        update: {},
        include: { serviceClient: { select: { clientId: true } } },
      });
      const mapped = this.mapGrant(grant);
      await persistCoreAppServiceClientAuditTx(
        tx,
        this.auditPayload(audit, {
          description: `Attached org grant for client ${grant.serviceClient.clientId}`,
          entityId: grant.id,
          targetOrganizationId: organizationId,
          metadata: {
            domain: 'core_app_service_org_grant',
            action: 'attach',
            serviceClientId,
            organizationId,
            grantVersion: grant.grantVersion,
          },
          after: mapped,
        }),
      );
      return grant;
    });

    return this.mapGrant(row);
  }

  async updateOrgGrant(
    serviceClientId: string,
    organizationId: string,
    body: Record<string, unknown>,
    audit: MasterAdminAuditContext,
  ): Promise<CoreAppServiceOrgGrantV1> {
    const grant = await this.prisma.coreAppServiceOrgGrant.findUnique({
      where: {
        serviceClientId_organizationId: { serviceClientId, organizationId },
      },
      include: { serviceClient: { select: { clientId: true } } },
    });
    if (!grant) {
      throw new NotFoundException('Organization grant not found');
    }

    const statusRaw = String(body.status ?? '').toUpperCase();
    if (
      statusRaw !== CoreAppServiceGrantStatus.ACTIVE &&
      statusRaw !== CoreAppServiceGrantStatus.REVOKED
    ) {
      throw new BadRequestException('status is invalid');
    }
    const status = statusRaw as CoreAppServiceGrantStatus;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.coreAppServiceOrgGrant.update({
        where: { id: grant.id },
        data: {
          status,
          grantVersion: { increment: 1 },
        },
      });
      await persistCoreAppServiceClientAuditTx(
        tx,
        this.auditPayload(audit, {
          description: `Updated org grant (${status}) for client ${grant.serviceClient.clientId}`,
          entityId: updated.id,
          targetOrganizationId: organizationId,
          metadata: {
            domain: 'core_app_service_org_grant',
            action: status === CoreAppServiceGrantStatus.REVOKED ? 'revoke' : 'activate',
            serviceClientId,
            organizationId,
            grantVersion: updated.grantVersion,
          },
          before: this.mapGrant(grant),
          after: this.mapGrant(updated),
        }),
      );
      return updated;
    });

    return this.mapGrant(row);
  }

  private assertValidScopes(scopes: string[]): void {
    const invalid = validateCoreAppM2mScopeDefinitions(scopes);
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown scopes: ${invalid.join(', ')}`);
    }
  }

  private countActiveGrants(
    grants: { status: CoreAppServiceGrantStatus }[],
  ): number {
    return grants.filter((g) => g.status === CoreAppServiceGrantStatus.ACTIVE).length;
  }

  private async getClientRow(id: string) {
    const row = await this.prisma.coreAppServiceClient.findUnique({
      where: { id },
      include: { orgGrants: { select: { status: true } } },
    });
    if (!row) {
      throw new NotFoundException('Service client not found');
    }
    return row;
  }

  private async assertClientExists(serviceClientId: string): Promise<void> {
    const exists = await this.prisma.coreAppServiceClient.findUnique({
      where: { id: serviceClientId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Service client not found');
    }
  }

  private mapClient(
    row: {
      id: string;
      clientId: string;
      displayName: string;
      productSlug: ProductSlug;
      status: CoreAppServiceClientStatus;
      allowedScopes: string[];
      credentialVersion: number;
      createdAt: Date;
      updatedAt: Date;
    },
    activeGrantCount: number,
  ): CoreAppServiceClientDetailV1 {
    return {
      id: row.id,
      clientId: row.clientId,
      displayName: row.displayName,
      productSlug: row.productSlug,
      status: row.status,
      allowedScopes: [...row.allowedScopes],
      credentialVersion: row.credentialVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      activeGrantCount,
    };
  }

  private mapGrant(row: {
    id: string;
    organizationId: string;
    status: CoreAppServiceGrantStatus;
    grantVersion: number;
    createdAt: Date;
    updatedAt: Date;
  }): CoreAppServiceOrgGrantV1 {
    return {
      id: row.id,
      organizationId: row.organizationId,
      status: row.status,
      grantVersion: row.grantVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private auditPayload(
    audit: MasterAdminAuditContext,
    input: {
      description: string;
      entityId: string;
      targetOrganizationId?: string;
      metadata: Record<string, unknown>;
      before?: unknown;
      after?: unknown;
    },
  ) {
    return {
      auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
      actorUserId: audit.actorUserId,
      actorPlatformRole: 'MASTER_ADMIN',
      targetOrganizationId: input.targetOrganizationId ?? null,
      entityId: input.entityId,
      description: input.description,
      correlationId: audit.correlationId,
      route: audit.route,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      mfaStepUpAction: 'MASTER_API_KEYS',
      metadata: input.metadata,
      before: input.before,
      after: input.after,
    };
  }
}

function scopesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function fingerprintSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}