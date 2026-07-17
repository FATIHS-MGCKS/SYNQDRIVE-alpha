export type BrakeLifecycleKind =
  | 'inspection_only'
  | 'pads_service'
  | 'discs_service'
  | 'brake_fluid_service'
  | 'full_brake_service';

export type BrakeLifecycleSource = 'manual' | 'ai_document' | 'api' | 'manual_registration';

export type BrakeLifecycleScope =
  | 'front_pads'
  | 'rear_pads'
  | 'front_discs'
  | 'rear_discs';

export interface RecordBrakeServiceInput {
  vehicleId: string;
  organizationId?: string;
  serviceDate: string;
  odometerKm?: number;
  workshopName?: string;
  notes?: string;
  documentUrl?: string;
  source?: BrakeLifecycleSource;
  kind?: BrakeLifecycleKind;
  scope?: BrakeLifecycleScope[];
  measured?: {
    frontPadMm?: number;
    rearPadMm?: number;
    frontDiscMm?: number;
    rearDiscMm?: number;
  };
  initializeIfPossible?: boolean;
  idempotencyKey?: string;
  clientRequestId?: string;
  externalDocumentId?: string;
  actorUserId?: string;
}

export interface RecordBrakeServiceResult {
  serviceEventId: string;
  lifecycleApplied: boolean;
  initialized: boolean;
  status: 'initialized' | 'history_only';
  message: string;
  applicationId?: string;
  replayed?: boolean;
}
