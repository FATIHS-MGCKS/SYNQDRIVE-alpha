import { Injectable } from '@nestjs/common';
import { FuelType, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
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
  buildTechnicalBaselineDraftFromMasterManualSpecs,
  masterManualSpecsNeedLegacyTireTreadPass,
  tryHvBatteryFromExtra,
} from './master-dimo-registration.mapper';
import {
  type MasterDimoRegistrationInput,
  masterDimoRegistrationIdempotencyKey,
} from './master-dimo-registration.types';
import { buildMasterDimoActivationFinalizeInput } from './master-dimo-registration-artifacts';
import { tryResumeMasterDimoRegistration } from './master-dimo-registration-resume';
import { resolveMasterDimoReadinessProduct } from './master-dimo-readiness-product';
import { loadMasterRegistrationVehicleResult } from './master-dimo-vehicle-result.loader';
import { assertMasterDimoRegistrationInputSupported } from './master-dimo-registration-input.policy';
import {
  computeMasterDimoRegistrationPayloadFingerprint,
  persistMasterDimoPayloadFingerprintOnCase,
} from './master-dimo-registration-payload-fingerprint';

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
    assertMasterDimoRegistrationInputSupported(input);

    const resumed = await tryResumeMasterDimoRegistration(this.prisma, input);
    if (resumed.kind === 'IDEMPOTENT_SUCCESS') {
      return resumed.result;
    }

    const idempotencyKey = masterDimoRegistrationIdempotencyKey(
      input.organizationId,
      input.dimoVehicleId,
    );

    const adopted = await runVehicleOnboardingHttp(() =>
      this.sourceAdoption.adoptProviderSource({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        provider: 'DIMO',
        sourceMirrorId: input.dimoVehicleId,
        idempotencyKey,
      }),
    );

    const resumedAfterClaim = await tryResumeMasterDimoRegistration(this.prisma, input);
    if (resumedAfterClaim.kind === 'IDEMPOTENT_SUCCESS') {
      return resumedAfterClaim.result;
    }

    return await this.registerUnderAdoptedCase(
      input,
      adopted.id,
      adopted.concurrencyToken ?? '',
    );
  }

  private async registerUnderAdoptedCase(
    input: MasterDimoRegistrationInput,
    caseId: string,
    concurrencyToken: string,
  ): Promise<RegisterFromDimoResult> {
    const earlyResume = await tryResumeMasterDimoRegistration(this.prisma, input);
    if (earlyResume.kind === 'IDEMPOTENT_SUCCESS') {
      return earlyResume.result;
    }

    const selectedProduct = await resolveMasterDimoReadinessProduct(
      this.prisma,
      input.organizationId,
    );

    let token: string | null = concurrencyToken || null;

    const adminBody = buildAdminBaselineDraftFromMasterInput(input);
    const adminResult = await runVehicleOnboardingHttp(() =>
      this.capture.updateAdminBaseline({
        organizationId: input.organizationId,
        caseId,
        actorUserId: input.actorUserId,
        body: adminBody,
        expectedConcurrencyToken: token,
      }),
    );
    token = adminResult.case.concurrencyToken;

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
        expectedConcurrencyToken: token,
      }),
    );
    token = technicalResult.case.concurrencyToken;

    await this.applyIdentityFuelOverrideIfNeeded(input, caseId);

    const resumeBeforeReadiness = await tryResumeMasterDimoRegistration(this.prisma, input);
    if (resumeBeforeReadiness.kind === 'IDEMPOTENT_SUCCESS') {
      return resumeBeforeReadiness.result;
    }

    const readinessSnapshot = await runVehicleOnboardingHttp(() =>
      this.readiness.evaluateAndSealReadiness({
        organizationId: input.organizationId,
        onboardingCaseId: caseId,
        selectedProduct,
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
          selectedProduct,
        },
      );
    }

    const resumeBeforeActivation = await tryResumeMasterDimoRegistration(this.prisma, input);
    if (resumeBeforeActivation.kind === 'IDEMPOTENT_SUCCESS') {
      return resumeBeforeActivation.result;
    }

    const activation = await runVehicleOnboardingHttp(() =>
      this.activation.activateVehicle({
        organizationId: input.organizationId,
        onboardingCaseId: caseId,
        actorUserId: input.actorUserId,
        masterRegistrationFinalize: buildMasterDimoActivationFinalizeInput(input),
      }),
    );

    const payloadFingerprint = computeMasterDimoRegistrationPayloadFingerprint(input);
    await persistMasterDimoPayloadFingerprintOnCase(this.prisma, caseId, payloadFingerprint);

    const vehicle = await loadMasterRegistrationVehicleResult(
      this.prisma,
      activation.vehicleId,
    );

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

  /** Exposed for VehiclesService post-activation tire tread enrichment (idempotent). */
  masterManualSpecsNeedLegacyTireTreadPass(input: MasterDimoRegistrationInput): boolean {
    return masterManualSpecsNeedLegacyTireTreadPass(input);
  }
}
