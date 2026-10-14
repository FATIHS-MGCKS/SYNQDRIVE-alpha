import { Injectable } from '@nestjs/common';
import {
  BatterySourceType,
  EnrichmentJobType,
  FuelType,
  Prisma,
  ProductSlug,
  type Vehicle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  acquirePgAdvisoryXactLock,
  vehicleDimoBindingLockKey,
} from '@shared/database/pg-advisory-lock.util';
import { VehicleOnboardingSourceAdoptionService } from '../services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingCaptureService } from '../services/vehicle-onboarding-capture.service';
import { VehicleOnboardingReadinessService } from '../services/vehicle-onboarding-readiness.service';
import { VehicleOnboardingActivationService } from '../services/vehicle-onboarding-activation.service';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { runVehicleOnboardingHttp } from '../http/vehicle-onboarding-http.util';
import { VEHICLE_IDENTITY_DRAFT_VERSION } from '../contracts/vo-document-versions';
import { parseValidatedIdentityDraft } from '../policy/persisted-contract.validation';
import { resolveFuelTypeStrict } from '../policy/activation-field-resolution';
import type { RegisterFromDimoResult } from '@modules/vehicles/dto/register-from-dimo-result.dto';
import {
  buildNoBrakePayloadResult,
  deriveRegistrationBrakeResult,
} from '@modules/vehicle-intelligence/brakes/registration-brake-outcome';
import {
  buildAdminBaselineDraftFromMasterInput,
  buildPostActivationVehiclePatch,
  buildTechnicalBaselineDraftFromMasterManualSpecs,
  hasLowVoltageBatteryManualSpec,
  masterManualSpecsNeedLegacyTireTreadPass,
  tryHvBatteryFromExtra,
} from './master-dimo-registration.mapper';
import {
  type MasterDimoRegistrationInput,
  masterDimoRegistrationIdempotencyKey,
} from './master-dimo-registration.types';
import {
  applyMasterPostActivationVehicleScalarsRaw,
  loadVehicleRowForMasterRegistrationResult,
} from './master-dimo-post-activation.persistence';

@Injectable()
export class MasterDimoCanonicalRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceAdoption: VehicleOnboardingSourceAdoptionService,
    private readonly capture: VehicleOnboardingCaptureService,
    private readonly readiness: VehicleOnboardingReadinessService,
    private readonly activation: VehicleOnboardingActivationService,
  ) {}

  async register(input: MasterDimoRegistrationInput): Promise<RegisterFromDimoResult> {
    const idempotencyKey = masterDimoRegistrationIdempotencyKey(
      input.organizationId,
      input.dimoVehicleId,
    );

    await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock(tx, vehicleDimoBindingLockKey(input.dimoVehicleId));
      const existingBinding = await tx.vehicle.findFirst({
        where: { dimoVehicleId: input.dimoVehicleId },
        select: { id: true, organizationId: true, registryLifecycle: true },
      });
      if (existingBinding) {
        throw new VehicleOnboardingError(
          'SOURCE_ALREADY_REGISTERED',
          'This DIMO vehicle is already linked to a fleet vehicle',
          {
            vehicleId: existingBinding.id,
            organizationId: existingBinding.organizationId,
            registryLifecycle: existingBinding.registryLifecycle,
          },
        );
      }
    });

    const adopted = await runVehicleOnboardingHttp(() =>
      this.sourceAdoption.adoptProviderSource({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        provider: 'DIMO',
        sourceMirrorId: input.dimoVehicleId,
        idempotencyKey,
      }),
    );

    const caseId = adopted.id;
    let concurrencyToken = adopted.concurrencyToken;

    const adminBody = buildAdminBaselineDraftFromMasterInput(input);
    const adminResult = await runVehicleOnboardingHttp(() =>
      this.capture.updateAdminBaseline({
        organizationId: input.organizationId,
        caseId,
        actorUserId: input.actorUserId,
        body: adminBody,
        expectedConcurrencyToken: concurrencyToken,
      }),
    );
    concurrencyToken = adminResult.case.concurrencyToken;

    const technicalDraft = buildTechnicalBaselineDraftFromMasterManualSpecs(input);
    const hv = tryHvBatteryFromExtra(input.extraData);
    if (hv) {
      technicalDraft.hvBatteryReference = hv;
    }

    const technicalResult = await runVehicleOnboardingHttp(() =>
      this.capture.updateTechnicalBaseline({
        organizationId: input.organizationId,
        caseId,
        actorUserId: input.actorUserId,
        body: technicalDraft,
        expectedConcurrencyToken: concurrencyToken,
      }),
    );
    concurrencyToken = technicalResult.case.concurrencyToken;

    await this.applyIdentityFuelOverrideIfNeeded(input, caseId);

    const readinessSnapshot = await runVehicleOnboardingHttp(() =>
      this.readiness.evaluateAndSealReadiness({
        organizationId: input.organizationId,
        onboardingCaseId: caseId,
        selectedProduct: ProductSlug.RENTAL,
        actorUserId: input.actorUserId,
      }),
    );

    if (readinessSnapshot.decision !== 'READY' || readinessSnapshot.blockingFailureCount > 0) {
      throw new VehicleOnboardingError(
        'READINESS_NOT_SEALED',
        'Master DIMO registration blocked by readiness gates',
        {
          decision: readinessSnapshot.decision,
          blockingFailureCount: readinessSnapshot.blockingFailureCount,
        },
      );
    }

    const activation = await runVehicleOnboardingHttp(() =>
      this.activation.activateVehicle({
        organizationId: input.organizationId,
        onboardingCaseId: caseId,
        actorUserId: input.actorUserId,
      }),
    );

    const scalarPatch = buildPostActivationVehiclePatch(input);
    await applyMasterPostActivationVehicleScalarsRaw(
      this.prisma,
      activation.vehicleId,
      scalarPatch,
    );
    const vehicle = await loadVehicleRowForMasterRegistrationResult(
      this.prisma,
      activation.vehicleId,
    );

    await this.applyLowVoltageBatterySpecIfNeeded(input, vehicle.id);
    await this.enqueueBatteryEnrichmentJob(vehicle.id);

    const brakeRegistration = input.manualSpecs?.brakes
      ? deriveRegistrationBrakeResult({
          rawBrakes: input.manualSpecs.brakes,
          specCreated: true,
          initialized: false,
        })
      : buildNoBrakePayloadResult();

    return { vehicle, brakeRegistration };
  }

  private async applyIdentityFuelOverrideIfNeeded(
    input: MasterDimoRegistrationInput,
    caseId: string,
  ): Promise<void> {
    const fuelRaw = input.extraData?.fuelType;
    if (fuelRaw == null || String(fuelRaw).trim() === '') {
      return;
    }
    const fuelType = resolveFuelTypeStrict(String(fuelRaw)) as FuelType;
    await this.prisma.$transaction(async (tx) => {
      const caseRow = await tx.vehicleOnboardingCase.findFirst({
        where: { id: caseId, organizationId: input.organizationId },
      });
      if (!caseRow) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found');
      }
      const identity = parseValidatedIdentityDraft(caseRow);
      if (identity.fuelType === fuelType) {
        return;
      }
      await tx.vehicleOnboardingCase.update({
        where: { id: caseId },
        data: {
          draftIdentityJson: {
            ...identity,
            version: VEHICLE_IDENTITY_DRAFT_VERSION,
            fuelType,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async applyLowVoltageBatterySpecIfNeeded(
    input: MasterDimoRegistrationInput,
    vehicleId: string,
  ): Promise<void> {
    if (!hasLowVoltageBatteryManualSpec(input)) {
      return;
    }
    const b = input.manualSpecs!.battery!;
    await this.prisma.vehicleBatterySpec.create({
      data: {
        vehicleId,
        batteryType: b.batteryType?.trim() || null,
        batteryAmpere: b.batteryAmpere ?? null,
        batteryVolt: b.batteryVolt ?? null,
        sourceType: BatterySourceType.MANUAL,
        sourceConfidence: 1,
      },
    });
  }

  private async enqueueBatteryEnrichmentJob(vehicleId: string): Promise<void> {
    await this.prisma.vehicleEnrichmentJob.create({
      data: {
        vehicle: { connect: { id: vehicleId } },
        jobType: EnrichmentJobType.BATTERY,
        status: 'PENDING',
      },
    });
  }

  /** Exposed for VehiclesService post-activation tire tread enrichment. */
  masterManualSpecsNeedLegacyTireTreadPass(input: MasterDimoRegistrationInput): boolean {
    return masterManualSpecsNeedLegacyTireTreadPass(input);
  }
}
