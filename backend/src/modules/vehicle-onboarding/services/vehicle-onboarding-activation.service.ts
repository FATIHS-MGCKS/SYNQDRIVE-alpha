import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { Prisma, type VehicleOnboardingCase } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import { DimoVehicleDataSourceLinkService } from '@modules/dimo/dimo-vehicle-data-source-link.service';
import type { VehicleActivatedOutboxPayloadV1 } from '../contracts/activation-outbox-payload.v1';
import { ACTIVATION_OUTBOX_PAYLOAD_VERSION } from '../contracts/vo-document-versions';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { resolveActivationVehicleFields } from '../policy/activation-field-resolution';
import { assertCompositeVinConsistencyForActivation } from '../policy/composite-vin-consistency';
import {
  parseValidatedAdminDraft,
  parseValidatedIdentityDraft,
} from '../policy/persisted-contract.validation';
import { assertSupportedActivationSourceSet } from '../policy/source-set-invariant';
import type { VehicleOnboardingReadinessAuthority } from '../readiness/vehicle-onboarding-readiness-authority';
import { VEHICLE_ONBOARDING_READINESS_AUTHORITY } from '../readiness/vehicle-onboarding-readiness.tokens';
import {
  materializeDimoConsentIdempotent,
  materializeHmConsentIdempotent,
} from './vehicle-onboarding-consent.writer';
import { insertActivatedVehicleRow } from './vehicle-onboarding-activation.persistence';
import { appendHmCanonicalRegistrationHistoryIfNeeded } from './hm-canonical-activation.binding';
import {
  logActivationAttempt,
  logActivationConflict,
  logActivationRollback,
  logActivationSuccess,
} from './vehicle-onboarding-observability';

/** Integration-test fault injection only (not used in production HTTP). */
export type Vo3ActivationFaultStage =
  | 'AFTER_VEHICLE_CREATE'
  | 'AFTER_ORG_ASSIGNMENT'
  | 'AFTER_PROVIDER_LINK'
  | 'AFTER_MIRROR_UPDATE'
  | 'BEFORE_OUTBOX';

export interface ActivateVehicleInput {
  organizationId: string;
  onboardingCaseId: string;
  actorUserId: string | null;
  faultAfterStage?: Vo3ActivationFaultStage;
}

export interface ActivateVehicleResult {
  case: VehicleOnboardingCase;
  vehicleId: string;
  created: boolean;
}

function activationLockKey(caseId: string): string {
  return `vehicle-onboarding-activation:${caseId}`;
}

export function activationOutboxIdempotencyKey(caseId: string): string {
  return `vehicle-onboarding:VEHICLE_ACTIVATED:v1:${caseId}`;
}

@Injectable()
export class VehicleOnboardingActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoLinkService: DimoVehicleDataSourceLinkService,
    @Inject(VEHICLE_ONBOARDING_READINESS_AUTHORITY)
    private readonly readinessAuthority: VehicleOnboardingReadinessAuthority,
  ) {}

  async activateVehicle(input: ActivateVehicleInput): Promise<ActivateVehicleResult> {
    logActivationAttempt(input.onboardingCaseId, input.organizationId);

    const existingCompleted = await this.prisma.vehicleOnboardingCase.findFirst({
      where: {
        id: input.onboardingCaseId,
        organizationId: input.organizationId,
        status: 'COMPLETED',
      },
    });
    if (existingCompleted?.vehicleId) {
      return {
        case: existingCompleted,
        vehicleId: existingCompleted.vehicleId,
        created: false,
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, activationLockKey(input.onboardingCaseId));

        const caseRow = await tx.vehicleOnboardingCase.findFirst({
          where: { id: input.onboardingCaseId, organizationId: input.organizationId },
          include: { sourceRefs: true },
        });
        if (!caseRow) {
          throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found');
        }
        if (caseRow.status === 'COMPLETED' && caseRow.vehicleId) {
          return { case: caseRow, vehicleId: caseRow.vehicleId, created: false };
        }

        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: input.organizationId },
        });
        this.readinessAuthority.assertReadyForActivation(caseRow, {
          sourceRefs: caseRow.sourceRefs,
          organization,
        });
        if (caseRow.vehicleId) {
          throw new VehicleOnboardingError(
            'ACTIVATION_PRECONDITION_FAILED',
            'Case already bound to vehicle but not completed',
          );
        }

        const canonicalIdentity = parseValidatedIdentityDraft(caseRow);
        const adminDraft = parseValidatedAdminDraft(caseRow);
        assertCompositeVinConsistencyForActivation(canonicalIdentity, caseRow.sourceRefs);
        const { dimoRefs, hmRefs } = assertSupportedActivationSourceSet(caseRow.sourceRefs);
        const dimoRef = dimoRefs[0] ?? null;
        const hmRef = hmRefs[0] ?? null;

        const fields = resolveActivationVehicleFields(canonicalIdentity, adminDraft);

        if (fields.vin) {
          const vinConflict = await tx.vehicle.findFirst({
            where: { organizationId: input.organizationId, vin: fields.vin },
            select: { id: true },
          });
          if (vinConflict) {
            logActivationConflict(input.onboardingCaseId, 'VIN_CONFLICT_REQUIRES_IDENTITY_REVIEW');
            throw new VehicleOnboardingError(
              'VIN_CONFLICT_REQUIRES_IDENTITY_REVIEW',
              'VIN already registered in organization',
            );
          }
        }

        const activatedAt = new Date();
        const dimoVehicleId: string | null = dimoRef?.sourceMirrorId ?? null;

        const vehicleId = await insertActivatedVehicleRow(tx, {
          organizationId: input.organizationId,
          fields,
          dimoVehicleId,
        });
        const vehicle = { id: vehicleId };

        if (input.faultAfterStage === 'AFTER_VEHICLE_CREATE') {
          logActivationRollback(input.onboardingCaseId, input.faultAfterStage);
          throw new Error('VO3_FAULT_INJECTION');
        }

        await tx.vehicleOrganizationAssignment.create({
          data: {
            id: randomUUID(),
            vehicleId: vehicle.id,
            organizationId: input.organizationId,
            validFrom: activatedAt,
            assignmentReason: 'INITIAL_ONBOARDING',
            assignmentSource: 'VEHICLE_ONBOARDING',
            actorUserId: input.actorUserId,
          },
        });

        if (input.faultAfterStage === 'AFTER_ORG_ASSIGNMENT') {
          logActivationRollback(input.onboardingCaseId, input.faultAfterStage);
          throw new Error('VO3_FAULT_INJECTION');
        }

        if (fields.licensePlate) {
          await tx.vehicleLicensePlateAssignment.create({
            data: {
              id: randomUUID(),
              vehicleId: vehicle.id,
              plate: fields.licensePlate,
              validFrom: activatedAt,
              source: 'VEHICLE_ONBOARDING',
              actorUserId: input.actorUserId,
            },
          });
        }

        if (dimoRef && dimoVehicleId) {
          const dimoVehicle = await tx.dimoVehicle.findUnique({
            where: { id: dimoVehicleId },
            select: { externalId: true },
          });
          const dimoConsentId = await materializeDimoConsentIdempotent(tx, {
            vehicleId: vehicle.id,
            organizationId: input.organizationId,
            dimoExternalId: dimoVehicle?.externalId ?? null,
            grantedByUserId: input.actorUserId,
          });

          const linkResult = await this.dimoLinkService.ensureDimoVehicleDataSourceLink(
            {
              organizationId: input.organizationId,
              vehicleId: vehicle.id,
              dimoVehicleId,
              consentId: dimoConsentId,
              linkedByUserId: input.actorUserId,
              provenance: 'registration',
            },
            tx,
          );
          if (linkResult.action === 'CONFLICT') {
            throw new VehicleOnboardingError(
              'PROVIDER_LINK_CONFLICT',
              linkResult.reason ?? 'DIMO link conflict',
            );
          }

          if (input.faultAfterStage === 'AFTER_PROVIDER_LINK') {
            logActivationRollback(input.onboardingCaseId, input.faultAfterStage);
            throw new Error('VO3_FAULT_INJECTION');
          }
        }

        if (hmRef?.sourceMirrorId) {
          const hm = await tx.highMobilityVehicle.findUnique({
            where: { id: hmRef.sourceMirrorId },
          });
          if (!hm) {
            throw new VehicleOnboardingError('ACTIVATION_PRECONDITION_FAILED', 'HM mirror missing');
          }
          if (
            hm.registrationState === 'REGISTERED' &&
            hm.synqdriveVehicleId &&
            hm.synqdriveVehicleId !== vehicle.id
          ) {
            throw new VehicleOnboardingError('HM_ALREADY_REGISTERED', 'HM vehicle already registered');
          }

          const hmConsentId = await materializeHmConsentIdempotent(tx, {
            vehicleId: vehicle.id,
            organizationId: input.organizationId,
            hmVehicleId: hm.id,
            hmVin: hm.vin,
            appContainerType: hm.appContainerType,
            grantedByUserId: input.actorUserId,
            clearanceStatus: hm.clearanceStatus,
          });

          const subtype = hm.sourceMode === 'HM_ONLY' ? 'HM_ONLY' : 'HM_HEALTH';
          const existingHmLink = await tx.vehicleDataSourceLink.findFirst({
            where: {
              vehicleId: vehicle.id,
              sourceType: 'HIGH_MOBILITY',
              sourceSubtype: subtype,
              isActive: true,
            },
          });
          if (!existingHmLink) {
            await tx.vehicleDataSourceLink.create({
              data: {
                vehicleId: vehicle.id,
                sourceType: 'HIGH_MOBILITY',
                sourceSubtype: subtype,
                sourceReferenceId: hm.id,
                consentId: hmConsentId,
                isActive: true,
                activatedAt: activatedAt,
                metadata: {
                  packageType: hm.packageType,
                  sourceMode: hm.sourceMode,
                  canonicalOnboarding: true,
                },
              },
            });
          } else if (!existingHmLink.consentId) {
            await tx.vehicleDataSourceLink.update({
              where: { id: existingHmLink.id },
              data: { consentId: hmConsentId },
            });
          } else if (existingHmLink.consentId !== hmConsentId) {
            throw new VehicleOnboardingError(
              'PROVIDER_LINK_CONFLICT',
              'HM link consent association conflict',
            );
          }

          if (input.faultAfterStage === 'AFTER_PROVIDER_LINK') {
            logActivationRollback(input.onboardingCaseId, input.faultAfterStage);
            throw new Error('VO3_FAULT_INJECTION');
          }

          const priorRegistrationState = hm.registrationState;
          await tx.highMobilityVehicle.update({
            where: { id: hm.id },
            data: {
              synqdriveVehicleId: vehicle.id,
              isLinked: true,
              linkedAt: activatedAt,
              registrationState: 'REGISTERED',
              registeredAt: activatedAt,
            },
          });

          await appendHmCanonicalRegistrationHistoryIfNeeded(
            tx,
            { id: hm.id, registrationState: priorRegistrationState },
            vehicle.id,
            input.organizationId,
            activatedAt,
          );

          if (input.faultAfterStage === 'AFTER_MIRROR_UPDATE') {
            logActivationRollback(input.onboardingCaseId, input.faultAfterStage);
            throw new Error('VO3_FAULT_INJECTION');
          }
        }

        const providers = [...new Set(caseRow.sourceRefs.map((r) => r.provider))];
        const payload: VehicleActivatedOutboxPayloadV1 = {
          version: ACTIVATION_OUTBOX_PAYLOAD_VERSION,
          vehicleId: vehicle.id,
          organizationId: input.organizationId,
          onboardingCaseId: caseRow.id,
          registryLifecycle: 'ACTIVE',
          activatedAt: activatedAt.toISOString(),
          sourceProviders: providers,
        };

        if (input.faultAfterStage === 'BEFORE_OUTBOX') {
          logActivationRollback(input.onboardingCaseId, input.faultAfterStage);
          throw new Error('VO3_FAULT_INJECTION');
        }

        await this.ensureActivationOutboxEvent(tx, {
          idempotencyKey: activationOutboxIdempotencyKey(caseRow.id),
          payload,
          vehicleId: vehicle.id,
          organizationId: input.organizationId,
          onboardingCaseId: caseRow.id,
          activatedAt,
        });

        const completed = await tx.vehicleOnboardingCase.update({
          where: { id: caseRow.id },
          data: {
            status: 'COMPLETED',
            vehicleId: vehicle.id,
            completedAt: activatedAt,
            lastActorUserId: input.actorUserId,
          },
        });

        logActivationSuccess(caseRow.id, vehicle.id);
        return { case: completed, vehicleId: vehicle.id, created: true };
      });
    } catch (error) {
      if (error instanceof VehicleOnboardingError) {
        throw error;
      }
      if (isPrismaUniqueViolation(error, ['vin', 'organizationId'])) {
        throw new VehicleOnboardingError(
          'VIN_CONFLICT_REQUIRES_IDENTITY_REVIEW',
          'VIN already registered in organization',
        );
      }
      throw error;
    }
  }

  private async ensureActivationOutboxEvent(
    tx: Prisma.TransactionClient,
    input: {
      idempotencyKey: string;
      payload: VehicleActivatedOutboxPayloadV1;
      vehicleId: string;
      organizationId: string;
      onboardingCaseId: string;
      activatedAt: Date;
    },
  ): Promise<void> {
    const eventId = randomUUID();
    try {
      await tx.vehicleRegistryLifecycleOutbox.create({
        data: {
          id: randomUUID(),
          eventId,
          eventType: 'VEHICLE_ACTIVATED',
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          payloadVersion: ACTIVATION_OUTBOX_PAYLOAD_VERSION,
          payload: input.payload as unknown as Prisma.InputJsonValue,
          occurredAt: input.activatedAt,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueViolation(error, ['idempotency_key'])) {
        throw error;
      }
      const existing = await tx.vehicleRegistryLifecycleOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!existing) {
        throw error;
      }
      const existingPayload = existing.payload as unknown as VehicleActivatedOutboxPayloadV1;
      const semanticMatch =
        existing.eventType === 'VEHICLE_ACTIVATED' &&
        existing.vehicleId === input.vehicleId &&
        existing.organizationId === input.organizationId &&
        existing.payloadVersion === ACTIVATION_OUTBOX_PAYLOAD_VERSION &&
        existingPayload?.onboardingCaseId === input.onboardingCaseId &&
        existingPayload?.vehicleId === input.vehicleId;
      if (!semanticMatch) {
        throw new VehicleOnboardingError(
          'OUTBOX_IDEMPOTENCY_CONFLICT',
          'Lifecycle outbox idempotency key belongs to a different activation',
        );
      }
    }
  }
}
