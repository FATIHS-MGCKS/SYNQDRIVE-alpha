import { Logger } from '@nestjs/common';

const log = new Logger('VehicleOnboarding');

export function logCaseOpened(caseId: string, organizationId: string, provider: string): void {
  log.log(JSON.stringify({ op: 'case_opened', caseId, organizationId, provider }));
}

export function logCaseResumed(caseId: string, organizationId: string): void {
  log.log(JSON.stringify({ op: 'case_resumed', caseId, organizationId }));
}

export function logSourceAttached(caseId: string, provider: string): void {
  log.log(JSON.stringify({ op: 'source_attached', caseId, provider }));
}

export function logActivationAttempt(caseId: string, organizationId: string): void {
  log.log(JSON.stringify({ op: 'activation_attempt', caseId, organizationId }));
}

export function logActivationSuccess(caseId: string, vehicleId: string): void {
  log.log(JSON.stringify({ op: 'activation_success', caseId, vehicleId }));
}

export function logActivationConflict(caseId: string, code: string): void {
  log.warn(JSON.stringify({ op: 'activation_conflict', caseId, code }));
}

export function logActivationRollback(caseId: string, stage: string): void {
  log.warn(JSON.stringify({ op: 'activation_rollback', caseId, stage }));
}
