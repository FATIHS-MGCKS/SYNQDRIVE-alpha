import { READINESS_SNAPSHOT_VERSION } from './vo-document-versions';

export interface VehicleOnboardingReadinessSnapshotV1 {
  version: typeof READINESS_SNAPSHOT_VERSION;
  profileVersion: string;
  sealedAt: string;
  sealedByUserId: string | null;
  schemaRequiredFieldsMet: boolean;
  attestationSource: 'TEST_FIXTURE' | 'VO4_READINESS_ENGINE';
  notes?: string;
}
