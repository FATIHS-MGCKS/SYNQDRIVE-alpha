const STEP_UP_TOKEN_KEY = 'synqdrive_step_up_token';

export function getStepUpToken(): string | null {
  return sessionStorage.getItem(STEP_UP_TOKEN_KEY);
}

export function setStepUpToken(token: string | null): void {
  if (!token) sessionStorage.removeItem(STEP_UP_TOKEN_KEY);
  else sessionStorage.setItem(STEP_UP_TOKEN_KEY, token);
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

export type MfaStatus = {
  enrolled: boolean;
  factorTypes: string[];
  recoveryCodesRemaining: number;
  privilegedAccount: boolean;
  enrollmentRequired: boolean;
  stepUpEnforced: boolean;
};

export type ApiErrorBody = {
  code?: string;
  message?: string;
  action?: string;
};

export function isStepUpRequiredError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('STEP_UP_REQUIRED');
}

export function isEnrollmentRequiredError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('MFA_ENROLLMENT_REQUIRED');
}
