import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { TripDiBoundaryAdmissionService } from '../../trips/di-boundary-admission/trip-di-boundary-admission.service';
import { Ds4AssessmentProcessorServiceV1 } from './ds4-assessment-processor.service.v1';
import { Ds4AssessmentReadServiceV1 } from './ds4-assessment-read.service.v1';
import { Ds4AssessmentSchedulerV1 } from './ds4-assessment.scheduler.v1';
import { Ds4AssessmentServiceV1 } from './ds4-assessment.service.v1';

/**
 * DS4 Assessment L2 + Driving Impact V2 (PR-A). Flags OFF by default — no customer surface changes.
 */
@Module({
  imports: [PrismaModule, SchedulerLeaderElectionModule],
  providers: [
    TripDiBoundaryAdmissionService,
    Ds4AssessmentProcessorServiceV1,
    Ds4AssessmentServiceV1,
    Ds4AssessmentSchedulerV1,
    Ds4AssessmentReadServiceV1,
  ],
  exports: [Ds4AssessmentReadServiceV1, Ds4AssessmentServiceV1, Ds4AssessmentProcessorServiceV1],
})
export class DiV0Ds4AssessmentModule {}
