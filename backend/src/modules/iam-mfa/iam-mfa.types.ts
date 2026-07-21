import { AuthMethod } from '@shared/auth/auth-session-claims.types';
import { StepUpActionCode } from './iam-mfa.policy';

export interface MfaStatusResult {
  enrolled: boolean;
  factorTypes: string[];
  recoveryCodesRemaining: number;
  privilegedAccount: boolean;
  enrollmentRequired: boolean;
  stepUpEnforced: boolean;
}

export interface TotpEnrollmentStartResult {
  factorId: string;
  otpauthUrl: string;
  secretPreview: string;
}

export interface TotpEnrollmentConfirmResult {
  enrolled: true;
  recoveryCodes: string[];
}

export interface MfaChallengeResult {
  accessToken: string;
  expiresIn: string;
  stepUpToken: string;
  stepUpExpiresAt: string;
  assuranceLevel: number;
  authMethods: AuthMethod[];
  mfaAuthenticatedAt: string;
}

export interface MfaResetResult {
  reset: true;
  sessionsRevoked: number;
  factorsRemoved: number;
  recoveryCodesRemoved: number;
}

export interface AdminMfaResetInput {
  organizationId: string;
  targetUserId: string;
  actorUserId: string;
  idempotencyKey: string;
  reason?: string;
}
