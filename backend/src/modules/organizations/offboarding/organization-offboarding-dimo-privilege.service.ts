import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  OrganizationStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { acquirePgAdvisoryXactLock } from '@shared/database/pg-advisory-lock.util';
import { OrganizationOffboardingDimoLiveDisconnectAdapter } from './organization-offboarding-dimo-live-disconnect.adapter';
import {
  DIMO_OWNER_HANDOFF_MAX_RECORDS,
  isDimoPrivilegeRecheckEnabled,
} from './organization-offboarding-dimo-privilege.policy';
import type {
  DimoOwnerHandoffRecord,
  OrganizationDimoOwnerHandoffRequest,
  OrganizationDimoOwnerHandoffResult,
  OrganizationDimoPrivilegeRecheckResult,
  OrganizationDimoPrivilegeStatusDto,
} from './organization-offboarding-dimo-privilege.types';
import {
  buildVerificationSnapshotReference,
  buildVehiclePrivilegeRows,
  extractPrivilegedSnapshot,
  mapPrivilegeReadToProviderCheckStatus,
  stillPrivilegedTokenIdsFromLiveResult,
  summarizeProviderEvidence,
  type OrgDimoVehicleInventoryRow,
} from './organization-offboarding-dimo-privilege.util';
import {
  ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES,
} from './organization-offboard-preflight.reason-codes';
import { persistDimoOwnerHandoffUnderLock, persistDimoPrivilegeVerificationUnderLock } from './organization-offboarding-dimo-progress-persist';
import { parseExecutionProgress } from './organization-offboarding-execution.progress';

function organizationOffboardingDimoHandoffLockKey(organizationId: string): string {
  return `organization-offboarding-dimo-handoff:${organizationId}`;
}

@Injectable()
export class OrganizationOffboardingDimoPrivilegeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoLive: OrganizationOffboardingDimoLiveDisconnectAdapter,
    private readonly masterAudit: MasterAdminAuditService,
  ) {}

  async getDimoPrivilegeStatus(organizationId: string): Promise<OrganizationDimoPrivilegeStatusDto> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const job = await this.prisma.organizationOffboardingJob.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, phase: true, progressJson: true },
    });

    const progress = parseExecutionProgress(job?.progressJson);
    const snapshot = extractPrivilegedSnapshot(progress);
    const inventory = await this.loadOrgDimoInventory(organizationId);
    const vehicles = buildVehiclePrivilegeRows(inventory, snapshot);

    return {
      organizationId,
      jobId: job?.id ?? null,
      jobStatus: job?.status ?? null,
      phase: job?.phase ?? null,
      lastVerifiedAt: snapshot.lastVerifiedAt,
      providerCheckStatus: snapshot.providerCheckStatus,
      finalizationState: progress.providerQuiesce?.finalizationState ?? null,
      detailCode: snapshot.detailCode,
      vehicles,
    };
  }

  async recheckDimoPrivileges(
    organizationId: string,
    actorUserId: string | null,
  ): Promise<OrganizationDimoPrivilegeRecheckResult> {
    if (!actorUserId) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_OFFBOARDING_DIMO_RECHECK_ACTOR_REQUIRED',
        message: 'Authenticated master admin actor is required',
      });
    }

    const { job, orgStatus } = await this.assertActiveOffboardingContext(organizationId);
    const inventory = await this.loadOrgDimoInventory(organizationId);
    const progressBefore = parseExecutionProgress(job.progressJson);
    const previousSnapshot = extractPrivilegedSnapshot(progressBefore);

    if (!isDimoPrivilegeRecheckEnabled()) {
      const vehicles = buildVehiclePrivilegeRows(inventory, previousSnapshot);
      return {
        organizationId,
        jobId: job.id,
        providerCheckStatus: 'NOT_AVAILABLE',
        detailCode: 'DIMO_PRIVILEGE_RECHECK_NOT_ARMED',
        lastVerifiedAt: previousSnapshot.lastVerifiedAt ?? new Date().toISOString(),
        verificationSnapshotReference:
          progressBefore.dimoPrivilegeVerification?.verificationSnapshotReference ??
          `dimo-privilege-recheck:not-armed:${job.id}`,
        vehicles,
        evidencePreserved: true,
      };
    }

    const live = await this.dimoLive.verifyOrganizationPrivilegedReadOnly(organizationId);
    const providerCheckStatus = mapPrivilegeReadToProviderCheckStatus(live);
    const stillActive = stillPrivilegedTokenIdsFromLiveResult(live);
    const identityFailed = providerCheckStatus === 'NOT_AVAILABLE' || providerCheckStatus === 'NOT_VERIFIED';

    if (identityFailed && progressBefore.dimoPrivilegeVerification) {
      const vehicles = buildVehiclePrivilegeRows(inventory, previousSnapshot);
      return {
        organizationId,
        jobId: job.id,
        providerCheckStatus: 'NOT_AVAILABLE',
        detailCode: live.detailCode ?? 'DIMO_EXTERNAL_VERIFY_IDENTITY_UNAVAILABLE',
        lastVerifiedAt: progressBefore.dimoPrivilegeVerification.lastVerifiedAt,
        verificationSnapshotReference: progressBefore.dimoPrivilegeVerification.verificationSnapshotReference,
        vehicles,
        evidencePreserved: true,
      };
    }

    const verifiedAt = live.providerEvidence.attemptedAt;
    const verificationSnapshotReference = buildVerificationSnapshotReference(job.id, verifiedAt, stillActive);

    const verificationBlock = {
      lastVerifiedAt: verifiedAt,
      providerCheckStatus,
      detailCode: live.detailCode,
      verificationSnapshotReference,
      privilegedStillActiveTokenIds: stillActive,
      providerEvidenceSummary: summarizeProviderEvidence(live),
    };

    const persisted = await persistDimoPrivilegeVerificationUnderLock(this.prisma, {
      organizationId,
      jobId: job.id,
      verification: verificationBlock,
    });

    const effective = persisted.effectiveVerification;
    const evidencePreserved = !persisted.verificationApplied;
    const responseStatus = effective.providerCheckStatus as OrganizationDimoPrivilegeRecheckResult['providerCheckStatus'];
    const responseDetail = effective.detailCode;
    const responseVerifiedAt = effective.lastVerifiedAt;
    const responseSnapshotRef = effective.verificationSnapshotReference;
    const responseStillActive = effective.privilegedStillActiveTokenIds;

    void this.masterAudit.record({
      auditAction: MasterAdminAuditAction.ORGANIZATION_OFFBOARDING_DIMO_PRIVILEGE_RECHECK,
      actorUserId,
      targetOrganizationId: organizationId,
      entityId: job.id,
      description: 'Master admin DIMO privilege read-only recheck for organization offboarding',
      correlationId: job.id,
      route: `/admin/organizations/${organizationId}/offboarding/dimo-privilege-recheck`,
      httpMethod: 'POST',
      metadata: {
        organizationStatus: orgStatus,
        providerCheckStatus: responseStatus,
        detailCode: responseDetail,
        evidencePreserved,
        privilegedStillActiveCount: responseStillActive.length,
        staleRecheckRejected: evidencePreserved,
      },
    });

    const vehicles = buildVehiclePrivilegeRows(inventory, {
      stillPrivilegedTokenIds: responseStillActive,
      providerCheckStatus: responseStatus,
    });

    return {
      organizationId,
      jobId: job.id,
      providerCheckStatus: responseStatus,
      detailCode: responseDetail,
      lastVerifiedAt: responseVerifiedAt,
      verificationSnapshotReference: responseSnapshotRef,
      vehicles,
      evidencePreserved,
    };
  }

  async recordDimoOwnerHandoff(
    organizationId: string,
    request: OrganizationDimoOwnerHandoffRequest,
    actorUserId: string | null,
  ): Promise<OrganizationDimoOwnerHandoffResult> {
    if (!actorUserId) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_OFFBOARDING_DIMO_HANDOFF_ACTOR_REQUIRED',
        message: 'Authenticated master admin actor is required',
      });
    }

    const inventory = await this.loadOrgDimoInventory(organizationId);
    const inventoryIds = new Set(inventory.map((v) => v.vehicleId));
    const affectedVehicleIds =
      request.vehicleIds?.length
        ? request.vehicleIds
        : inventory.map((v) => v.vehicleId);

    for (const vehicleId of affectedVehicleIds) {
      if (!inventoryIds.has(vehicleId)) {
        throw new BadRequestException({
          code: 'ORGANIZATION_OFFBOARDING_DIMO_HANDOFF_VEHICLE_OUT_OF_SCOPE',
          message: `Vehicle ${vehicleId} is not in organization DIMO inventory`,
        });
      }
    }

    const correlationId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock(tx, organizationOffboardingDimoHandoffLockKey(organizationId));

      const job = await tx.organizationOffboardingJob.findFirst({
        where: {
          organizationId,
          status: { in: [...ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, correlationId: true },
      });
      if (!job) {
        throw new ConflictException({
          code: 'ORGANIZATION_OFFBOARDING_DIMO_HANDOFF_JOB_REQUIRED',
          message: 'Active organization offboarding job is required for DIMO owner handoff recording',
        });
      }

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { status: true },
      });
      if (!org || org.status !== OrganizationStatus.SUSPENDED) {
        throw new ConflictException({
          code: 'ORGANIZATION_OFFBOARDING_DIMO_HANDOFF_ORG_SUSPENDED_REQUIRED',
          message: 'Organization must be SUSPENDED with an active offboarding job',
        });
      }

      const handoff = {
        handoffId: randomUUID(),
        requestedAt: new Date().toISOString(),
        requestedByUserId: actorUserId,
        organizationId,
        jobId: job.id,
        idempotencyKey: request.idempotencyKey,
        affectedVehicleIds,
        verificationSnapshotReference: null,
        status: 'RECORDED' as const,
      };

      let idempotentReplay = false;
      let replayHandoff: DimoOwnerHandoffRecord = handoff;
      let mergedHandoffs: DimoOwnerHandoffRecord[] = [];

      const persisted = await persistDimoOwnerHandoffUnderLock(tx, {
        organizationId,
        jobId: job.id,
        appendHandoff: handoff,
        maxRecords: DIMO_OWNER_HANDOFF_MAX_RECORDS,
        onDuplicateIdempotency: (existing) => {
          idempotentReplay = true;
          replayHandoff = existing;
        },
      });
      mergedHandoffs = persisted.handoffs;
      if (idempotentReplay) {
        return {
          handoff: replayHandoff,
          idempotentReplay: true,
          handoffsRecorded: mergedHandoffs.length,
        };
      }

      await tx.activityLog.create({
        data: {
          organizationId,
          userId: actorUserId,
          action: ActivityAction.UPDATE,
          entity: ActivityEntity.ADMIN_OPERATION,
          entityId: job.id,
          description: 'DIMO owner handoff recorded (internal operator action; not external delivery proof)',
          metaJson: {
            auditDomain: 'MASTER_ADMIN',
            auditAction: MasterAdminAuditAction.ORGANIZATION_OFFBOARDING_DIMO_OWNER_HANDOFF,
            correlationId,
            handoffId: handoff.handoffId,
            idempotencyKey: request.idempotencyKey,
            affectedVehicleCount: affectedVehicleIds.length,
            verificationSnapshotReference: handoff.verificationSnapshotReference,
            status: handoff.status,
          },
        },
      });

      void this.masterAudit.record({
        auditAction: MasterAdminAuditAction.ORGANIZATION_OFFBOARDING_DIMO_OWNER_HANDOFF,
        actorUserId,
        targetOrganizationId: organizationId,
        entityId: job.id,
        description: 'Recorded internal DIMO owner-revocation handoff request (not delivery confirmation)',
        correlationId,
        route: `/admin/organizations/${organizationId}/offboarding/dimo-owner-handoff`,
        httpMethod: 'POST',
        metadata: {
          handoffId: handoff.handoffId,
          idempotencyKey: request.idempotencyKey,
          affectedVehicleIds,
          verificationSnapshotReference: handoff.verificationSnapshotReference,
        },
      });

      return {
        handoff: persisted.handoffs[persisted.handoffs.length - 1] ?? handoff,
        idempotentReplay: false,
        handoffsRecorded: mergedHandoffs.length,
      };
    });
  }

  private async assertActiveOffboardingContext(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, status: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    if (org.status !== OrganizationStatus.SUSPENDED) {
      throw new ConflictException({
        code: 'ORGANIZATION_OFFBOARDING_DIMO_RECHECK_ORG_SUSPENDED_REQUIRED',
        message: 'Organization must be SUSPENDED for DIMO privilege recheck',
      });
    }

    const job = await this.prisma.organizationOffboardingJob.findFirst({
      where: {
        organizationId,
        status: { in: [...ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) {
      throw new ConflictException({
        code: 'ORGANIZATION_OFFBOARDING_DIMO_RECHECK_JOB_REQUIRED',
        message: 'Active organization offboarding job is required',
      });
    }

    return { job, orgStatus: org.status };
  }

  private async loadOrgDimoInventory(organizationId: string): Promise<OrgDimoVehicleInventoryRow[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: { organizationId, dimoVehicleId: { not: null } },
      select: {
        id: true,
        dimoVehicle: { select: { tokenId: true, connectionStatus: true } },
        providerConsents: {
          where: { provider: 'DIMO' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    });

    return rows.map((row) => ({
      vehicleId: row.id,
      tokenId: row.dimoVehicle?.tokenId ?? null,
      localConnectionStatus: row.dimoVehicle?.connectionStatus ?? null,
      consentStatus: row.providerConsents[0]?.status ?? null,
    }));
  }
}