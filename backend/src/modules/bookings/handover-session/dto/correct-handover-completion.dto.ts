import type { CreateHandoverProtocolPayload } from '../handover.types';

export interface CorrectHandoverCompletionBodyDto extends CreateHandoverProtocolPayload {
  correctionReason: string;
}
