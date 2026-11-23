import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleOnboardingSourceAdoptionService } from '../services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingCaptureService } from '../services/vehicle-onboarding-capture.service';
import { VehicleOnboardingReadinessService } from '../services/vehicle-onboarding-readiness.service';
import { VehicleOnboardingActivationService } from '../services/vehicle-onboarding-activation.service';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { runVehicleOnboardingHttp } from '../http/vehicle-onboarding-http.util';
import { resolveMasterDimoReadinessProduct } from '../master-dimo/master-dimo-readiness-product';
import {
  type HmOnlyCanonicalOrchestrationInput,
  type HmOnlyCanonicalOrchestrationResult,
  hmOnlyCanonicalRegistrationIdempotencyKey,
} from './hm-only-canonical-registration.types';
import {
  buildHmOnlyAdminBaselineDraft,
  buildHmOnlyTechnicalBaselineDraft,
} from './hm-only-canonical-registration.mapper';
import {
  assertHmOnlyCanonicalProviderRecord,
  buildHmOnlySuccessResult,
  tryResumeHmOnlyCanonicalRegistration,
} from './hm-only-canonical-registration-resume';

@Injectable()
export class HmOnlyCanonicalRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceAdoption: VehicleOnboardingSourceAdoptionService,
    private readonly capture: VehicleOnboardingCaptureService,
    private readonly readiness: VehicleOnboardingReadinessService,
    private readonly activation: VehicleOnboardingActivationService,
  ) {}

  async register(
    input: HmOnlyCanonicalOrchestrationInput,
  ): Promise<HmOnlyCanonicalOrchestrationResult> {
    const hmRecord = await assertHmOnlyCanonicalProviderRecord(this.prisma, input);

    const resumed = await tryResumeHmOnlyCanonicalRegistration(this.prisma, input, hmRecord);
    if (resumed.kind === 'IDEMPOTENT_SUCCESS') {
      return resumed.result;
    }

    const idempotencyKey = hmOnlyCanonicalRegistrationIdempotencyKey(
      input.dto.organizationId,
      input.dto.hmVehicleId,
    );

    const adopted = await runVehicleOnboardingHttp(() =>
      this.sourceAdoption.adoptProviderSource({
        organizationId: input.dto.organizationId,
        actorUserId: input.actorUserId,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: input.dto.hmVehicleId,
        idempotencyKey,
      }),
    );

    const resumedAfterClaim = await tryResumeHmOnlyCanonicalRegistration(
      this.prisma,
      input,
      hmRecord,
    );
    if (resumedAfterClaim.kind === 'IDEMPOTENT_SUCCESS') {
      return resumedAfterClaim.result;
    }

    return this.registerUnderAdoptedCase(input, adopted.id, adopted.concurrencyToken ?? '');
  }

  private async registerUnderAdoptedCase(
    input: HmOnlyCanonicalOrchestrationInput,
    caseId: string,
    concurrencyToken: string,
  ): Promise<HmOnlyCanonicalOrchestrationResult> {
    const hmRecord = await this.prisma.highMobilityVehicle.findUnique({
      where: { id: input.dto.hmVehicleId },
    });
    if (!hmRecord) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source not available');
    }

    const earlyResume = await tryResumeHmOnlyCanonicalRegistration(this.prisma, input, hmRecord);
    if (earlyResume.kind === 'IDEMPOTENT_SUCCESS') {
      return earlyResume.result;
    }

    const selectedProduct = await resolveMasterDimoReadinessProduct(
      this.prisma,
      input.dto.organizationId,
    );

    let token: string | null = concurrencyToken || null;

    const adminBody = buildHmOnlyAdminBaselineDraft(input.dto, hmRecord);
    const adminResult = await runVehicleOnboardingHttp(() =>
      this.capture.updateAdminBaseline({
        organizationId: input.dto.organizationId,
        caseId,
        actorUserId: input.actorUserId,
        body: adminBody,
        expectedConcurrencyToken: token,
      }),
    );
    token = adminResult.case.concurrencyToken;

    const technicalDraft = buildHmOnlyTechnicalBaselineDraft(input.dto);
    const technicalResult = await runVehicleOnboardingHttp(() =>
      this.capture.updateTechnicalBaseline({
        organizationId: input.dto.organizationId,
        caseId,
        actorUserId: input.actorUserId,
        body: technicalDraft,
        expectedConcurrencyToken: token,
      }),
    );
    token = technicalResult.case.concurrencyToken;

    const resumeBeforeReadiness = await tryResumeHmOnlyCanonicalRegistration(
      this.prisma,
      input,
      hmRecord,
    );
    if (resumeBeforeReadiness.kind === 'IDEMPOTENT_SUCCESS') {
      return resumeBeforeReadiness.result;
    }

    const readinessSnapshot = await runVehicleOnboardingHttp(() =>
      this.readiness.evaluateAndSealReadiness({
        organizationId: input.dto.organizationId,
        onboardingCaseId: caseId,
        selectedProduct,
        actorUserId: input.actorUserId,
      }),
    );

    if (readinessSnapshot.decision !== 'READY' || readinessSnapshot.blockingFailureCount > 0) {
      throw new VehicleOnboardingError(
        'READINESS_NOT_SEALED',
        'HM_ONLY canonical registration blocked by readiness gates',
        {
          decision: readinessSnapshot.decision,
          blockingFailureCount: readinessSnapshot.blockingFailureCount,
          selectedProduct,
        },
      );
    }

    const resumeBeforeActivation = await tryResumeHmOnlyCanonicalRegistration(
      this.prisma,
      input,
      hmRecord,
    );
    if (resumeBeforeActivation.kind === 'IDEMPOTENT_SUCCESS') {
      return resumeBeforeActivation.result;
    }

    const activation = await runVehicleOnboardingHttp(() =>
      this.activation.activateVehicle({
        organizationId: input.dto.organizationId,
        onboardingCaseId: caseId,
        actorUserId: input.actorUserId,
      }),
    );

    return buildHmOnlySuccessResult(
      activation.vehicleId,
      input.dto.hmVehicleId,
      hmRecord.vin,
    );
  }
}