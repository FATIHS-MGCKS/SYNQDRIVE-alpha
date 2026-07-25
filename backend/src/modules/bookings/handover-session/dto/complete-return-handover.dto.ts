import type { CreateHandoverProtocolPayload } from '../../handover.types';

export interface CompleteReturnHandoverBodyDto extends CreateHandoverProtocolPayload {
  idempotencyKey: string;
  sessionId?: string | null;
  expectedVersion?: number | null;
  scopeOverrideReason?: string | null;
}
