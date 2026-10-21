import { ACTIVATION_OUTBOX_PAYLOAD_VERSION } from './vo-document-versions';

export interface VehicleActivatedOutboxPayloadV1 {
  version: typeof ACTIVATION_OUTBOX_PAYLOAD_VERSION;
  vehicleId: string;
  organizationId: string;
  onboardingCaseId: string;
  registryLifecycle: 'ACTIVE';
  activatedAt: string;
  sourceProviders: string[];
}
