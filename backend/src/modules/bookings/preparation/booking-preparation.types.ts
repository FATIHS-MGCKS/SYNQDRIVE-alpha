import type {
  BookingPreparationArtifactStatus,
  BookingPreparationArtifactType,
  BookingPreparationRecoveryAction,
} from './booking-preparation.constants';

export type BookingPreparationArtifactDto = {
  artifactType: BookingPreparationArtifactType;
  label: string;
  status: BookingPreparationArtifactStatus;
  required: boolean;
  blocksPickup: boolean;
  blocksReturn: boolean;
  lastError: string | null;
  lastErrorCode: string | null;
  lastAttemptAt: string | null;
  readyAt: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  recoverable: boolean;
  recoveryAction: BookingPreparationRecoveryAction | null;
};

export type BookingPreparationSnapshotDto = {
  bookingId: string;
  organizationId: string;
  overallStatus: BookingPreparationArtifactStatus;
  isOperationallyReady: boolean;
  missingRequiredCount: number;
  failedCount: number;
  processingCount: number;
  blocksPickup: boolean;
  blocksReturn: boolean;
  pickupBlockReasons: string[];
  artifacts: BookingPreparationArtifactDto[];
  updatedAt: string;
};

export type BookingPreparationRecoveryResult = {
  action: BookingPreparationRecoveryAction;
  artifactType: BookingPreparationArtifactType;
  deduplicated: boolean;
  status: 'QUEUED' | 'SKIPPED';
  message?: string;
};
