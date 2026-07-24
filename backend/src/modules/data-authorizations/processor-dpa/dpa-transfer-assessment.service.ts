import { Injectable } from '@nestjs/common';
import { DataTransferMechanism, TransferAssessmentStatus } from '@prisma/client';
import { isThirdCountry } from './processor-dpa.config';
import type { DpaTransferCountryDto } from './dto/processor-dpa.dto';

@Injectable()
export class DpaTransferAssessmentService {
  deriveStatus(
    transferCountries?: Array<Pick<DpaTransferCountryDto, 'countryCode' | 'transferMechanism' | 'assessmentStatus'>>,
  ): TransferAssessmentStatus {
    if (!transferCountries?.length) return TransferAssessmentStatus.NOT_ASSESSED;

    const thirdCountryRows = transferCountries.filter((tc) => isThirdCountry(tc.countryCode));
    if (thirdCountryRows.length === 0) return TransferAssessmentStatus.ASSESSED;

    if (thirdCountryRows.some((tc) => tc.transferMechanism === DataTransferMechanism.NOT_ASSESSED)) {
      return TransferAssessmentStatus.NOT_ASSESSED;
    }

    if (thirdCountryRows.some((tc) => tc.assessmentStatus === TransferAssessmentStatus.REQUIRES_REVIEW)) {
      return TransferAssessmentStatus.REQUIRES_REVIEW;
    }

    return TransferAssessmentStatus.ASSESSED;
  }

  summarize(agreement: {
    transferAssessmentStatus: TransferAssessmentStatus;
    transferCountries: Array<{
      countryCode: string;
      transferMechanism: DataTransferMechanism;
      assessmentStatus: TransferAssessmentStatus;
    }>;
  }) {
    const thirdCountryTransfers = agreement.transferCountries.filter((tc) => isThirdCountry(tc.countryCode));
    const missingAssessment = thirdCountryTransfers.filter(
      (tc) =>
        tc.transferMechanism === DataTransferMechanism.NOT_ASSESSED ||
        tc.assessmentStatus === TransferAssessmentStatus.NOT_ASSESSED,
    );

    return {
      transferAssessmentStatus: agreement.transferAssessmentStatus,
      thirdCountryCount: thirdCountryTransfers.length,
      missingAssessmentCount: missingAssessment.length,
      missingAssessmentVisible: missingAssessment.length > 0,
      countries: thirdCountryTransfers.map((tc) => ({
        countryCode: tc.countryCode,
        transferMechanism: tc.transferMechanism,
        assessmentStatus: tc.assessmentStatus,
        requiresReview: tc.assessmentStatus === TransferAssessmentStatus.REQUIRES_REVIEW,
      })),
    };
  }
}
