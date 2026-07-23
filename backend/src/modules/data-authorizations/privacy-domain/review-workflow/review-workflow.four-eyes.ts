import { DataProcessingReviewStepType } from '@prisma/client';

export function assertFourEyesSeparation(params: {
  fourEyesEnabled: boolean;
  requesterUserId: string;
  actorUserId: string;
  stepType: DataProcessingReviewStepType;
}): void {
  if (!params.fourEyesEnabled) return;
  if (params.stepType !== DataProcessingReviewStepType.FINAL_APPROVAL) return;
  if (params.requesterUserId === params.actorUserId) {
    throw new Error('data_processing_four_eyes_violation');
  }
}
