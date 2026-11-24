import type { HighMobilityVehicle } from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  evaluateHmOnlyCanonicalResumeAdmissionVerdict,
  evaluateHmOnlyProviderAdmissionBlockers,
} from './hm-only-canonical-provider-admission.authority';
import type { HmCanonicalAdmissionVerdict } from './hm-only-canonical-readiness-observation.types';

export interface HmCanonicalAdmissionClassification {
  verdict: HmCanonicalAdmissionVerdict;
  blockerReasonCodes: string[];
}

export async function classifyHmOnlyCanonicalAdmission(
  prisma: PrismaService,
  input: {
    dto: RegisterHmOnlyVehicleDto;
    access: { isMasterAdmin: boolean };
    hmRecord: HighMobilityVehicle;
  },
): Promise<HmCanonicalAdmissionClassification> {
  const blockers = await evaluateHmOnlyProviderAdmissionBlockers(prisma, input);

  if (blockers.length > 0) {
    return { verdict: 'CANONICAL_ADMISSION_BLOCKED', blockerReasonCodes: blockers };
  }

  const resume = await evaluateHmOnlyCanonicalResumeAdmissionVerdict(prisma, {
    dto: input.dto,
    hmRecord: input.hmRecord,
  });

  if (resume.verdict !== 'NOT_APPLICABLE') {
    return {
      verdict: resume.verdict,
      blockerReasonCodes: [...resume.blockers],
    };
  }

  return { verdict: 'CANONICAL_ADMISSION_ELIGIBLE', blockerReasonCodes: [] };
}