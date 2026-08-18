export interface MasterAdminSmokeLifecycleState {
  version: number;
  userId: string;
  email: string;
  purpose: typeof import('./master-admin-smoke-lifecycle.constants').MASTER_ADMIN_SMOKE_PURPOSE;
  temporary: true;
  createdBy: typeof import('./master-admin-smoke-lifecycle.constants').MASTER_ADMIN_SMOKE_CREATED_BY;
  environment: string;
  createdAt: string;
  expiresAt: string;
}

export interface MasterAdminSmokeSetupResult {
  userId: string;
  email: string;
  expiresAt: string;
  credentialFilePath: string;
  reactivated: boolean;
}

export interface MasterAdminSmokeStatusResult {
  configured: boolean;
  state: MasterAdminSmokeLifecycleState | null;
  user: {
    id: string;
    email: string;
    status: string;
    platformRole: string;
    lastLoginAt: string | null;
  } | null;
  activeSessions: number;
  expired: boolean;
  credentialFilePresent: boolean;
}

export interface MasterAdminSmokeCleanupResult {
  userId: string | null;
  email: string;
  sessionsRevoked: number;
  accountDisabled: boolean;
  credentialDestroyed: boolean;
  stateCleared: boolean;
}
