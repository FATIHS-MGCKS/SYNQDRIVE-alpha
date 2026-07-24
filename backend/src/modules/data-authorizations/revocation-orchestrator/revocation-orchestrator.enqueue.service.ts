import { Injectable } from '@nestjs/common';
import type { DataAuthorizationRevocationTriggerType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { buildRevocationIdempotencyKey } from './revocation-orchestrator.constants';
import { RevocationOrchestratorService } from './revocation-orchestrator.service';
import type { RevocationWorkflowRequest } from './revocation-orchestrator.types';

@Injectable()
export class RevocationOrchestratorEnqueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: RevocationOrchestratorService,
  ) {}

  async enqueueProcessingActivityRevoked(input: {
    organizationId: string;
    processingActivityId: string;
    versionNumber: number;
    actorUserId?: string | null;
    reason?: string | null;
    correlationId?: string;
  }) {
    const categories = await this.loadActivityCategories(input.processingActivityId);
    const purposes = await this.loadActivityPurposes(input.processingActivityId);
    return this.orchestrator.requestRevocation(
      this.buildRequest({
        organizationId: input.organizationId,
        triggerType: 'PROCESSING_ACTIVITY_REVOKED',
        entityId: input.processingActivityId,
        mutationVersion: input.versionNumber,
        processingActivityId: input.processingActivityId,
        dataCategories: categories,
        purposes,
        actorUserId: input.actorUserId,
        reason: input.reason,
        correlationId: input.correlationId,
      }),
    );
  }

  async enqueueEnforcementPolicyRevoked(input: {
    organizationId: string;
    enforcementPolicyId: string;
    processingActivityId?: string | null;
    versionNumber: number;
    actorUserId?: string | null;
    reason?: string | null;
    correlationId?: string;
  }) {
    const categories = input.processingActivityId
      ? await this.loadActivityCategories(input.processingActivityId)
      : await this.loadPolicyCategories(input.enforcementPolicyId);
    const purposes = input.processingActivityId
      ? await this.loadActivityPurposes(input.processingActivityId)
      : await this.loadPolicyPurposes(input.enforcementPolicyId);

    return this.orchestrator.requestRevocation(
      this.buildRequest({
        organizationId: input.organizationId,
        triggerType: 'ENFORCEMENT_POLICY_REVOKED',
        entityId: input.enforcementPolicyId,
        mutationVersion: input.versionNumber,
        enforcementPolicyId: input.enforcementPolicyId,
        processingActivityId: input.processingActivityId,
        dataCategories: categories,
        purposes,
        actorUserId: input.actorUserId,
        reason: input.reason,
        correlationId: input.correlationId,
      }),
    );
  }

  async enqueueLegacyOrgAuthRevoked(input: {
    organizationId: string;
    legacyOrgAuthId: string;
    dataCategories: string[];
    purposes: string[];
    actorUserId?: string | null;
    reason?: string | null;
    correlationId?: string;
  }) {
    return this.orchestrator.requestRevocation(
      this.buildRequest({
        organizationId: input.organizationId,
        triggerType: 'LEGACY_ORG_AUTH_REVOKED',
        entityId: input.legacyOrgAuthId,
        legacyOrgAuthId: input.legacyOrgAuthId,
        dataCategories: input.dataCategories,
        purposes: input.purposes,
        actorUserId: input.actorUserId,
        reason: input.reason,
        correlationId: input.correlationId,
      }),
    );
  }

  async enqueueConsentWithdrawn(input: {
    organizationId: string;
    consentId: string;
    processingActivityId: string;
    purpose: string;
    actorUserId?: string | null;
    reason?: string | null;
    correlationId?: string;
  }) {
    const categories = await this.loadActivityCategories(input.processingActivityId);
    return this.orchestrator.requestRevocation(
      this.buildRequest({
        organizationId: input.organizationId,
        triggerType: 'CONSENT_WITHDRAWN',
        entityId: input.consentId,
        consentId: input.consentId,
        processingActivityId: input.processingActivityId,
        dataCategories: categories.length > 0 ? categories : ['CUSTOMER_DATA'],
        purposes: [input.purpose],
        actorUserId: input.actorUserId,
        reason: input.reason,
        correlationId: input.correlationId,
      }),
    );
  }

  async enqueueProviderGrantRevoked(input: {
    organizationId: string;
    providerGrantId: string;
    vehicleId?: string | null;
    actorUserId?: string | null;
    reason?: string | null;
    correlationId?: string;
  }) {
    return this.orchestrator.requestRevocation(
      this.buildRequest({
        organizationId: input.organizationId,
        triggerType: 'PROVIDER_GRANT_REVOKED',
        entityId: input.providerGrantId,
        providerGrantId: input.providerGrantId,
        vehicleIds: input.vehicleId ? [input.vehicleId] : undefined,
        dataCategories: ['TELEMETRY_RAW'],
        purposes: ['TELEMETRY_INGEST'],
        actorUserId: input.actorUserId,
        reason: input.reason,
        correlationId: input.correlationId,
      }),
    );
  }

  async enqueueDataSharingRevoked(input: {
    organizationId: string;
    dataSharingAuthId: string;
    processingActivityId: string;
    dataCategories: string[];
    purpose: string;
    actorUserId?: string | null;
    reason?: string | null;
    correlationId?: string;
  }) {
    return this.orchestrator.requestRevocation(
      this.buildRequest({
        organizationId: input.organizationId,
        triggerType: 'DATA_SHARING_REVOKED',
        entityId: input.dataSharingAuthId,
        dataSharingAuthId: input.dataSharingAuthId,
        processingActivityId: input.processingActivityId,
        dataCategories: input.dataCategories,
        purposes: [input.purpose],
        actorUserId: input.actorUserId,
        reason: input.reason,
        correlationId: input.correlationId,
      }),
    );
  }

  private buildRequest(
    input: Omit<RevocationWorkflowRequest, 'correlationId' | 'idempotencyKey'> & {
      correlationId?: string;
    },
  ): RevocationWorkflowRequest {
    const correlationId = input.correlationId ?? randomUUID();
    const idempotencyKey = buildRevocationIdempotencyKey({
      organizationId: input.organizationId,
      triggerType: input.triggerType,
      entityId: input.entityId,
      mutationVersion: input.mutationVersion,
    });
    return { ...input, correlationId, idempotencyKey };
  }

  private async loadActivityCategories(processingActivityId: string): Promise<string[]> {
    const rows = await this.prisma.processingActivityCategory.findMany({
      where: { processingActivityId },
      select: { dataCategory: true },
    });
    return rows.map((r) => r.dataCategory);
  }

  private async loadActivityPurposes(processingActivityId: string): Promise<string[]> {
    const rows = await this.prisma.processingActivityPurpose.findMany({
      where: { processingActivityId },
      select: { purpose: true },
    });
    return rows.map((r) => r.purpose);
  }

  private async loadPolicyCategories(enforcementPolicyId: string): Promise<string[]> {
    const policy = await this.prisma.enforcementPolicy.findUnique({
      where: { id: enforcementPolicyId },
      select: { dataCategory: true },
    });
    return policy ? [policy.dataCategory] : [];
  }

  private async loadPolicyPurposes(enforcementPolicyId: string): Promise<string[]> {
    const policy = await this.prisma.enforcementPolicy.findUnique({
      where: { id: enforcementPolicyId },
      select: { processingPurpose: true },
    });
    return policy ? [policy.processingPurpose] : [];
  }
}
