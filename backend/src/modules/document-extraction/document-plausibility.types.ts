export type PlausibilityOverallStatus = 'OK' | 'WARNING' | 'BLOCKER';
export type PlausibilityCheckStatus = 'INFO' | 'WARNING' | 'BLOCKER';
export type PlausibilitySource = 'DOCUMENT' | 'SYNQDRIVE_DB' | 'DIMO' | 'SYSTEM';

export interface PlausibilityCheck {
  code: string;
  status: PlausibilityCheckStatus;
  message: string;
  explanation?: string;
  fieldPaths?: string[];
  resolutionHint?: string;
  source: PlausibilitySource;
}

export function makePlausibilityCheck(params: {
  code: string;
  status: PlausibilityCheckStatus;
  explanation: string;
  fieldPaths?: string[];
  resolutionHint?: string;
  source: PlausibilitySource;
}): PlausibilityCheck {
  return {
    code: params.code,
    status: params.status,
    message: params.explanation,
    explanation: params.explanation,
    fieldPaths: params.fieldPaths,
    resolutionHint: params.resolutionHint,
    source: params.source,
  };
}

export function getUnresolvedPlausibilityBlockers(
  checks: Array<Pick<PlausibilityCheck, 'status' | 'code'>>,
): PlausibilityCheck[] {
  return checks.filter((check) => check.status === 'BLOCKER') as PlausibilityCheck[];
}

export function hasUnresolvedPlausibilityBlockers(
  checks: Array<Pick<PlausibilityCheck, 'status'>>,
): boolean {
  return checks.some((check) => check.status === 'BLOCKER');
}

export function resolveOverallPlausibilityStatus(
  checks: Array<Pick<PlausibilityCheck, 'status'>>,
): PlausibilityOverallStatus {
  if (checks.some((check) => check.status === 'BLOCKER')) return 'BLOCKER';
  if (checks.some((check) => check.status === 'WARNING')) return 'WARNING';
  return 'OK';
}
