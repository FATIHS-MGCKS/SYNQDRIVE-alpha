import { Exp021StudyStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { Exp021CanaryCohortAuthority, Exp021CanaryCohortMember } from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { EXP021_SHORT_AB_PLAN_REGISTRY_KEYS } from './reference-capture-exp021-fleet-order-allocator.lib';
import type { ReferenceCaptureExp021FleetRepository } from './reference-capture-exp021-fleet.repository';

/** Production fleet study registry key (KS MX 2024 enrollment authority). */
export const EXP021_PRODUCTION_FLEET_STUDY_KEY = 'exp021-fleet-cadence-2026';

export const EXP021_COHORT_STUDY_ENROLLMENT_ALLOWED_PLANS: readonly string[] = [
  EXP021_SHORT_AB_PLAN_REGISTRY_KEYS.ORDER_90_60,
  EXP021_SHORT_AB_PLAN_REGISTRY_KEYS.ORDER_60_90,
];

export const EXP021_FLEET_STUDY_KEY_ENV = 'EXP021_FLEET_STUDY_KEY';

export class Exp021CohortStudyEnrollmentBootstrapError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'Exp021CohortStudyEnrollmentBootstrapError';
    this.code = code;
  }
}

export type Exp021CohortStudyEnrollmentBootstrapMemberResult = {
  vehicleId: string;
  tokenId: number;
  action: 'preserved' | 'created' | 'would_create';
  enrollmentId?: string;
};

export type Exp021CohortStudyEnrollmentBootstrapResult = {
  studyId: string;
  studyKey: string;
  execute: boolean;
  members: Exp021CohortStudyEnrollmentBootstrapMemberResult[];
};

type PrismaLike = PrismaService | Prisma.TransactionClient;

export function resolveExp021FleetStudyKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[EXP021_FLEET_STUDY_KEY_ENV]?.trim();
  return raw || EXP021_PRODUCTION_FLEET_STUDY_KEY;
}

export async function assertCohortMemberVehicleTokenBinding(
  prisma: PrismaLike,
  member: Exp021CanaryCohortMember,
): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: member.vehicleId },
    select: {
      organizationId: true,
      dimoVehicle: { select: { tokenId: true } },
    },
  });
  if (!vehicle) {
    throw new Exp021CohortStudyEnrollmentBootstrapError(
      'VEHICLE_NOT_FOUND',
      `Vehicle ${member.vehicleId} not found`,
    );
  }
  if (vehicle.organizationId !== member.organizationId) {
    throw new Exp021CohortStudyEnrollmentBootstrapError(
      'ORGANIZATION_BINDING_MISMATCH',
      `Vehicle ${member.vehicleId} organization does not match cohort member`,
    );
  }
  const boundTokenId = vehicle.dimoVehicle?.tokenId;
  if (boundTokenId !== member.tokenId) {
    throw new Exp021CohortStudyEnrollmentBootstrapError(
      'VEHICLE_TOKEN_BINDING_MISMATCH',
      `Vehicle ${member.vehicleId} DIMO token ${boundTokenId ?? 'null'} does not match cohort token ${member.tokenId}`,
    );
  }
}

async function ensureEnrollmentForMember(input: {
  tx: Prisma.TransactionClient;
  studyId: string;
  member: Exp021CanaryCohortMember;
  execute: boolean;
  enrolledBy?: string;
}): Promise<Exp021CohortStudyEnrollmentBootstrapMemberResult> {
  const { tx, studyId, member, execute, enrolledBy } = input;
  const lockKey = `exp021_cohort_study_enroll:${studyId}:${member.vehicleId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const existing = await tx.exp021StudyEnrollment.findUnique({
    where: {
      studyId_organizationId_vehicleId: {
        studyId,
        organizationId: member.organizationId,
        vehicleId: member.vehicleId,
      },
    },
  });

  if (existing) {
    if (existing.enrolledTokenId !== member.tokenId) {
      throw new Exp021CohortStudyEnrollmentBootstrapError(
        'EXISTING_ENROLLMENT_TOKEN_MISMATCH',
        `Enrollment ${existing.id} token ${existing.enrolledTokenId} does not match cohort ${member.tokenId}`,
      );
    }
    return {
      vehicleId: member.vehicleId,
      tokenId: member.tokenId,
      action: 'preserved',
      enrollmentId: existing.id,
    };
  }

  if (!execute) {
    return {
      vehicleId: member.vehicleId,
      tokenId: member.tokenId,
      action: 'would_create',
    };
  }

  try {
    const created = await tx.exp021StudyEnrollment.create({
      data: {
        studyId,
        organizationId: member.organizationId,
        vehicleId: member.vehicleId,
        enrolledTokenId: member.tokenId,
        allowedPlans: [...EXP021_COHORT_STUDY_ENROLLMENT_ALLOWED_PLANS],
        enrolledBy: enrolledBy ?? null,
        enabled: true,
      },
    });
    return {
      vehicleId: member.vehicleId,
      tokenId: member.tokenId,
      action: 'created',
      enrollmentId: created.id,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const raced = await tx.exp021StudyEnrollment.findUnique({
        where: {
          studyId_organizationId_vehicleId: {
            studyId,
            organizationId: member.organizationId,
            vehicleId: member.vehicleId,
          },
        },
      });
      if (raced && raced.enrolledTokenId === member.tokenId) {
        return {
          vehicleId: member.vehicleId,
          tokenId: member.tokenId,
          action: 'preserved',
          enrollmentId: raced.id,
        };
      }
    }
    throw error;
  }
}

export async function bootstrapExp021CohortStudyEnrollments(input: {
  prisma: PrismaService;
  fleetRepository: ReferenceCaptureExp021FleetRepository;
  cohort: Exp021CanaryCohortAuthority;
  studyKey: string;
  execute: boolean;
  enrolledBy?: string;
}): Promise<Exp021CohortStudyEnrollmentBootstrapResult> {
  const study = await input.fleetRepository.findStudyByKey(input.studyKey);
  if (!study) {
    throw new Exp021CohortStudyEnrollmentBootstrapError(
      'STUDY_NOT_FOUND',
      `Study ${input.studyKey} not found`,
    );
  }
  if (study.status !== Exp021StudyStatus.COLLECTING) {
    throw new Exp021CohortStudyEnrollmentBootstrapError(
      'STUDY_NOT_COLLECTING',
      `Study ${input.studyKey} status is ${study.status}`,
    );
  }

  for (const member of input.cohort.members) {
    await assertCohortMemberVehicleTokenBinding(input.prisma, member);
  }

  const members: Exp021CohortStudyEnrollmentBootstrapMemberResult[] = [];

  for (const member of input.cohort.members) {
    const maxAttempts = 5;
    let result: Exp021CohortStudyEnrollmentBootstrapMemberResult | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        result = await input.prisma.$transaction(
          async (tx) =>
            ensureEnrollmentForMember({
              tx,
              studyId: study.id,
              member,
              execute: input.execute,
              enrolledBy: input.enrolledBy,
            }),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error) {
        if (
          attempt < maxAttempts &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }
    if (!result) {
      throw new Exp021CohortStudyEnrollmentBootstrapError(
        'BOOTSTRAP_MEMBER_FAILED',
        `Bootstrap failed for vehicle ${member.vehicleId} after retries`,
      );
    }
    members.push(result);
  }

  return {
    studyId: study.id,
    studyKey: study.studyKey,
    execute: input.execute,
    members,
  };
}
