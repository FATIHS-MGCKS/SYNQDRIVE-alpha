export type OperatorConnectivityStateId =
  | 'auth-expired'
  | 'browser-offline'
  | 'backend-unreachable'
  | 'upload-failed'
  | 'draft-save-failed'
  | 'connection-restored'
  | 'api-partial'
  | 'upload-service-degraded'
  | 'queue-pending'
  | 'syncing'
  | 'synced';

export type OperatorConnectivityTone = 'error' | 'watch' | 'info' | 'success';

export interface OperatorConnectivitySignals {
  browserOnline: boolean;
  /** `null` until the first health probe completes. */
  backendReachable: boolean | null;
  authExpired: boolean;
  apiPartialFailure: boolean;
  uploadServiceDegraded: boolean;
  draftSaveFailed: boolean;
  draftBufferedLocally: boolean;
  draftSyncing: boolean;
  queuePendingCount: number;
  queueFailedCount: number;
  queueBlockingFailed: boolean;
  queueUploadingCount: number;
  recentlyReconnected: boolean;
}

export interface OperatorConnectivityBannerModel {
  stateId: OperatorConnectivityStateId | null;
  tone: OperatorConnectivityTone;
  message: string;
  visible: boolean;
  announce: boolean;
}

export const OPERATOR_CONNECTIVITY_BANNER_SLOT_PX = 36;
