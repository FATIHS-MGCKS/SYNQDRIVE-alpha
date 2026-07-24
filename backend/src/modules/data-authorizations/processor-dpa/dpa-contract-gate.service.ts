import { Injectable } from '@nestjs/common';
import {
  DataProcessingAgreementStatus,
  DataTransferMechanism,
  TransferAssessmentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { POLICY_RESOLVER_PROCESSOR_TYPE } from '../policy-resolver/policy-resolver.constants';
import { isThirdCountry, PROCESSOR_DPA_CONFIG } from './processor-dpa.config';

export interface DpaGateEvaluation {
  allowed: boolean;
  warnings: string[];
  blockingReasons: string[];
  matchedAgreementId?: string;
}

@Injectable()
export class DpaContractGateService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateForProcessing(input: {
    organizationId: string;
    processingActivityId: string;
    processorType: string;
    processorId?: string | null;
    at?: Date;
  }): Promise<DpaGateEvaluation> {
    const at = input.at ?? new Date();
    const warnings: string[] = [];
    const blockingReasons: string[] = [];

    const needsContract =
      PROCESSOR_DPA_CONFIG.requireValidContractForExternalProcessing &&
      (input.processorType === POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER ||
        input.processorType === POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM);

    const agreements = await this.prisma.dataProcessingAgreement.findMany({
      where: {
        organizationId: input.organizationId,
        isCurrentVersion: true,
        OR: [
          { processingActivityId: input.processingActivityId },
          {
            linkedActivities: {
              some: { processingActivityId: input.processingActivityId },
            },
          },
        ],
      },
      include: {
        transferCountries: true,
        subprocessors: true,
      },
    });

    if (!needsContract) {
      return { allowed: true, warnings, blockingReasons };
    }

    if (agreements.length === 0) {
      blockingReasons.push('DPA_MISSING');
      return { allowed: false, warnings, blockingReasons };
    }

    const active = agreements.filter((a) => a.status === DataProcessingAgreementStatus.ACTIVE);
    if (active.length === 0) {
      blockingReasons.push('DPA_NOT_ACTIVE');
      return { allowed: false, warnings, blockingReasons, matchedAgreementId: agreements[0]?.id };
    }

    const match =
      active.find(
        (a) =>
          (!input.processorId || a.processorName === input.processorId) &&
          (!a.effectiveFrom || a.effectiveFrom.getTime() <= at.getTime()) &&
          (!a.effectiveUntil || a.effectiveUntil.getTime() > at.getTime()) &&
          a.signedAt != null,
      ) ?? active[0];

    if (!match.signedAt) {
      blockingReasons.push('DPA_NOT_ACTIVE');
      return { allowed: false, warnings, blockingReasons, matchedAgreementId: match.id };
    }

    if (match.effectiveUntil && match.effectiveUntil.getTime() <= at.getTime()) {
      const code = 'DPA_EXPIRED';
      if (PROCESSOR_DPA_CONFIG.expiredContractMode === 'block') {
        blockingReasons.push(code);
      } else {
        warnings.push(code);
      }
    }

    for (const tc of match.transferCountries) {
      if (!isThirdCountry(tc.countryCode)) continue;
      if (tc.transferMechanism === DataTransferMechanism.NOT_ASSESSED) {
        const code = 'TRANSFER_NOT_ASSESSED';
        if (PROCESSOR_DPA_CONFIG.transferNotAssessedMode === 'block') {
          blockingReasons.push(code);
        } else {
          warnings.push(code);
        }
      }
    }

    if (match.transferAssessmentStatus === TransferAssessmentStatus.NOT_ASSESSED && match.transferCountries.some((tc) => isThirdCountry(tc.countryCode))) {
      warnings.push('DPA_TRANSFER_ASSESSMENT_INCOMPLETE');
    }

    if (match.subprocessors.some((s) => s.reviewRequired && s.status === 'PENDING_REVIEW')) {
      warnings.push('DPA_SUBPROCESSOR_REVIEW_PENDING');
    }

    return {
      allowed: blockingReasons.length === 0,
      warnings,
      blockingReasons,
      matchedAgreementId: match.id,
    };
  }
}
