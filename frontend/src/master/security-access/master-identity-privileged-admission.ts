import { api } from '../../lib/api';
import {
  captureAuthRequestDispatchIdentity,
  type AuthRequestDispatchIdentity,
} from '../../lib/auth-api-transport';

export const MASTER_IDENTITY_STEP_UP_ACTION = 'MASTER_USER_MANAGEMENT';

export type MasterIdentityOnboardingMode = 'identity' | 'invite' | 'credential';

export type MasterIdentityCreatePendingOp = {
  kind: 'create';
  action: typeof MASTER_IDENTITY_STEP_UP_ACTION;
  dialogGeneration: number;
  operationKey: string;
  onboardingMode: MasterIdentityOnboardingMode;
  payload: Parameters<typeof api.admin.securityAccess.createUser>[0];
};

export type MasterIdentityProfilePendingOp = {
  kind: 'profile';
  action: typeof MASTER_IDENTITY_STEP_UP_ACTION;
  drawerGeneration: number;
  userId: string;
  operationKey: string;
  patch: Parameters<typeof api.admin.securityAccess.updateUserProfile>[1];
};

export type MasterIdentityPendingOp = MasterIdentityCreatePendingOp | MasterIdentityProfilePendingOp;

export function cloneIdentityPendingOp(op: MasterIdentityPendingOp): MasterIdentityPendingOp {
  if (op.kind === 'create') {
    return {
      ...op,
      payload: structuredClone(op.payload),
    };
  }
  return {
    ...op,
    patch: structuredClone(op.patch),
  };
}

export function authDispatchIdentityMatches(stored: AuthRequestDispatchIdentity): boolean {
  const current = captureAuthRequestDispatchIdentity();
  return current.sessionEpoch === stored.sessionEpoch && current.accessToken === stored.accessToken;
}

export async function executeIdentityPrivilegedMutation(op: MasterIdentityPendingOp): Promise<unknown> {
  if (op.kind === 'create') {
    return api.admin.securityAccess.createUser(op.payload);
  }
  return api.admin.securityAccess.updateUserProfile(op.userId, op.patch);
}