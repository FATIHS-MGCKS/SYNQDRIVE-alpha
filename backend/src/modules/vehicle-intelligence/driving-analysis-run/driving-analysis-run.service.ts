import { Injectable } from '@nestjs/common';
import { buildDrivingAnalysisInputFingerprint } from './driving-analysis-run.fingerprint';
import { DrivingAnalysisRunRepository } from './driving-analysis-run.repository';
import type {
  BeginDrivingAnalysisRunInput,
  CompleteDrivingAnalysisRunInput,
  DrivingAnalysisInputIdentity,
  FailDrivingAnalysisRunInput,
} from './driving-analysis-run.types';

@Injectable()
export class DrivingAnalysisRunService {
  constructor(private readonly repository: DrivingAnalysisRunRepository) {}

  buildInputFingerprint(identity: DrivingAnalysisInputIdentity): string {
    return buildDrivingAnalysisInputFingerprint(identity);
  }

  resolveOrBeginRun(input: BeginDrivingAnalysisRunInput) {
    return this.repository.resolveOrBeginRun(input);
  }

  completeRun(input: CompleteDrivingAnalysisRunInput) {
    return this.repository.markCompleted(input);
  }

  failRun(input: FailDrivingAnalysisRunInput) {
    return this.repository.markFailed(input);
  }

  findByTrip(organizationId: string, tripId: string) {
    return this.repository.findByTrip(organizationId, tripId);
  }

  findById(organizationId: string, runId: string) {
    return this.repository.findById(organizationId, runId);
  }
}
