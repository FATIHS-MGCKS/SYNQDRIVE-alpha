import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationOffboardingJobStatus, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import {
  acquirePgAdvisoryXactLock,
  organizationOffboardingPrepareLockKey,
} from '@shared/database/pg-advisory-lock.util';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { OrganizationOffboardPreflightService } from './organization-offboard-preflight.service';
import { fingerprintOffboardingPrepareRequest } from './organization-offboarding.fingerprint';
import type {
  OrganizationOffboardPrepareRequest,
  OrganizationOffboardPreflightSnapshot,
  OrganizationOffboardingJobView,
} from './organization-offboarding.types';
import {
  ORGANIZATION_OFFBOARDING_ACTIVE_JOB_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_IDEMPOTENCY_CONFLICT_CODE,
  ORGANIZATION_OFFBOARDING_PREFLIGHT_BLOCKED_CODE,
} from './organization-offboarding.types';
import { ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES } from './organization-offboard-preflight.reason-codes';

function toJobView(
  row: {
    id: string;
    organizationId: string;
    idempotencyKey: string;
    status: OrganizationOffboardingJobStatus;
    phase: string;
    correlationId: string;
    requestedByUserId: string | null;
    requestedAt: Date;
    completedAt: Date | null;
    lastErrorCode: string | null;
    preflightSnapshot: unknown;
  },
  idempotentReplay: boolean,
): OrganizationOffboardingJobView {
  return {
    jobId: row.id,
    organizationId: row.organizationId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    phase: row.phase,
    correlationId: row.correlationId,
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    preflight: row.preflightSnapshot as OrganizationOffboardPreflightSnapshot | null,
    idempotentReplay,
  };
}

@Injectable()
export class OrganizationOffboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preflight: OrganizationOffboardPreflightService,
    private readonly masterAudit: MasterAdminAuditService,
  ) {}

  async getPreflight(organizationId: string): Promise<OrganizationOffboardPreflightSnapshot> {
    return this.preflight.assess(organizationId);
  }

  async getLatestJob(organizationId: string): Promise<OrganizationOffboardingJobView | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    const row = await this.prisma.organizationOffboardingJob.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return toJobView(row, false);
  }

  async prepare(
    organizationId: string,
    request: OrganizationOffboardPrepareRequest,
    actorUserId: string | null,
  ): Promise<OrganizationOffboardingJobView> {
    const idempotencyKey = request.idempotencyKey;
    const fingerprint = fingerprintOffboardingPrepareRequest(request);
    const snapshot = await this.preflight.assess(organizationId);

    const existingByKey = await this.prisma.organizationOffboardingJob.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey },
      },
    });
    if (existingByKey) {
      if (existingByKey.requestFingerprint !== fingerprint) {
        throw new ConflictException({
          code: ORGANIZATION_OFFBOARDING_IDEMPOTENCY_CONFLICT_CODE,
          message: 'Idempotency key already used with a different request payload',
        });
      }
      return toJobView(existingByKey, true);
    }

    if (snapshot.hardBlockers.length > 0) {
      const denialCorrelationId = randomUUID();
      void this.masterAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
        actorUserId: actorUserId ?? undefined,
        targetOrganizationId: organizationId,
        entityId: organizationId,
        correlationId: denialCorrelationId,
        description: 'Organization offboarding prepare denied (preflight blocked)',
        reasonCode: ORGANIZATION_OFFBOARDING_PREFLIGHT_BLOCKED_CODE,
        route: 'POST /admin/organizations/:organizationId/offboarding/prepare',
        httpMethod: 'POST',
        httpStatus: 409,
        metadata: {
          hardBlockerCount: snapshot.hardBlockers.length,
          hardBlockers: snapshot.hardBlockers,
          organizationStatus: snapshot.organizationStatus,
          idempotencyKeyPresent: true,
        },
        level: 'WARN',
      });
      throw new ConflictException({
        code: ORGANIZATION_OFFBOARDING_PREFLIGHT_BLOCKED_CODE,
        message: 'Organization offboarding preflight blocked',
        hardBlockers: snapshot.hardBlockers,
        preflight: snapshot,
        correlationId: denialCorrelationId,
      });
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await acquirePgAdvisoryXactLock(
          tx,
          organizationOffboardingPrepareLockKey(organizationId),
        );

        const replay = await tx.organizationOffboardingJob.findUnique({
          where: {
            organizationId_idempotencyKey: { organizationId, idempotencyKey },
          },
        });
        if (replay) {
          if (replay.requestFingerprint !== fingerprint) {
            throw new ConflictException({
              code: ORGANIZATION_OFFBOARDING_IDEMPOTENCY_CONFLICT_CODE,
              message: 'Idempotency key already used with a different request payload',
            });
          }
          return { row: replay, replay: true as const };
        }

        const conflicting = await tx.organizationOffboardingJob.findFirst({
          where: {
            organizationId,
            status: { in: [...ORGANIZATION_OFFBOARDING_ACTIVE_JOB_STATUSES] },
          },
        });
        if (conflicting) {
          throw new ConflictException({
            code: ORGANIZATION_OFFBOARDING_ACTIVE_JOB_CONFLICT_CODE,
            message: 'An active organization offboarding job already exists',
            existingJobId: conflicting.id,
          });
        }

        const row = await tx.organizationOffboardingJob.create({
          data: {
            organizationId,
            idempotencyKey,
            requestFingerprint: fingerprint,
            status: OrganizationOffboardingJobStatus.PREPARED,
            phase: 'PREPARE',
            correlationId: randomUUID(),
            requestedByUserId: actorUserId,
            preflightSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            progressJson: {
              notePresent: Boolean(request.note?.trim()),
            } satisfies Prisma.InputJsonValue,
          },
        });
        return { row, replay: false as const };
      });

      if (!created.replay) {
        void this.masterAudit.record({
          auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
          actorUserId: actorUserId ?? undefined,
          targetOrganizationId: organizationId,
          entityId: created.row.id,
          correlationId: created.row.correlationId,
          description: 'Organization offboarding prepare job created',
          reasonCode: 'ORG_OFFBOARDING_PREPARE_PREPARED',
          route: 'POST /admin/organizations/:organizationId/offboarding/prepare',
          httpMethod: 'POST',
          httpStatus: 201,
          metadata: {
            jobId: created.row.id,
            jobStatus: created.row.status,
            idempotencyKeyLength: idempotencyKey.length,
            notePresent: Boolean(request.note?.trim()),
          },
          level: 'INFO',
        });
      }

      return toJobView(created.row, created.replay);
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        const row = await this.prisma.organizationOffboardingJob.findUnique({
          where: {
            organizationId_idempotencyKey: { organizationId, idempotencyKey },
          },
        });
        if (row) {
          if (row.requestFingerprint !== fingerprint) {
            throw new ConflictException({
              code: ORGANIZATION_OFFBOARDING_IDEMPOTENCY_CONFLICT_CODE,
              message: 'Idempotency key already used with a different request payload',
            });
          }
          return toJobView(row, true);
        }
      }
      throw error;
    }
  }
}